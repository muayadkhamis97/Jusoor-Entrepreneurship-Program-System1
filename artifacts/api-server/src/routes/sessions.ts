import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  CreateSessionBody,
  CreateSessionResponse,
  DeleteSessionParams,
  ListSessionsQueryParams,
  ListSessionsResponse,
  UpdateSessionBody,
  UpdateSessionParams,
  UpdateSessionResponse,
} from "@workspace/api-zod";
import {
  db,
  programAnnouncementsTable,
  programsTable,
  sessionsTable,
  staffMembersTable,
  zoomRecordingAlertsTable,
} from "@workspace/db";
import { isGoogleDriveRecordingUrl } from "../lib/zoom-recording-alerts";
import { getRecordingLinkTransition } from "../lib/participant-recording-notices";
import { activeProgramIdsFor } from "../lib/programScope";
import { queueProgramGoogleSheetsSnapshot } from "../lib/googleSheetsSync";
import type { StaffAccess } from "../middlewares/staffAccess";
import { hasProgramStaffRole } from "../lib/programStaffRoles";
import { getSessionTimeIssue } from "../lib/session-time";

const router: IRouter = Router();

router.get("/sessions", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  if (staff.role === "mentor" || staff.role === "judge") {
    res.status(403).json({ error: "Session access is not available for this role." });
    return;
  }
  const query = ListSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const activeProgramIds = await activeProgramIdsFor(staff);
  const filters = [];
  if (staff.role === "coordinator") {
    filters.push(activeProgramIds.length
      ? or(isNull(sessionsTable.programId), inArray(sessionsTable.programId, activeProgramIds))!
      : isNull(sessionsTable.programId));
  } else {
    if (activeProgramIds.length === 0) {
      res.json([]);
      return;
    }
    filters.push(inArray(sessionsTable.programId, activeProgramIds));
  }
  if (query.data.programId !== undefined) {
    if (!activeProgramIds.includes(query.data.programId)) {
      res.json([]);
      return;
    }
    filters.push(eq(sessionsTable.programId, query.data.programId));
  }
  if (query.data.type) filters.push(eq(sessionsTable.type, query.data.type));
  if (staff.role === "trainer") filters.push(eq(sessionsTable.trainerStaffId, staff.id));
  const sessions = await db.select().from(sessionsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime));
  res.json(ListSessionsResponse.parse(sessions));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  if (staff.role !== "coordinator" && staff.role !== "staff") {
    res.status(403).json({ error: "Admin or Program Staff access required." });
    return;
  }
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const activeProgramIds = await activeProgramIdsFor(staff);
  const programId = parsed.data.programId ?? null;
  if (programId === null && staff.role !== "coordinator") {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  if (programId !== null && !activeProgramIds.includes(programId)) {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  const [program] = programId === null
    ? []
    : await db.select({ timeZone: programsTable.timeZone })
      .from(programsTable)
      .where(eq(programsTable.id, programId))
      .limit(1);
  const timeZone = program?.timeZone || "Asia/Amman";
  const timeIssue = parsed.data.startTime
    ? getSessionTimeIssue(parsed.data.scheduledDate, parsed.data.startTime, timeZone)
    : null;
  if (timeIssue) {
    res.status(400).json({
      error: timeIssue === "nonexistent"
        ? `This local time does not exist in ${timeZone} because clocks move forward. Choose another start time before saving.`
        : timeIssue === "repeated"
          ? `This local time occurs twice in ${timeZone} because clocks move back. Choose a start time that occurs only once before saving.`
          : `The program time zone (${timeZone}) could not be checked. Ask an Admin to correct the time zone before saving.`,
    });
    return;
  }
  if (parsed.data.trainerStaffId !== undefined && parsed.data.trainerStaffId !== null) {
    const validTrainer = programId === null
      ? Boolean((await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
        .where(and(eq(staffMembersTable.id, parsed.data.trainerStaffId), eq(staffMembersTable.role, "trainer"))).limit(1))[0])
      : await hasProgramStaffRole(parsed.data.trainerStaffId, programId, "trainer");
    if (!validTrainer) {
      res.status(400).json({ error: "Select an account with the Trainer role." });
      return;
    }
  }
  const session = await db.transaction(async (tx) => {
    const recordingIsAvailable = isGoogleDriveRecordingUrl(parsed.data.recordingUrl);
    const recordingVersion = recordingIsAvailable ? 1 : 0;
    const [created] = await tx.insert(sessionsTable).values({
      ...parsed.data,
      ...(recordingIsAvailable ? { recordingVersion } : {}),
    }).returning();
    if (recordingIsAvailable && created.programId !== null) {
      await tx.insert(programAnnouncementsTable).values({
        programId: created.programId,
        sessionId: created.id,
        recordingVersion,
        kind: "update",
        title: `Recording ready: ${created.title}`,
        body: "The session recording is ready to watch.",
        scheduledFor: new Date(),
      }).onConflictDoNothing({
        target: [programAnnouncementsTable.sessionId, programAnnouncementsTable.recordingVersion],
      });
    }
    if (created.programId !== null) await queueProgramGoogleSheetsSnapshot(tx, created.programId);
    return created;
  });
  res.status(201).json(CreateSessionResponse.parse(session));
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  if (staff.role !== "coordinator" && staff.role !== "staff") {
    res.status(403).json({ error: "Admin or Program Staff access required." });
    return;
  }
  const params = DeleteSessionParams.safeParse(req.params);
  const body = UpdateSessionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const activeProgramIds = await activeProgramIdsFor(staff);
  const [scopeSession] = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.id)).limit(1);
  if (!scopeSession || (scopeSession.programId === null
    ? staff.role !== "coordinator"
    : !activeProgramIds.includes(scopeSession.programId))) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const nextProgramId = body.data.programId ?? scopeSession.programId;
  if (nextProgramId === null
    ? staff.role !== "coordinator"
    : !activeProgramIds.includes(nextProgramId)) {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  const [program] = nextProgramId === null
    ? []
    : await db.select({ timeZone: programsTable.timeZone })
      .from(programsTable)
      .where(eq(programsTable.id, nextProgramId))
      .limit(1);
  const timeZone = program?.timeZone || "Asia/Amman";
  const nextDate = body.data.scheduledDate ?? scopeSession.scheduledDate;
  const nextTime = body.data.startTime === undefined ? scopeSession.startTime : body.data.startTime;
  const timeIssue = nextTime ? getSessionTimeIssue(nextDate, nextTime, timeZone) : null;
  if (timeIssue) {
    res.status(400).json({
      error: timeIssue === "nonexistent"
        ? `This local time does not exist in ${timeZone} because clocks move forward. Choose another start time before saving.`
        : timeIssue === "repeated"
          ? `This local time occurs twice in ${timeZone} because clocks move back. Choose a start time that occurs only once before saving.`
          : `The program time zone (${timeZone}) could not be checked. Ask an Admin to correct the time zone before saving.`,
    });
    return;
  }
  if (body.data.trainerStaffId !== undefined && body.data.trainerStaffId !== null) {
    const validTrainer = nextProgramId === null
      ? Boolean((await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
        .where(and(eq(staffMembersTable.id, body.data.trainerStaffId), eq(staffMembersTable.role, "trainer"))).limit(1))[0])
      : await hasProgramStaffRole(body.data.trainerStaffId, nextProgramId, "trainer");
    if (!validTrainer) {
      res.status(400).json({ error: "Select an account with the Trainer role." });
      return;
    }
  }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.id))
      .limit(1)
      .for("update");
    if (!current) return null;
    if (current.programId === null
      ? staff.role !== "coordinator"
      : !activeProgramIds.includes(current.programId)) return null;
    const nextProgramId = body.data.programId === undefined ? current.programId : body.data.programId;
    if (nextProgramId === null
      ? staff.role !== "coordinator"
      : !activeProgramIds.includes(nextProgramId)) return null;

    const recordingUrl = body.data.recordingUrl !== undefined
      ? body.data.recordingUrl
      : current.recordingUrl;
    const recordingTransition = getRecordingLinkTransition(
      current.recordingUrl,
      recordingUrl,
      current.recordingVersion,
    );
    const recordingVersion = recordingTransition.recordingVersion;
    const [session] = await tx.update(sessionsTable)
      .set({
        ...body.data,
        ...(recordingTransition.shouldCreateNotice ? { recordingVersion } : {}),
      })
      .where(eq(sessionsTable.id, current.id))
      .returning();

    if (recordingTransition.shouldCreateNotice && session.programId !== null) {
      const scheduledFor = new Date();
      await tx.insert(programAnnouncementsTable).values({
        programId: session.programId,
        sessionId: session.id,
        recordingVersion,
        kind: "update",
        title: `Recording ready: ${session.title}`,
        body: "The session recording is ready to watch.",
        scheduledFor,
      }).onConflictDoNothing({
        target: [programAnnouncementsTable.sessionId, programAnnouncementsTable.recordingVersion],
      });
    }
    if (current.programId !== null) await queueProgramGoogleSheetsSnapshot(tx, current.programId);
    if (session.programId !== null && session.programId !== current.programId) {
      await queueProgramGoogleSheetsSnapshot(tx, session.programId);
    }
    return session;
  });
  if (!result) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const session = result;
  if (isGoogleDriveRecordingUrl(body.data.recordingUrl)) {
    await db
      .update(zoomRecordingAlertsTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(zoomRecordingAlertsTable.sessionId, session.id),
          isNull(zoomRecordingAlertsTable.resolvedAt),
        ),
      );
  }
  res.json(UpdateSessionResponse.parse(session));
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  if (staff.role !== "coordinator" && staff.role !== "staff") {
    res.status(403).json({ error: "Admin or Program Staff access required." });
    return;
  }
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const activeProgramIds = await activeProgramIdsFor(staff);
  const [current] = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.id)).limit(1);
  if (!current || (current.programId === null
    ? staff.role !== "coordinator"
    : !activeProgramIds.includes(current.programId))) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const session = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(sessionsTable).where(and(
      eq(sessionsTable.id, params.data.id),
      current.programId === null ? isNull(sessionsTable.programId) : eq(sessionsTable.programId, current.programId),
    )).returning();
    if (deleted?.programId !== null && deleted?.programId !== undefined) {
      await queueProgramGoogleSheetsSnapshot(tx, deleted.programId);
    }
    return deleted;
  });
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
