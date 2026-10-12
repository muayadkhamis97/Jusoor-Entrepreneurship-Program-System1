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
  sessionsTable,
  staffMembersTable,
  zoomRecordingAlertsTable,
} from "@workspace/db";
import { isGoogleDriveRecordingUrl } from "../lib/zoom-recording-alerts";

const router: IRouter = Router();

router.get("/sessions", async (req, res): Promise<void> => {
  const query = ListSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filters = [];
  if (query.data.programId !== undefined) filters.push(eq(sessionsTable.programId, query.data.programId));
  if (query.data.type) filters.push(eq(sessionsTable.type, query.data.type));
  const sessions = await db.select().from(sessionsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime));
  res.json(ListSessionsResponse.parse(sessions));
});

router.post("/sessions", async (req, res): Promise<void> => {
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
  const [session] = await db.insert(sessionsTable).values(parsed.data).returning();
  res.status(201).json(CreateSessionResponse.parse(session));
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
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
  const [session] = await db.update(sessionsTable).set(body.data)
    .where(eq(sessionsTable.id, params.data.id)).returning();
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
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
