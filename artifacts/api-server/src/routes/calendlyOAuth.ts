import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  StartCalendlyConnectionBody,
  StartCalendlyConnectionResponse,
} from "@workspace/api-zod";
import {
  businessesTable,
  calendlyMeetingsTable,
  db,
  staffMembersTable,
  supportTable,
} from "@workspace/db";
import { requireStaff } from "../middlewares/staffAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { requireRole } from "../middlewares/requireRole";
import {
  isCalendlyOAuthStateValid,
  openCalendlyOAuthState,
  sealCalendlyOAuthState,
  type CalendlyOAuthState,
} from "../lib/calendlyOAuthState";

const router: IRouter = Router();
const cookieName = "jusoor_calendly_oauth";
const callbackPath = "/api/mentor/calendly/callback";
const stateLifetimeMs = 10 * 60 * 1000;
const webhookTimestampToleranceMs = 3 * 60 * 1000;
const calendlyPageSize = 100;
const maxEventPagesPerStatus = 10;
const maxEventsPerStatus = 250;
const maxInviteePagesPerEvent = 5;
const maxImportRequests = 600;
const calendlyRequestTimeoutMs = 10_000;

type CalendlyBusinessMatch = { id: number; email: string };

type CalendlyMeetingImport = {
  businessId: number;
  mentorStaffId: number;
  inviteeUri: string;
  scheduledEventUri: string;
  eventName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string | null;
  status: "confirmed" | "cancelled" | "rescheduled";
  lastEventAt: Date;
};

function normalizeCalendlyInviteeUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      !["https://api.calendly.com", "https://calendly.com"].includes(parsed.origin) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !/^\/scheduled_events\/[^/]+\/invitees\/[^/]+$/.test(parsed.pathname)
    ) return null;
    return `https://api.calendly.com${parsed.pathname}`;
  } catch {
    return null;
  }
}

function validCalendlyEventUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === "https://api.calendly.com" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      /^\/scheduled_events\/[^/]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function parseCalendlyDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function calendlyApiPageUrl(
  value: string | null | undefined,
  expectedPath: "/scheduled_events" | string,
): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://api.calendly.com" ||
      url.username ||
      url.password ||
      url.pathname !== expectedPath
    ) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchCalendlyPage(
  accessToken: string,
  url: URL,
): Promise<{ collection: unknown[]; nextPage: string | null }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(calendlyRequestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Calendly import request failed with status ${response.status}.`);
  const body = await response.json() as {
    collection?: unknown;
    pagination?: { next_page?: unknown };
  };
  if (!Array.isArray(body.collection)) {
    throw new Error("Calendly returned an invalid collection during import.");
  }
  const nextPage = body.pagination?.next_page;
  if (nextPage !== undefined && nextPage !== null && typeof nextPage !== "string") {
    throw new Error("Calendly returned an invalid pagination link during import.");
  }
  return { collection: body.collection, nextPage: nextPage ?? null };
}

async function importCalendlyMeetings(
  accessToken: string,
  calendlyUserUri: string,
  mentorStaffId: number,
  assignedBusinesses: CalendlyBusinessMatch[],
  upsertMeeting: (meeting: CalendlyMeetingImport) => Promise<void>,
): Promise<{ imported: number; unmatched: number; truncated: boolean }> {
  let requests = 0;
  let imported = 0;
  let unmatched = 0;
  let truncated = false;
  const matchesByEmail = new Map<string, CalendlyBusinessMatch | null>();
  const seenBusinessIds = new Set<number>();
  for (const business of assignedBusinesses) {
    if (seenBusinessIds.has(business.id)) continue;
    seenBusinessIds.add(business.id);
    const email = business.email.trim().toLowerCase();
    if (!email) continue;
    matchesByEmail.set(email, matchesByEmail.has(email) ? null : business);
  }

  const scheduledEvents: Array<{ resource: Record<string, unknown>; sourceStatus: "active" | "canceled" }> = [];
  for (const status of ["active", "canceled"] as const) {
    let url: URL | null = new URL("https://api.calendly.com/scheduled_events");
    url.searchParams.set("user", calendlyUserUri);
    url.searchParams.set("status", status);
    url.searchParams.set("count", String(calendlyPageSize));
    let pages = 0;
    while (url && pages < maxEventPagesPerStatus && scheduledEvents.filter((event) => event.sourceStatus === status).length < maxEventsPerStatus) {
      if (requests >= maxImportRequests) {
        truncated = true;
        break;
      }
      requests += 1;
      pages += 1;
      const page = await fetchCalendlyPage(accessToken, url);
      for (const item of page.collection) {
        if (isRecord(item)) scheduledEvents.push({ resource: item, sourceStatus: status });
      }
      if (!page.nextPage) {
        url = null;
        break;
      }
      const nextUrl = calendlyApiPageUrl(page.nextPage, "/scheduled_events");
      if (!nextUrl) throw new Error("Calendly returned an unsafe event pagination link.");
      if (nextUrl.searchParams.get("user") !== calendlyUserUri ||
          nextUrl.searchParams.get("status") !== status) {
        throw new Error("Calendly returned an unexpected event pagination link.");
      }
      nextUrl.searchParams.set("count", String(calendlyPageSize));
      url = nextUrl;
    }
    if (url && pages >= maxEventPagesPerStatus) truncated = true;
    if (scheduledEvents.filter((event) => event.sourceStatus === status).length >= maxEventsPerStatus) truncated = true;
  }

  for (const { resource: event, sourceStatus } of scheduledEvents) {
    if (requests >= maxImportRequests) {
      truncated = true;
      break;
    }
    const scheduledEventUri = event.uri;
    const startsAt = parseCalendlyDate(event.start_time);
    const endsAt = parseCalendlyDate(event.end_time);
    if (
      !validCalendlyEventUri(scheduledEventUri) ||
      !startsAt ||
      !endsAt ||
      endsAt <= startsAt
    ) continue;

    let url: URL | null = new URL(`${scheduledEventUri}/invitees`);
    url.searchParams.set("count", String(calendlyPageSize));
    let pages = 0;
    while (url && pages < maxInviteePagesPerEvent) {
      if (requests >= maxImportRequests) {
        truncated = true;
        break;
      }
      requests += 1;
      pages += 1;
      const page = await fetchCalendlyPage(accessToken, url);
      for (const item of page.collection) {
        if (!isRecord(item)) continue;
        const inviteeUri = normalizeCalendlyInviteeUri(item.uri);
        const email = typeof item.email === "string" ? item.email.trim().toLowerCase() : "";
        const business = matchesByEmail.get(email);
        if (!inviteeUri || !email || !business) {
          unmatched += 1;
          continue;
        }
        const createdAt = parseCalendlyDate(item.created_at);
        const updatedAt = parseCalendlyDate(item.updated_at);
        const eventCreatedAt = parseCalendlyDate(event.created_at);
        const eventUpdatedAt = parseCalendlyDate(event.updated_at);
        const lastEventAt = updatedAt ?? (sourceStatus === "canceled" ? eventUpdatedAt : null) ??
          createdAt ?? eventCreatedAt;
        if (!lastEventAt) {
          unmatched += 1;
          continue;
        }
        const canceled = sourceStatus === "canceled" || item.status === "canceled";
        const rescheduled = canceled && (
          item.rescheduled === true ||
          (typeof item.new_invitee === "string" && item.new_invitee.length > 0)
        );
        await upsertMeeting({
          businessId: business.id,
          mentorStaffId,
          inviteeUri,
          scheduledEventUri,
          eventName: typeof event.name === "string" && event.name.trim()
            ? event.name.trim().slice(0, 300)
            : "Mentoring session",
          startsAt,
          endsAt,
          timezone: typeof item.timezone === "string" && item.timezone.length <= 100
            ? item.timezone
            : null,
          status: canceled ? (rescheduled ? "rescheduled" : "cancelled") : "confirmed",
          lastEventAt,
        });
        imported += 1;
      }
      if (!page.nextPage) {
        url = null;
        break;
      }
      const nextUrl = calendlyApiPageUrl(page.nextPage, new URL(`${scheduledEventUri}/invitees`).pathname);
      if (!nextUrl) throw new Error("Calendly returned an unsafe invitee pagination link.");
      nextUrl.searchParams.set("count", String(calendlyPageSize));
      url = nextUrl;
    }
    if (url && pages >= maxInviteePagesPerEvent) truncated = true;
    if (requests >= maxImportRequests) truncated = true;
  }

  return { imported, unmatched, truncated };
}

function encryptionKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function sealSecret(value: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("SESSION_SECRET is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function openSecret(value: string | null | undefined): string | null {
  const key = encryptionKey();
  if (!key || !value) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  const part = header?.split(";").map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function allowedOrigin(req: Request): string | null {
  const rawOrigin = req.get("origin");
  const forwardedProto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  const candidate = rawOrigin ?? `${forwardedProto}://${req.get("host") ?? ""}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) return null;

  const registeredHosts = [
    process.env.REPLIT_DEV_DOMAIN ?? "",
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  ].map((entry) => entry.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0].toLowerCase())
    .filter((entry): entry is string => Boolean(entry));
  const hostname = parsed.hostname.toLowerCase();
  const loopbackInDevelopment = process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (!registeredHosts.includes(hostname) && !loopbackInDevelopment) return null;
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return null;
  return parsed.origin;
}

async function createWebhookSubscription(
  accessToken: string,
  webhookUrl: string,
  userUri: string,
  organizationUri: string,
  signingKey: string,
): Promise<{ uri: string; status: number } | null> {
  const response = await fetch("https://api.calendly.com/webhook_subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: organizationUri,
      scope: "user",
      user: userUri,
      signing_key: signingKey,
    }),
  });
  if (!response.ok) return { uri: "", status: response.status };
  const result = await response.json() as { resource?: { uri?: unknown } };
  return typeof result.resource?.uri === "string"
    ? { uri: result.resource.uri, status: response.status }
    : { uri: "", status: response.status };
}

function clearStateCookie(res: Response, secure: boolean): void {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: callbackPath,
  });
}

router.post("/connect", requireStaff, requireRole("mentor"), (req, res): void => {
  const body = StartCalendlyConnectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid Calendly connection request." });
    return;
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const key = secret ? createHash("sha256").update(secret).digest() : null;
  const origin = allowedOrigin(req);
  if (!clientId || !process.env.CALENDLY_CLIENT_SECRET || !key) {
    res.status(503).json({ error: "Calendly OAuth is not configured." });
    return;
  }
  if (!origin) {
    res.status(400).json({ error: "This app address is not approved for Calendly authorization." });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const redirectUri = `${origin}${callbackPath}`;
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const payload: CalendlyOAuthState = {
    staffId: staff.id,
    state,
    codeVerifier,
    origin,
    redirectUri,
    expiresAt: Date.now() + stateLifetimeMs,
  };

  const authorizationUrl = new URL("https://auth.calendly.com/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "users:read scheduled_events:read webhooks:write");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  res.cookie(cookieName, sealCalendlyOAuthState(payload), {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    maxAge: stateLifetimeMs,
    path: callbackPath,
  });
  res.json(StartCalendlyConnectionResponse.parse({
    authorizationUrl: authorizationUrl.toString(),
  }));
});

router.get("/callback", async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const payload = openCalendlyOAuthState(cookieValue(req.get("cookie"), cookieName));
  if (!isCalendlyOAuthStateValid(payload, state)) {
    clearStateCookie(res, req.secure);
    res.status(400).send("Calendly authorization expired or could not be verified. Return to Jusoor and try again.");
    return;
  }

  clearStateCookie(res, payload.origin.startsWith("https:"));
  const finish = (result: "connected" | "cancelled" | "error") => {
    const destination = new URL("/mentor", payload.origin);
    destination.searchParams.set("calendly", result);
    res.redirect(302, destination.toString());
  };

  if (typeof req.query.error === "string") {
    finish("cancelled");
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) {
    finish("error");
    return;
  }

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: payload.redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: payload.codeVerifier,
    });
    const tokenResponse = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: tokenBody,
    });
    if (!tokenResponse.ok) {
      req.log.warn({ statusCode: tokenResponse.status }, "Calendly token exchange failed");
      finish("error");
      return;
    }
    const tokenData = await tokenResponse.json() as { access_token?: unknown };
    if (typeof tokenData.access_token !== "string" || tokenData.access_token.length === 0) {
      finish("error");
      return;
    }

    const profileResponse = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    if (!profileResponse.ok) {
      req.log.warn({ statusCode: profileResponse.status }, "Calendly profile lookup failed");
      finish("error");
      return;
    }
    const profile = await profileResponse.json() as {
      resource?: {
        scheduling_url?: unknown;
        uri?: unknown;
        current_organization?: unknown;
      };
    };
    const bookingUrl = profile.resource?.scheduling_url;
    const calendlyUserUri = profile.resource?.uri;
    const organizationUri = profile.resource?.current_organization;
    if (
      typeof bookingUrl !== "string" ||
      typeof calendlyUserUri !== "string" ||
      typeof organizationUri !== "string"
    ) {
      finish("error");
      return;
    }
    const parsedBookingUrl = new URL(bookingUrl);
    if (
      parsedBookingUrl.protocol !== "https:" ||
      parsedBookingUrl.username ||
      parsedBookingUrl.password ||
      !(parsedBookingUrl.hostname === "calendly.com" || parsedBookingUrl.hostname.endsWith(".calendly.com"))
    ) {
      finish("error");
      return;
    }

    if (
      !calendlyUserUri.startsWith("https://api.calendly.com/users/") ||
      !organizationUri.startsWith("https://api.calendly.com/organizations/")
    ) {
      finish("error");
      return;
    }

    const [mentor] = await db.select({
      id: staffMembersTable.id,
      webhookTokenEncrypted: staffMembersTable.calendlyWebhookTokenEncrypted,
      webhookSecretEncrypted: staffMembersTable.calendlyWebhookSecretEncrypted,
      webhookSubscriptionUri: staffMembersTable.calendlyWebhookSubscriptionUri,
    }).from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.id, payload.staffId),
        eq(staffMembersTable.role, "mentor"),
        eq(staffMembersTable.status, "active"),
      )).limit(1);
    if (!mentor) {
      finish("error");
      return;
    }

    const webhookToken = openSecret(mentor.webhookTokenEncrypted) ?? randomBytes(32).toString("base64url");
    const signingKey = openSecret(mentor.webhookSecretEncrypted) ?? randomBytes(32).toString("base64url");
    const webhookUrl = `${payload.origin}/api/mentor/calendly/webhook/${webhookToken}`;
    const subscription = await createWebhookSubscription(
      tokenData.access_token,
      webhookUrl,
      calendlyUserUri,
      organizationUri,
      signingKey,
    );
    if (!subscription?.uri) {
      req.log.warn({ statusCode: subscription?.status ?? 0 }, "Calendly webhook subscription failed");
      finish("error");
      return;
    }

    if (mentor.webhookSubscriptionUri) {
      try {
        const previousUri = new URL(mentor.webhookSubscriptionUri);
        if (
          previousUri.protocol === "https:" &&
          previousUri.hostname === "api.calendly.com" &&
          previousUri.pathname.startsWith("/webhook_subscriptions/")
        ) {
          const deletion = await fetch(previousUri, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
          });
          if (!deletion.ok && deletion.status !== 404) {
            req.log.warn({ statusCode: deletion.status }, "Previous Calendly webhook cleanup failed");
          }
        }
      } catch {
        req.log.warn("Previous Calendly webhook cleanup failed");
      }
    }

    const [updatedMentor] = await db.update(staffMembersTable)
      .set({
        bookingProvider: "calendly",
        calendlyBookingUrl: parsedBookingUrl.toString(),
        calendlyWebhookTokenHash: createHash("sha256").update(webhookToken).digest("hex"),
        calendlyWebhookTokenEncrypted: sealSecret(webhookToken),
        calendlyWebhookSecretEncrypted: sealSecret(signingKey),
        calendlyWebhookSubscriptionUri: subscription.uri,
      })
      .where(and(
        eq(staffMembersTable.id, payload.staffId),
        eq(staffMembersTable.role, "mentor"),
        eq(staffMembersTable.status, "active"),
      ))
      .returning({ id: staffMembersTable.id });
    if (!updatedMentor) {
      finish("error");
      return;
    }

    try {
      const assignedBusinesses = await db.select({
        id: businessesTable.id,
        email: businessesTable.email,
      }).from(businessesTable)
        .innerJoin(supportTable, and(
          eq(supportTable.businessId, businessesTable.id),
        ))
        .where(and(
          eq(supportTable.mentorStaffId, payload.staffId),
          eq(supportTable.type, "mentor"),
        ));
      const importResult = await importCalendlyMeetings(
        tokenData.access_token,
        calendlyUserUri,
        payload.staffId,
        assignedBusinesses,
        async (meeting) => {
          await db.insert(calendlyMeetingsTable).values(meeting).onConflictDoUpdate({
            target: calendlyMeetingsTable.inviteeUri,
            set: {
              businessId: meeting.businessId,
              mentorStaffId: meeting.mentorStaffId,
              scheduledEventUri: meeting.scheduledEventUri,
              eventName: meeting.eventName,
              startsAt: meeting.startsAt,
              endsAt: meeting.endsAt,
              timezone: meeting.timezone,
              status: meeting.status,
              lastEventAt: meeting.lastEventAt,
              updatedAt: new Date(),
            },
            setWhere: lt(calendlyMeetingsTable.lastEventAt, meeting.lastEventAt),
          });
        },
      );
      req.log.info(
        { mentorStaffId: payload.staffId, ...importResult },
        "Calendly meeting history import completed",
      );
    } catch (error) {
      req.log.warn(
        { mentorStaffId: payload.staffId, errorName: error instanceof Error ? error.name : "UnknownError" },
        "Calendly meeting history import failed; reconnecting can safely retry it",
      );
    }

    // The OAuth access token is used only for the webhook and history import; it is never persisted.
    finish("connected");
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Calendly OAuth callback failed",
    );
    finish("error");
  }
});

router.post("/webhook/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!token || !rawBody || token.length > 256) {
    res.status(401).json({ error: "Invalid Calendly webhook." });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [mentor] = await db.select({
    id: staffMembersTable.id,
    webhookSecretEncrypted: staffMembersTable.calendlyWebhookSecretEncrypted,
  }).from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.calendlyWebhookTokenHash, tokenHash),
      eq(staffMembersTable.role, "mentor"),
      eq(staffMembersTable.status, "active"),
    )).limit(1);
  const signingKey = openSecret(mentor?.webhookSecretEncrypted);
  const signatureHeader = req.get("Calendly-Webhook-Signature");
  const timestampMatch = signatureHeader?.match(/(?:^|,)t=(\d+)(?:,|$)/);
  const signatureMatch = signatureHeader?.match(/(?:^|,)v1=([a-f\d]{64})(?:,|$)/i);
  const timestamp = timestampMatch?.[1];
  const suppliedSignature = signatureMatch?.[1];
  const timestampMs = timestamp ? Number(timestamp) * 1000 : Number.NaN;
  if (
    !mentor ||
    !signingKey ||
    !timestamp ||
    !suppliedSignature ||
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > webhookTimestampToleranceMs
  ) {
    res.status(401).json({ error: "Invalid Calendly webhook signature." });
    return;
  }

  const expectedSignature = createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody.toString("utf8")}`, "utf8")
    .digest();
  const receivedSignature = Buffer.from(suppliedSignature, "hex");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    res.status(401).json({ error: "Invalid Calendly webhook signature." });
    return;
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    res.status(400).json({ error: "Invalid Calendly webhook payload." });
    return;
  }
  if (!isRecord(envelope) || !isRecord(envelope.payload)) {
    res.status(400).json({ error: "Invalid Calendly webhook payload." });
    return;
  }
  if (envelope.event !== "invitee.created" && envelope.event !== "invitee.canceled") {
    res.sendStatus(200);
    return;
  }

  const data = envelope.payload;
  const scheduledEvent = data.scheduled_event;
  const createdAt = typeof envelope.created_at === "string" ? new Date(envelope.created_at) : null;
  const startsAt = isRecord(scheduledEvent) && typeof scheduledEvent.start_time === "string"
    ? new Date(scheduledEvent.start_time)
    : null;
  const endsAt = isRecord(scheduledEvent) && typeof scheduledEvent.end_time === "string"
    ? new Date(scheduledEvent.end_time)
    : null;
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const inviteeUri = normalizeCalendlyInviteeUri(data.uri);
  const scheduledEventUri = isRecord(scheduledEvent) && typeof scheduledEvent.uri === "string"
    ? scheduledEvent.uri
    : "";
  if (
    !createdAt ||
    !Number.isFinite(createdAt.getTime()) ||
    !startsAt ||
    !Number.isFinite(startsAt.getTime()) ||
    !endsAt ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt ||
    !email ||
    email.length > 320 ||
    !inviteeUri ||
    !scheduledEventUri.startsWith("https://api.calendly.com/scheduled_events/")
  ) {
    res.status(400).json({ error: "Invalid Calendly meeting details." });
    return;
  }

  const matchedBusinesses = await db.selectDistinct({ id: businessesTable.id })
    .from(businessesTable)
    .innerJoin(supportTable, and(
      eq(supportTable.businessId, businessesTable.id),
      eq(supportTable.mentorStaffId, mentor.id),
      eq(supportTable.type, "mentor"),
    ))
    .where(sql`lower(${businessesTable.email}) = ${email}`);
  if (matchedBusinesses.length !== 1) {
    req.log.warn(
      { mentorStaffId: mentor.id, matchingAssignedBusinesses: matchedBusinesses.length },
      "Calendly meeting could not be matched to one assigned founder",
    );
    res.sendStatus(200);
    return;
  }

  const canceled = envelope.event === "invitee.canceled" || data.status === "canceled";
  const rescheduled = canceled && (
    data.rescheduled === true ||
    (typeof data.new_invitee === "string" && data.new_invitee.length > 0)
  );
  const status = canceled ? (rescheduled ? "rescheduled" : "cancelled") : "confirmed";
  const [savedMeeting] = await db.insert(calendlyMeetingsTable).values({
    businessId: matchedBusinesses[0]!.id,
    mentorStaffId: mentor.id,
    inviteeUri,
    scheduledEventUri,
    eventName: isRecord(scheduledEvent) && typeof scheduledEvent.name === "string" && scheduledEvent.name.trim()
      ? scheduledEvent.name.trim().slice(0, 300)
      : "Mentoring session",
    startsAt,
    endsAt,
    timezone: typeof data.timezone === "string" && data.timezone.length <= 100 ? data.timezone : null,
    status,
    lastEventAt: createdAt,
  }).onConflictDoUpdate({
    target: calendlyMeetingsTable.inviteeUri,
    set: {
      businessId: matchedBusinesses[0]!.id,
      mentorStaffId: mentor.id,
      scheduledEventUri,
      eventName: isRecord(scheduledEvent) && typeof scheduledEvent.name === "string" && scheduledEvent.name.trim()
        ? scheduledEvent.name.trim().slice(0, 300)
        : "Mentoring session",
      startsAt,
      endsAt,
      timezone: typeof data.timezone === "string" && data.timezone.length <= 100 ? data.timezone : null,
      status,
      lastEventAt: createdAt,
      updatedAt: new Date(),
    },
    setWhere: lt(calendlyMeetingsTable.lastEventAt, createdAt),
  }).returning({ id: calendlyMeetingsTable.id });

  const oldInvitee = normalizeCalendlyInviteeUri(data.old_invitee);
  if (oldInvitee && status === "confirmed") {
    await db.update(calendlyMeetingsTable)
      .set({ status: "rescheduled", lastEventAt: createdAt, updatedAt: new Date() })
      .where(and(
        eq(calendlyMeetingsTable.inviteeUri, oldInvitee),
        eq(calendlyMeetingsTable.mentorStaffId, mentor.id),
        lt(calendlyMeetingsTable.lastEventAt, createdAt),
      ));
  }

  req.log.info(
    { mentorStaffId: mentor.id, meetingId: savedMeeting?.id ?? null, event: envelope.event },
    "Calendly meeting update received",
  );
  res.sendStatus(200);
});

export default router;
