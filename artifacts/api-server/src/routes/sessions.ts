import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
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
  sessionsTable,
  staffMembersTable,
  zoomRecordingAlertsTable,
} from "@workspace/db";
import { isGoogleDriveRecordingUrl } from "../lib/zoom-recording-alerts";
import { getRecordingLinkTransition } from "../lib/participant-recording-notices";
import type { StaffAccess } from "../middlewares/staffAccess";

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
  const filters = [];
  if (query.data.programId !== undefined) filters.push(eq(sessionsTable.programId, query.data.programId));
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
    res.status(403).json({ error: "Coordinator or Program Staff access required." });
    return;
  }
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.trainerStaffId !== undefined && parsed.data.trainerStaffId !== null) {
    const [trainer] = await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
      .where(and(eq(staffMembersTable.id, parsed.data.trainerStaffId), eq(staffMembersTable.role, "trainer"))).limit(1);
    if (!trainer) {
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
    return created;
  });
  res.status(201).json(CreateSessionResponse.parse(session));
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  if (staff.role !== "coordinator" && staff.role !== "staff") {
    res.status(403).json({ error: "Coordinator or Program Staff access required." });
    return;
  }
  const params = DeleteSessionParams.safeParse(req.params);
  const body = UpdateSessionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  if (body.data.trainerStaffId !== undefined && body.data.trainerStaffId !== null) {
    const [trainer] = await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
      .where(and(eq(staffMembersTable.id, body.data.trainerStaffId), eq(staffMembersTable.role, "trainer"))).limit(1);
    if (!trainer) {
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
    res.status(403).json({ error: "Coordinator or Program Staff access required." });
    return;
  }
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [session] = await db.delete(sessionsTable).where(eq(sessionsTable.id, params.data.id)).returning();
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
