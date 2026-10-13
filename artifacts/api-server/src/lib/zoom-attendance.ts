import { and, eq, isNull, lte, or } from "drizzle-orm";
import {
  businessesTable,
  db,
  sessionAttendanceTable,
  sessionsTable,
  zoomAttendanceParticipantsTable,
  zoomAttendanceSyncsTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  getPastMeetingParticipants,
  hasZoomOAuthConfiguration,
  ZoomIntegrationError,
} from "./zoom";

const retryDelaysMs = [60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const maxAttempts = retryDelaysMs.length + 1;
const workerIntervalMs = 60_000;
let workerTimer: ReturnType<typeof setInterval> | undefined;
let workerRunning = false;

type ZoomSyncState = {
  status: string;
  attempts: number;
  participantCount: number;
  matchedCount: number;
  unmatchedCount: number;
  lastAttemptAt: Date | null;
  syncedAt: Date | null;
  lastError: string | null;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized || null;
}

export function findUniqueBusinessIdForEmail(
  email: string | null | undefined,
  businesses: Array<{ id: number; email: string }>,
): number | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const matches = businesses.filter((business) => normalizeEmail(business.email) === normalized);
  return matches.length === 1 ? matches[0].id : null;
}

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRetryable(error: unknown): boolean {
  return error instanceof ZoomIntegrationError &&
    (error.statusCode === 404 || error.statusCode === 502);
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZoomIntegrationError) return error.message;
  return "Zoom attendance could not be retrieved. Try again from the attendance register.";
}

export async function queueZoomAttendanceSync(
  sessionId: number,
  force = false,
): Promise<ZoomSyncState> {
  const [session] = await db.select({
    id: sessionsTable.id,
    zoomMeetingId: sessionsTable.zoomMeetingId,
  }).from(sessionsTable).where(eq(sessionsTable.id, sessionId)).limit(1);
  if (!session) throw new Error("Session not found.");
  if (!session.zoomMeetingId) throw new Error("This session has no Zoom meeting.");

  const [existing] = await db.select().from(zoomAttendanceSyncsTable)
    .where(eq(zoomAttendanceSyncsTable.sessionId, sessionId)).limit(1);
  const now = new Date();
  if (existing) {
    if (
      !force &&
      (existing.status === "completed" || existing.status === "syncing" || existing.status === "queued")
    ) {
      return existing;
    }
    const [updated] = await db.update(zoomAttendanceSyncsTable).set({
      status: "queued",
      attempts: force ? 0 : existing.attempts,
      nextAttemptAt: now,
      lastError: null,
      ...(force ? { syncedAt: null } : {}),
      updatedAt: now,
    }).where(eq(zoomAttendanceSyncsTable.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(zoomAttendanceSyncsTable).values({
    sessionId,
    status: "queued",
    nextAttemptAt: now,
  }).onConflictDoNothing({
    target: zoomAttendanceSyncsTable.sessionId,
  }).returning();
  if (created) return created;

  const [raced] = await db.select().from(zoomAttendanceSyncsTable)
    .where(eq(zoomAttendanceSyncsTable.sessionId, sessionId)).limit(1);
  if (!raced) throw new Error("Could not queue Zoom attendance sync.");
  return raced;
}

export async function queueZoomAttendanceSyncForMeeting(
  meetingId: string,
): Promise<boolean> {
  const [session] = await db.select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.zoomMeetingId, meetingId))
    .limit(1);
  if (!session) return false;
  await queueZoomAttendanceSync(session.id);
  return true;
}

async function rebuildSessionAttendance(sessionId: number): Promise<void> {
  const businesses = await db.select({
    id: businessesTable.id,
  }).from(businessesTable)
    .innerJoin(sessionsTable, eq(businessesTable.programId, sessionsTable.programId))
    .where(eq(sessionsTable.id, sessionId));
  const participants = await db.select().from(zoomAttendanceParticipantsTable)
    .where(eq(zoomAttendanceParticipantsTable.sessionId, sessionId));
  const manualRecords = await db.select({
    businessId: sessionAttendanceTable.businessId,
  }).from(sessionAttendanceTable)
    .where(and(
      eq(sessionAttendanceTable.sessionId, sessionId),
      eq(sessionAttendanceTable.source, "manual"),
    ));
  const manuallyRecorded = new Set(manualRecords.map((record) => record.businessId));
  const unresolved = participants.length === 0 || participants.some((participant) =>
    participant.matchedBusinessId === null && participant.ignoredAt === null
  );
  const byBusiness = new Map<number, typeof participants>();
  for (const participant of participants) {
    if (participant.matchedBusinessId === null) continue;
    const rows = byBusiness.get(participant.matchedBusinessId) ?? [];
    rows.push(participant);
    byBusiness.set(participant.matchedBusinessId, rows);
  }

  await db.delete(sessionAttendanceTable).where(and(
    eq(sessionAttendanceTable.sessionId, sessionId),
    eq(sessionAttendanceTable.source, "zoom"),
  ));

  const now = new Date();
  const values: Array<{
    sessionId: number;
    businessId: number;
    status: string;
    notes: string | null;
    source: string;
    attendedSeconds: number | null;
    firstJoinedAt: Date | null;
    lastLeftAt: Date | null;
    markedAt: Date;
  }> = [];
  for (const { id: businessId } of businesses) {
    if (manuallyRecorded.has(businessId)) continue;
    const matched = byBusiness.get(businessId) ?? [];
    if (matched.length > 0) {
      const joinTimes = matched.flatMap((item) => item.joinTime ? [item.joinTime] : []);
      const leaveTimes = matched.flatMap((item) => item.leaveTime ? [item.leaveTime] : []);
      values.push({
        sessionId,
        businessId,
        status: "present",
        notes: null,
        source: "zoom",
        attendedSeconds: matched.reduce((sum, item) => sum + item.durationSeconds, 0),
        firstJoinedAt: joinTimes.length ? new Date(Math.min(...joinTimes.map((date) => date.getTime()))) : null,
        lastLeftAt: leaveTimes.length ? new Date(Math.max(...leaveTimes.map((date) => date.getTime()))) : null,
        markedAt: now,
      });
    } else if (!unresolved) {
      values.push({
        sessionId,
        businessId,
        status: "absent",
        notes: null,
        source: "zoom",
        attendedSeconds: null,
        firstJoinedAt: null,
        lastLeftAt: null,
        markedAt: now,
      });
    }
  }

  if (values.length > 0) {
    await db.insert(sessionAttendanceTable).values(values).onConflictDoNothing();
  }

  const matchedCount = participants.filter((participant) => participant.matchedBusinessId !== null).length;
  const unmatchedCount = participants.filter((participant) =>
    participant.matchedBusinessId === null && participant.ignoredAt === null
  ).length;
  await db.update(zoomAttendanceSyncsTable).set({
    matchedCount,
    unmatchedCount,
    updatedAt: now,
  }).where(eq(zoomAttendanceSyncsTable.sessionId, sessionId));
}

export async function resolveZoomAttendanceParticipant(
  participantId: number,
  resolution: { businessId: number | null; ignore: boolean },
  staffId: number,
): Promise<number | null> {
  const [participant] = await db.select().from(zoomAttendanceParticipantsTable)
    .where(eq(zoomAttendanceParticipantsTable.id, participantId)).limit(1);
  if (!participant) return null;

  await db.update(zoomAttendanceParticipantsTable).set({
    matchedBusinessId: resolution.ignore ? null : resolution.businessId,
    ignoredByStaffId: resolution.ignore ? staffId : null,
    ignoredAt: resolution.ignore ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(zoomAttendanceParticipantsTable.id, participantId));
  await rebuildSessionAttendance(participant.sessionId);
  return participant.sessionId;
}

export async function getZoomAttendanceReport(sessionId: number) {
  const [session] = await db.select({
    id: sessionsTable.id,
    programId: sessionsTable.programId,
    title: sessionsTable.title,
    scheduledDate: sessionsTable.scheduledDate,
    zoomMeetingId: sessionsTable.zoomMeetingId,
  }).from(sessionsTable).where(eq(sessionsTable.id, sessionId)).limit(1);
  if (!session) return null;

  const businesses = session.programId === null ? [] : await db.select({
    id: businessesTable.id,
    businessName: businessesTable.businessName,
  }).from(businessesTable)
    .where(eq(businessesTable.programId, session.programId))
    .orderBy(businessesTable.businessName);
  const attendanceRecords = await db.select({
    businessId: sessionAttendanceTable.businessId,
    status: sessionAttendanceTable.status,
    notes: sessionAttendanceTable.notes,
    markedAt: sessionAttendanceTable.markedAt,
    source: sessionAttendanceTable.source,
    attendedSeconds: sessionAttendanceTable.attendedSeconds,
    firstJoinedAt: sessionAttendanceTable.firstJoinedAt,
    lastLeftAt: sessionAttendanceTable.lastLeftAt,
  }).from(sessionAttendanceTable)
    .where(eq(sessionAttendanceTable.sessionId, sessionId));
  const attendanceByBusiness = new Map(attendanceRecords.map((record) => [record.businessId, record]));
  const [sync] = await db.select().from(zoomAttendanceSyncsTable)
    .where(eq(zoomAttendanceSyncsTable.sessionId, sessionId)).limit(1);
  const unmatchedParticipants = await db.select({
    id: zoomAttendanceParticipantsTable.id,
    displayName: zoomAttendanceParticipantsTable.displayName,
    email: zoomAttendanceParticipantsTable.email,
    joinTime: zoomAttendanceParticipantsTable.joinTime,
    leaveTime: zoomAttendanceParticipantsTable.leaveTime,
    durationSeconds: zoomAttendanceParticipantsTable.durationSeconds,
    matchedBusinessId: zoomAttendanceParticipantsTable.matchedBusinessId,
    matchedBusinessName: businessesTable.businessName,
    ignoredAt: zoomAttendanceParticipantsTable.ignoredAt,
  }).from(zoomAttendanceParticipantsTable)
    .leftJoin(businessesTable, eq(zoomAttendanceParticipantsTable.matchedBusinessId, businessesTable.id))
    .where(and(
      eq(zoomAttendanceParticipantsTable.sessionId, sessionId),
      isNull(zoomAttendanceParticipantsTable.matchedBusinessId),
      isNull(zoomAttendanceParticipantsTable.ignoredAt),
    ))
    .orderBy(zoomAttendanceParticipantsTable.displayName);

  return {
    session,
    roster: businesses.map((business) => {
      const record = attendanceByBusiness.get(business.id);
      return {
        businessId: business.id,
        businessName: business.businessName,
        status: record?.status ?? null,
        notes: record?.notes ?? null,
        markedAt: record?.markedAt ?? null,
        source: record?.source ?? null,
        attendedSeconds: record?.attendedSeconds ?? null,
        firstJoinedAt: record?.firstJoinedAt ?? null,
        lastLeftAt: record?.lastLeftAt ?? null,
      };
    }),
    zoomSync: sync ? {
      status: sync.status,
      attempts: sync.attempts,
      participantCount: sync.participantCount,
      matchedCount: sync.matchedCount,
      unmatchedCount: sync.unmatchedCount,
      lastAttemptAt: sync.lastAttemptAt,
      syncedAt: sync.syncedAt,
      lastError: sync.lastError,
    } : null,
    unmatchedParticipants,
  };
}

async function syncSession(sessionId: number): Promise<void> {
  const [session] = await db.select({
    id: sessionsTable.id,
    programId: sessionsTable.programId,
    zoomMeetingId: sessionsTable.zoomMeetingId,
  }).from(sessionsTable).where(eq(sessionsTable.id, sessionId)).limit(1);
  if (!session?.zoomMeetingId) {
    throw new ZoomIntegrationError("This session no longer has a Zoom meeting.", 409);
  }

  const zoomRows = await getPastMeetingParticipants(session.zoomMeetingId);
  if (zoomRows.length > 0 && zoomRows.every((row) => Number(row.duration ?? 0) === 0)) {
    throw new ZoomIntegrationError("Zoom is still preparing attendance details. The system will retry.", 404);
  }

  const businesses = session.programId === null ? [] : await db.select({
    id: businessesTable.id,
    email: businessesTable.email,
  }).from(businessesTable)
    .where(eq(businessesTable.programId, session.programId));
  const prior = await db.select().from(zoomAttendanceParticipantsTable)
    .where(eq(zoomAttendanceParticipantsTable.sessionId, sessionId));
  const priorByKey = new Map(prior.map((participant) => [participant.participantKey, participant]));
  const participants = zoomRows.map((row, index) => {
    const email = typeof row.user_email === "string" ? row.user_email.trim() || null : null;
    const displayName = (row.name ?? row.user_name ?? "").trim() || "Unknown participant";
    const joinTime = parseTimestamp(row.join_time);
    const leaveTime = parseTimestamp(row.leave_time);
    const durationSeconds = Number.isFinite(Number(row.duration))
      ? Math.max(0, Math.floor(Number(row.duration)))
      : 0;
    const rawKey = row.id ?? row.user_id;
    const participantKey = rawKey !== undefined && rawKey !== null
      ? String(rawKey)
      : `row-${index}-${normalizeEmail(email) ?? displayName}-${joinTime?.toISOString() ?? "unknown"}`;
    const old = priorByKey.get(participantKey);
    const automaticMatch = findUniqueBusinessIdForEmail(email, businesses);

    return {
      sessionId,
      participantKey,
      displayName,
      email,
      joinTime,
      leaveTime,
      durationSeconds,
      matchedBusinessId: old?.ignoredAt ? null : old?.matchedBusinessId ?? automaticMatch,
      ignoredByStaffId: old?.ignoredByStaffId ?? null,
      ignoredAt: old?.ignoredAt ?? null,
      createdAt: old?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
  });

  await db.delete(zoomAttendanceParticipantsTable)
    .where(eq(zoomAttendanceParticipantsTable.sessionId, sessionId));
  if (participants.length > 0) {
    await db.insert(zoomAttendanceParticipantsTable).values(participants);
  }
  await rebuildSessionAttendance(sessionId);
}

async function processZoomAttendanceQueue(): Promise<void> {
  if (workerRunning || !hasZoomOAuthConfiguration()) return;
  workerRunning = true;
  try {
    const now = new Date();
    const queued = await db.select({
      id: zoomAttendanceSyncsTable.id,
      sessionId: zoomAttendanceSyncsTable.sessionId,
      attempts: zoomAttendanceSyncsTable.attempts,
    }).from(zoomAttendanceSyncsTable)
      .where(and(
        eq(zoomAttendanceSyncsTable.status, "queued"),
        or(
          isNull(zoomAttendanceSyncsTable.nextAttemptAt),
          lte(zoomAttendanceSyncsTable.nextAttemptAt, now),
        ),
      ))
      .orderBy(zoomAttendanceSyncsTable.createdAt)
      .limit(5);

    for (const item of queued) {
      const attempt = item.attempts + 1;
      const [claimed] = await db.update(zoomAttendanceSyncsTable).set({
        status: "syncing",
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(zoomAttendanceSyncsTable.id, item.id),
        eq(zoomAttendanceSyncsTable.status, "queued"),
      )).returning({ id: zoomAttendanceSyncsTable.id });
      if (!claimed) continue;

      try {
        await syncSession(item.sessionId);
        await db.update(zoomAttendanceSyncsTable).set({
          status: "completed",
          participantCount: (await db.select({ id: zoomAttendanceParticipantsTable.id })
            .from(zoomAttendanceParticipantsTable)
            .where(eq(zoomAttendanceParticipantsTable.sessionId, item.sessionId))).length,
          syncedAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
          updatedAt: new Date(),
        }).where(eq(zoomAttendanceSyncsTable.id, item.id));
      } catch (error) {
        const retry = isRetryable(error) && attempt < maxAttempts;
        const delay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)];
        await db.update(zoomAttendanceSyncsTable).set({
          status: retry ? "queued" : "failed",
          nextAttemptAt: retry ? new Date(Date.now() + delay) : null,
          lastError: safeErrorMessage(error),
          updatedAt: new Date(),
        }).where(eq(zoomAttendanceSyncsTable.id, item.id));
        logger.warn(
          { sessionId: item.sessionId, attempt, retry },
          "Zoom attendance sync attempt did not complete",
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Zoom attendance sync worker failed");
  } finally {
    workerRunning = false;
  }
}

export function startZoomAttendanceSyncWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processZoomAttendanceQueue();
  }, workerIntervalMs);
  workerTimer.unref?.();
  void processZoomAttendanceQueue();
}
