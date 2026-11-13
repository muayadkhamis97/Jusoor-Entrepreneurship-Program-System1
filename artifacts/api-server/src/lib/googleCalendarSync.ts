import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import {
  businessesTable,
  db,
  googleCalendarMeetingsTable,
  pool,
  staffMembersTable,
  supportTable,
  type PoolClient,
} from "@workspace/db";
import { logGoogleCalendarSyncSkipped, logger } from "./logger";
import {
  fetchWithTimeout,
  googleCalendarRevokeTimeoutMs,
  isOutboundNetworkFailure,
} from "./outbound-http";

const googleCalendarEventsScope = "https://www.googleapis.com/auth/calendar.events.owned.readonly";
const calendarApiBase = "https://www.googleapis.com/calendar/v3";
const workerIntervalMs = 5 * 60_000;
const googleCalendarRequestTimeoutMs = 30_000;
const maxPagesPerSync = 20;
// Two-key PostgreSQL advisory locks: a fixed namespace plus mentor staff ID.
const googleCalendarSyncLockNamespace = 0x4a43414c;
const googleCalendarSyncSkipWindowMs = 10 * 60_000;
const genericMeetingName = "Mentoring session";
export type GoogleCalendarSyncClient = PoolClient;
const googleCalendarEventFields =
  "nextPageToken,nextSyncToken,items(id,status,updated,start(dateTime,timeZone),end(dateTime,timeZone),attendees(email),organizer(email))";

type GoogleEvent = {
  id?: unknown;
  status?: unknown;
  updated?: unknown;
  start?: { dateTime?: unknown; timeZone?: unknown };
  end?: { dateTime?: unknown; timeZone?: unknown };
  attendees?: Array<{ email?: unknown }>;
  organizer?: { email?: unknown };
};

type GoogleEventsPage = {
  items?: unknown;
  nextPageToken?: unknown;
  nextSyncToken?: unknown;
};

type AssignedBusiness = { id: number; email: string };
type GoogleCalendarConnectionSnapshot = {
  accountEmail: string;
  refreshTokenEncrypted: string;
};

export class GoogleCalendarSyncError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly requiresReauthorization = false,
  ) {
    super(message);
    this.name = "GoogleCalendarSyncError";
  }
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new GoogleCalendarSyncError("Google Calendar token encryption is not configured.");
  return createHash("sha256").update(`${secret}:google-calendar-token`).digest();
}

export function encryptGoogleCalendarToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptGoogleCalendarToken(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function revokeGoogleCalendarAuthorization(
  encryptedRefreshToken: string | null | undefined,
  encryptedAccessToken: string | null | undefined,
): Promise<boolean> {
  const encryptedToken = encryptedRefreshToken || encryptedAccessToken;
  if (!encryptedToken) return true;

  const token = decryptGoogleCalendarToken(encryptedToken);
  if (!token) {
    throw new GoogleCalendarSyncError(
      "Google Calendar access could not be revoked. Your connection was not changed.",
      502,
    );
  }

  let response: Response;
  try {
    response = await fetchWithTimeout("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token }),
    }, googleCalendarRevokeTimeoutMs);
  } catch (error) {
    if (isOutboundNetworkFailure(error)) return false;
    throw new GoogleCalendarSyncError(
      "Google Calendar access could not be revoked. Your connection was not changed.",
      502,
    );
  }

  if (!response.ok) {
    throw new GoogleCalendarSyncError(
      "Google Calendar access could not be revoked. Your connection was not changed.",
      502,
    );
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvent(value: unknown): GoogleEvent | null {
  if (!isRecord(value)) return null;
  return value as GoogleEvent;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

function buildBusinessEmailMatches(businesses: AssignedBusiness[]): Map<string, number | null> {
  const matches = new Map<string, number | null>();
  for (const business of businesses) {
    const email = normalizeEmail(business.email);
    if (!email) continue;
    const existing = matches.get(email);
    if (existing === undefined) matches.set(email, business.id);
    else if (existing !== business.id) matches.set(email, null);
  }
  return matches;
}

export function findGoogleCalendarBusinessMatch(
  event: GoogleEvent,
  mentorEmail: string,
  businesses: AssignedBusiness[],
): number | null {
  const organizer = normalizeEmail(event.organizer?.email);
  if (!organizer || organizer !== normalizeEmail(mentorEmail) || !Array.isArray(event.attendees)) return null;
  const matchesByEmail = buildBusinessEmailMatches(businesses);
  const businessIds = new Set<number>();
  for (const attendee of event.attendees) {
    const email = normalizeEmail(attendee?.email);
    if (!email || email === organizer) continue;
    const businessId = matchesByEmail.get(email);
    if (businessId !== undefined && businessId !== null) businessIds.add(businessId);
    else if (businessId === null) return null;
  }
  return businessIds.size === 1 ? [...businessIds][0]! : null;
}

export async function refreshGoogleAccessToken(staff: {
  id: number;
  googleCalendarAccessTokenEncrypted: string | null;
  googleCalendarAccessTokenExpiresAt: Date | null;
  googleCalendarRefreshTokenEncrypted: string | null;
}): Promise<string> {
  const cachedAccessToken = decryptGoogleCalendarToken(staff.googleCalendarAccessTokenEncrypted);
  if (
    cachedAccessToken &&
    staff.googleCalendarAccessTokenExpiresAt &&
    staff.googleCalendarAccessTokenExpiresAt.getTime() > Date.now() + 60_000
  ) return cachedAccessToken;

  const encryptedRefreshToken = staff.googleCalendarRefreshTokenEncrypted;
  if (staff.googleCalendarAccessTokenEncrypted) {
    await db.update(staffMembersTable).set({
      googleCalendarAccessTokenEncrypted: null,
      googleCalendarAccessTokenExpiresAt: null,
    }).where(and(
      eq(staffMembersTable.id, staff.id),
      ...(encryptedRefreshToken ? [eq(staffMembersTable.googleCalendarRefreshTokenEncrypted, encryptedRefreshToken)] : []),
    ));
  }
  const refreshToken = decryptGoogleCalendarToken(staff.googleCalendarRefreshTokenEncrypted);
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!refreshToken || !encryptedRefreshToken || !clientId || !clientSecret) {
    throw new GoogleCalendarSyncError("Google Calendar connection needs to be authorized again.", undefined, true);
  }

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(googleCalendarRequestTimeoutMs),
    });
  } catch {
    throw new GoogleCalendarSyncError("Google Calendar authorization could not be refreshed.");
  }
  const data = await response.json().catch(() => ({})) as {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    error?: unknown;
  };
  if (!response.ok || typeof data.access_token !== "string" || !data.access_token ||
      typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in)) {
    throw new GoogleCalendarSyncError(
      "Google Calendar authorization could not be refreshed.",
      response.status,
      data.error === "invalid_grant",
    );
  }

  const refreshedAt = new Date();
  const [updated] = await db.update(staffMembersTable).set({
    googleCalendarAccessTokenEncrypted: encryptGoogleCalendarToken(data.access_token),
    googleCalendarAccessTokenExpiresAt: new Date(refreshedAt.getTime() + data.expires_in * 1000),
    ...(typeof data.refresh_token === "string" && data.refresh_token
      ? { googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken(data.refresh_token) }
      : {}),
  }).where(and(
    eq(staffMembersTable.id, staff.id),
    eq(staffMembersTable.googleCalendarRefreshTokenEncrypted, encryptedRefreshToken),
  )).returning({ id: staffMembersTable.id });
  if (!updated) {
    throw new GoogleCalendarSyncError("Google Calendar connection changed during sync.");
  }
  return data.access_token;
}

export async function fetchCalendarPage(
  accessToken: string,
  syncToken: string | null,
  pageToken?: string,
): Promise<GoogleEventsPage> {
  const url = new URL(`${calendarApiBase}/calendars/primary/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("fields", googleCalendarEventFields);
  if (syncToken) url.searchParams.set("syncToken", syncToken);
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(googleCalendarRequestTimeoutMs),
    });
  } catch {
    throw new GoogleCalendarSyncError("Google Calendar events could not be retrieved.");
  }
  if (response.status === 410 && syncToken) throw new GoogleCalendarSyncError("Google Calendar sync token expired.", 410);
  if (!response.ok) {
    throw new GoogleCalendarSyncError(
      "Google Calendar events could not be retrieved.",
      response.status,
      response.status === 401,
    );
  }
  const page = await response.json().catch(() => null);
  if (!isRecord(page)) throw new GoogleCalendarSyncError("Google Calendar returned an invalid event response.");
  return page as GoogleEventsPage;
}

async function getAssignedBusinesses(mentorStaffId: number): Promise<AssignedBusiness[]> {
  const rows = await db.select({
    id: businessesTable.id,
    email: businessesTable.email,
  }).from(businessesTable)
    .innerJoin(supportTable, and(
      eq(supportTable.businessId, businessesTable.id),
      eq(supportTable.mentorStaffId, mentorStaffId),
      eq(supportTable.type, "mentor"),
    ));
  return rows;
}

async function saveGoogleEvent(
  mentorStaffId: number,
  mentorEmail: string,
  event: GoogleEvent,
  businesses: AssignedBusiness[],
): Promise<boolean> {
  if (typeof event.id !== "string" || !event.id) return false;
  const googleEventId = event.id;
  const changedAt = typeof event.updated === "string" ? new Date(event.updated) : new Date();
  const lastEventAt = Number.isNaN(changedAt.getTime()) ? new Date() : changedAt;

  const cancelSavedEvent = async () => {
    await db.update(googleCalendarMeetingsTable).set({
      status: "cancelled",
      lastEventAt,
      updatedAt: new Date(),
    }).where(and(
      eq(googleCalendarMeetingsTable.mentorStaffId, mentorStaffId),
      eq(googleCalendarMeetingsTable.googleEventId, googleEventId),
      lt(googleCalendarMeetingsTable.lastEventAt, lastEventAt),
    ));
  };

  if (event.status === "cancelled") {
    await cancelSavedEvent();
    return true;
  }
  if (event.status !== "confirmed" && event.status !== undefined) {
    await cancelSavedEvent();
    return false;
  }

  const businessId = findGoogleCalendarBusinessMatch(event, mentorEmail, businesses);
  const startsAt = typeof event.start?.dateTime === "string" ? new Date(event.start.dateTime) : null;
  const endsAt = typeof event.end?.dateTime === "string" ? new Date(event.end.dateTime) : null;
  if (
    !businessId ||
    !startsAt || Number.isNaN(startsAt.getTime()) ||
    !endsAt || Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    await cancelSavedEvent();
    return false;
  }

  await db.insert(googleCalendarMeetingsTable).values({
    businessId,
    mentorStaffId,
    googleEventId,
    startsAt,
    endsAt,
    timezone: typeof event.start?.timeZone === "string" ? event.start.timeZone.slice(0, 100) :
      typeof event.end?.timeZone === "string" ? event.end.timeZone.slice(0, 100) : null,
    status: "confirmed",
    lastEventAt,
  }).onConflictDoUpdate({
    target: [googleCalendarMeetingsTable.mentorStaffId, googleCalendarMeetingsTable.googleEventId],
    set: {
      businessId,
      startsAt,
      endsAt,
      timezone: typeof event.start?.timeZone === "string" ? event.start.timeZone.slice(0, 100) :
        typeof event.end?.timeZone === "string" ? event.end.timeZone.slice(0, 100) : null,
      status: "confirmed",
      lastEventAt,
      updatedAt: new Date(),
    },
    setWhere: lt(googleCalendarMeetingsTable.lastEventAt, lastEventAt),
  });
  return true;
}

async function fetchAndStoreEvents(
  mentor: {
    id: number;
    googleCalendarAccountEmail: string | null;
    googleCalendarRefreshTokenEncrypted: string;
    googleCalendarSyncToken: string | null;
  },
  accessToken: string,
): Promise<{ processed: number; matched: number }> {
  const mentorEmail = mentor.googleCalendarAccountEmail;
  if (!mentorEmail) throw new GoogleCalendarSyncError("Google Calendar mentor account email is missing.");
  const businesses = await getAssignedBusinesses(mentor.id);
  let syncToken = mentor.googleCalendarSyncToken;
  let pageToken: string | undefined;
  let pages = 0;
  let processed = 0;
  let matched = 0;
  let nextSyncToken: string | null = null;

  while (true) {
    if (++pages > maxPagesPerSync) {
      throw new GoogleCalendarSyncError("Google Calendar returned too many pages; sync will retry without advancing.");
    }
    let page: GoogleEventsPage;
    try {
      page = await fetchCalendarPage(accessToken, syncToken, pageToken);
    } catch (error) {
      if (!(error instanceof GoogleCalendarSyncError) || error.statusCode !== 410 || !syncToken) throw error;
      syncToken = null;
      pageToken = undefined;
      pages = 0;
      processed = 0;
      matched = 0;
      nextSyncToken = null;
      continue;
    }
    if (page.items !== undefined && !Array.isArray(page.items)) {
      throw new GoogleCalendarSyncError("Google Calendar returned an invalid event list.");
    }
    for (const rawEvent of Array.isArray(page.items) ? page.items : []) {
      const event = parseEvent(rawEvent);
      if (!event) continue;
      processed += 1;
      if (await saveGoogleEvent(mentor.id, mentorEmail, event, businesses)) matched += 1;
    }
    if (typeof page.nextPageToken === "string" && page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    if (typeof page.nextSyncToken !== "string" || !page.nextSyncToken) {
      throw new GoogleCalendarSyncError("Google Calendar did not return a sync token.");
    }
    nextSyncToken = page.nextSyncToken;
    break;
  }

  if (!nextSyncToken) throw new GoogleCalendarSyncError("Google Calendar sync did not complete.");
  const [updated] = await db.update(staffMembersTable).set({ googleCalendarSyncToken: nextSyncToken })
    .where(and(
      eq(staffMembersTable.id, mentor.id),
      eq(staffMembersTable.googleCalendarAccountEmail, mentorEmail),
      eq(staffMembersTable.googleCalendarRefreshTokenEncrypted, mentor.googleCalendarRefreshTokenEncrypted),
    ))
    .returning({ id: staffMembersTable.id });
  if (!updated) throw new GoogleCalendarSyncError("Google Calendar connection changed during sync.");
  return { processed, matched };
}

async function syncGoogleCalendarMentorUnlocked(
  mentorStaffId: number,
  onConnectionSnapshot: (snapshot: GoogleCalendarConnectionSnapshot) => void,
): Promise<boolean> {
  const [mentor] = await db.select({
    id: staffMembersTable.id,
    status: staffMembersTable.status,
    role: staffMembersTable.role,
    googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
    googleCalendarRefreshTokenEncrypted: staffMembersTable.googleCalendarRefreshTokenEncrypted,
    googleCalendarAccessTokenEncrypted: staffMembersTable.googleCalendarAccessTokenEncrypted,
    googleCalendarAccessTokenExpiresAt: staffMembersTable.googleCalendarAccessTokenExpiresAt,
    googleCalendarSyncToken: staffMembersTable.googleCalendarSyncToken,
  }).from(staffMembersTable).where(eq(staffMembersTable.id, mentorStaffId)).limit(1);
  if (
    !mentor ||
    mentor.status !== "active" ||
    mentor.role !== "mentor" ||
    !mentor.googleCalendarAccountEmail ||
    !mentor.googleCalendarRefreshTokenEncrypted
  ) return false;

  onConnectionSnapshot({
    accountEmail: mentor.googleCalendarAccountEmail,
    refreshTokenEncrypted: mentor.googleCalendarRefreshTokenEncrypted,
  });
  const accessToken = await refreshGoogleAccessToken(mentor);
  const result = await fetchAndStoreEvents({
    ...mentor,
    googleCalendarRefreshTokenEncrypted: mentor.googleCalendarRefreshTokenEncrypted,
  }, accessToken);
  logger.info({ mentorStaffId, ...result }, "Google Calendar booking sync completed");
  return true;
}

/**
 * Keep the lock on a dedicated PostgreSQL session for the full sync. Unlike a
 * process-local mutex, this prevents separate autoscale replicas from
 * consuming the same mentor's Calendar sync token concurrently.
 */
export async function withGoogleCalendarSyncLease(
  mentorStaffId: number,
  sync: () => Promise<void>,
  connect: () => Promise<GoogleCalendarSyncClient> = () => pool.connect(),
): Promise<boolean> {
  const client = await connect();
  let acquired = false;
  let releaseError: Error | undefined;

  try {
    let result;
    try {
      result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1, $2) AS locked",
        [googleCalendarSyncLockNamespace, mentorStaffId],
      );
    } catch (error) {
      releaseError = error instanceof Error ? error : new Error("Google Calendar lock query failed.");
      throw error;
    }

    acquired = result.rows[0]?.locked === true;
    if (!acquired) return false;
    await sync();
    return true;
  } finally {
    if (acquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock($1, $2)",
          [googleCalendarSyncLockNamespace, mentorStaffId],
        );
      } catch (error) {
        // Destroy this session on release: returning it to the pool with a
        // session-level advisory lock could block future syncs indefinitely.
        releaseError = error instanceof Error ? error : new Error("Google Calendar lock release failed.");
        logger.error({ err: error, mentorStaffId }, "Could not release Google Calendar sync lock");
      }
    }
    client.release(releaseError);
  }
}

export async function recordGoogleCalendarSyncFailureStatus(
  mentorStaffId: number,
  error: unknown,
  connectionSnapshot?: GoogleCalendarConnectionSnapshot,
): Promise<void> {
  const requiresReauthorization =
    connectionSnapshot !== undefined &&
    error instanceof GoogleCalendarSyncError &&
    error.requiresReauthorization;
  await db.update(staffMembersTable).set({
    googleCalendarSyncLastFailureAt: new Date(),
    googleCalendarSyncConsecutiveFailures: sql`LEAST(${staffMembersTable.googleCalendarSyncConsecutiveFailures} + 1, 2147483647)`,
    googleCalendarSyncSkipCount: 0,
    ...(requiresReauthorization ? { googleCalendarSyncNeedsReauthorization: true } : {}),
  }).where(and(
    eq(staffMembersTable.id, mentorStaffId),
    isNotNull(staffMembersTable.googleCalendarRefreshTokenEncrypted),
    ...(connectionSnapshot ? [
      eq(staffMembersTable.googleCalendarAccountEmail, connectionSnapshot.accountEmail),
      eq(staffMembersTable.googleCalendarRefreshTokenEncrypted, connectionSnapshot.refreshTokenEncrypted),
    ] : []),
  ));
}

export async function recordGoogleCalendarSyncSuccessStatus(
  mentorStaffId: number,
  connectionSnapshot: GoogleCalendarConnectionSnapshot,
): Promise<void> {
  await db.update(staffMembersTable).set({
    googleCalendarSyncLastSuccessAt: new Date(),
    googleCalendarSyncLastFailureAt: null,
    googleCalendarSyncConsecutiveFailures: 0,
    googleCalendarSyncNeedsReauthorization: false,
    googleCalendarSyncSkipCount: 0,
  }).where(and(
    eq(staffMembersTable.id, mentorStaffId),
    isNotNull(staffMembersTable.googleCalendarRefreshTokenEncrypted),
    eq(staffMembersTable.googleCalendarAccountEmail, connectionSnapshot.accountEmail),
    eq(staffMembersTable.googleCalendarRefreshTokenEncrypted, connectionSnapshot.refreshTokenEncrypted),
  ));
}

export async function recordGoogleCalendarSyncSkipped(
  mentorStaffId: number,
  now = Date.now(),
): Promise<void> {
  await db.update(staffMembersTable).set({
    googleCalendarSyncLastSkippedAt: new Date(now),
    googleCalendarSyncSkipCount: sql`CASE
      WHEN ${staffMembersTable.googleCalendarSyncLastSkippedAt} >= ${new Date(now - googleCalendarSyncSkipWindowMs)}
      THEN LEAST(${staffMembersTable.googleCalendarSyncSkipCount} + 1, 2147483647)
      ELSE 1
    END`,
  }).where(and(
    eq(staffMembersTable.id, mentorStaffId),
    isNotNull(staffMembersTable.googleCalendarRefreshTokenEncrypted),
  ));
}

export async function syncGoogleCalendarMentor(
  mentorStaffId: number,
  connect: () => Promise<GoogleCalendarSyncClient> = () => pool.connect(),
): Promise<void> {
  let connectionSnapshot: GoogleCalendarConnectionSnapshot | undefined;
  try {
    const [currentConnection] = await db.select({
      accountEmail: staffMembersTable.googleCalendarAccountEmail,
      refreshTokenEncrypted: staffMembersTable.googleCalendarRefreshTokenEncrypted,
    }).from(staffMembersTable).where(eq(staffMembersTable.id, mentorStaffId)).limit(1);
    if (currentConnection?.accountEmail && currentConnection.refreshTokenEncrypted) {
      connectionSnapshot = {
        accountEmail: currentConnection.accountEmail,
        refreshTokenEncrypted: currentConnection.refreshTokenEncrypted,
      };
    }

    let syncCompleted = false;
    const acquired = await withGoogleCalendarSyncLease(
      mentorStaffId,
      async () => {
        syncCompleted = await syncGoogleCalendarMentorUnlocked(mentorStaffId, (snapshot) => {
          connectionSnapshot = snapshot;
        });
      },
      connect,
    );
    if (!acquired) {
      logGoogleCalendarSyncSkipped(mentorStaffId);
      try {
        await recordGoogleCalendarSyncSkipped(mentorStaffId);
      } catch (error) {
        logger.error({ err: error, mentorStaffId }, "Could not save Google Calendar sync skip status");
      }
      return;
    }
    if (!syncCompleted || !connectionSnapshot) return;
    await recordGoogleCalendarSyncSuccessStatus(mentorStaffId, connectionSnapshot);
  } catch (error) {
    try {
      if (connectionSnapshot) {
        await recordGoogleCalendarSyncFailureStatus(mentorStaffId, error, connectionSnapshot);
      }
    } catch (recordError) {
      logger.error({ err: recordError, mentorStaffId }, "Could not save Google Calendar sync failure status");
    }
    throw error;
  }
}

export async function processGoogleCalendarSyncMentorQueue(
  connectedMentors: Array<{ id: number }>,
  syncMentor: (mentorStaffId: number) => Promise<void> = syncGoogleCalendarMentor,
  reportFailure: (mentorStaffId: number, error: unknown) => void = (mentorStaffId, error) => {
    logger.warn({
      mentorStaffId,
      statusCode: error instanceof GoogleCalendarSyncError ? error.statusCode : undefined,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }, "Google Calendar booking sync failed; it will retry");
  },
): Promise<void> {
  for (const mentor of connectedMentors) {
    try {
      await syncMentor(mentor.id);
    } catch (error) {
      reportFailure(mentor.id, error);
    }
  }
}

let workerTimer: ReturnType<typeof setInterval> | undefined;
let workerRunning = false;

async function processGoogleCalendarSyncQueue(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const connectedMentors = await db.select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.role, "mentor"),
        eq(staffMembersTable.status, "active"),
        isNotNull(staffMembersTable.googleCalendarRefreshTokenEncrypted),
      ));
    await processGoogleCalendarSyncMentorQueue(connectedMentors);
  } catch (error) {
    logger.error({ err: error }, "Google Calendar sync worker failed");
  } finally {
    workerRunning = false;
  }
}

export function startGoogleCalendarSyncWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processGoogleCalendarSyncQueue();
  }, workerIntervalMs);
  workerTimer.unref?.();
  void processGoogleCalendarSyncQueue();
}

export const googleCalendarPrivacy = {
  scope: googleCalendarEventsScope,
  eventFields: googleCalendarEventFields,
  eventName: genericMeetingName,
} as const;
