import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  CreateAnnouncementBody,
  CreateAnnouncementResponse,
  DeleteAnnouncementResponse,
  ListAnnouncementsResponse,
} from "@workspace/api-zod";
import { db, programAnnouncementsTable, programsTable } from "@workspace/db";
import { requireCoordinator } from "../middlewares/staffAccess";

const router: IRouter = Router();
router.use(requireCoordinator);

router.get("/communications", async (_req, res): Promise<void> => {
  const rows = await db.select({
    announcement: programAnnouncementsTable,
    programName: programsTable.name,
  }).from(programAnnouncementsTable)
    .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
    .orderBy(desc(programAnnouncementsTable.scheduledFor), desc(programAnnouncementsTable.createdAt));

  const now = new Date();
  const announcements = rows.map(({ announcement, programName }) => ({
    id: announcement.id,
    programId: announcement.programId,
    programName,
    kind: announcement.kind,
    title: announcement.title,
    body: announcement.body,
    scheduledFor: announcement.scheduledFor,
    createdAt: announcement.createdAt,
    status: announcement.scheduledFor > now ? "scheduled" : "published",
  }));
  res.json(ListAnnouncementsResponse.parse(announcements));
});

router.post("/communications", async (req, res): Promise<void> => {
  const parsed = CreateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || body.length < 5) {
    res.status(400).json({ error: "Enter a title and message with at least 3 and 5 non-space characters." });
    return;
  }
  const programId = input.programId ?? null;
  if (programId !== null) {
    const [program] = await db.select({ id: programsTable.id })
      .from(programsTable)
      .where(eq(programsTable.id, programId))
      .limit(1);
    if (!program) {
      res.status(400).json({ error: "Choose an existing program or send to all cohorts." });
      return;
    }
  }
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : new Date();
  if (!Number.isFinite(scheduledFor.getTime())) {
    res.status(400).json({ error: "Publication time must be a valid date and time." });
    return;
  }
  const staff = res.locals.staff as { id: number };
  const [announcement] = await db.insert(programAnnouncementsTable).values({
    programId,
    kind: input.kind,
    title,
    body,
    scheduledFor,
    createdByStaffId: staff.id,
  }).returning();
  const [program] = programId === null
    ? []
    : await db.select({ name: programsTable.name }).from(programsTable)
      .where(eq(programsTable.id, programId)).limit(1);

  res.status(201).json(CreateAnnouncementResponse.parse({
    id: announcement.id,
    programId: announcement.programId,
    programName: program?.name ?? null,
    kind: announcement.kind,
    title: announcement.title,
    body: announcement.body,
    scheduledFor: announcement.scheduledFor,
    createdAt: announcement.createdAt,
    status: announcement.scheduledFor > new Date() ? "scheduled" : "published",
  }));
});

router.delete("/communications/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Announcement ID must be a positive integer." });
    return;
  }
  const [deleted] = await db.delete(programAnnouncementsTable)
    .where(eq(programAnnouncementsTable.id, id))
    .returning({ id: programAnnouncementsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Announcement not found." });
    return;
  }
  res.json(DeleteAnnouncementResponse.parse(deleted));
});

export default router;
