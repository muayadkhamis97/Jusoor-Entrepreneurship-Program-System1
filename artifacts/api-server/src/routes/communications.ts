import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateAnnouncementBody,
  CreateAnnouncementResponse,
  DeleteAnnouncementResponse,
  ListAnnouncementsResponse,
} from "@workspace/api-zod";
import { businessesTable, db, programAnnouncementsTable, programsTable } from "@workspace/db";
import { requireCoordinator } from "../middlewares/staffAccess";
import {
  businessBelongsToSelectedProgram,
  isMissingAnnouncementBusinessColumn,
} from "../lib/announcement-targeting";

const router: IRouter = Router();
router.use(requireCoordinator);

type AnnouncementListRow = {
  id: number;
  programId: number | null;
  businessId: number | null;
  programName: string | null;
  businessName: string | null;
  kind: string;
  title: string;
  body: string;
  scheduledFor: Date;
  createdAt: Date;
};

async function listAnnouncementRows(): Promise<AnnouncementListRow[]> {
  try {
    return await db.select({
      id: programAnnouncementsTable.id,
      programId: programAnnouncementsTable.programId,
      businessId: programAnnouncementsTable.businessId,
      programName: programsTable.name,
      businessName: businessesTable.businessName,
      kind: programAnnouncementsTable.kind,
      title: programAnnouncementsTable.title,
      body: programAnnouncementsTable.body,
      scheduledFor: programAnnouncementsTable.scheduledFor,
      createdAt: programAnnouncementsTable.createdAt,
    }).from(programAnnouncementsTable)
      .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
      .leftJoin(businessesTable, and(
        eq(programAnnouncementsTable.businessId, businessesTable.id),
        eq(programAnnouncementsTable.programId, businessesTable.programId),
      ))
      .orderBy(desc(programAnnouncementsTable.scheduledFor), desc(programAnnouncementsTable.createdAt));
  } catch (error) {
    if (!isMissingAnnouncementBusinessColumn(error)) throw error;
    const rows = await db.select({
      id: programAnnouncementsTable.id,
      programId: programAnnouncementsTable.programId,
      programName: programsTable.name,
      kind: programAnnouncementsTable.kind,
      title: programAnnouncementsTable.title,
      body: programAnnouncementsTable.body,
      scheduledFor: programAnnouncementsTable.scheduledFor,
      createdAt: programAnnouncementsTable.createdAt,
    }).from(programAnnouncementsTable)
      .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
      .orderBy(desc(programAnnouncementsTable.scheduledFor), desc(programAnnouncementsTable.createdAt));
    return rows.map(row => ({ ...row, businessId: null, businessName: null }));
  }
}

router.get("/communications", async (_req, res): Promise<void> => {
  const now = new Date();
  const announcements = (await listAnnouncementRows()).map(announcement => ({
    id: announcement.id,
    programId: announcement.programId,
    businessId: announcement.businessId,
    programName: announcement.programName,
    businessName: announcement.businessName,
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
  const businessId = input.businessId ?? null;
  if (businessId !== null && programId === null) {
    res.status(400).json({ error: "Select a program before targeting one of its businesses." });
    return;
  }
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
  let businessName: string | null = null;
  if (businessId !== null) {
    const [business] = await db.select({
      id: businessesTable.id,
      businessName: businessesTable.businessName,
      programId: businessesTable.programId,
    }).from(businessesTable)
      .where(eq(businessesTable.id, businessId))
      .limit(1);
    if (!business || !businessBelongsToSelectedProgram(business.programId, programId)) {
      res.status(400).json({ error: "Choose a business within the selected program." });
      return;
    }
    businessName = business.businessName;
  }
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : new Date();
  if (!Number.isFinite(scheduledFor.getTime())) {
    res.status(400).json({ error: "Publication time must be a valid date and time." });
    return;
  }
  const staff = res.locals.staff as { id: number };
  let announcement;
  try {
    [announcement] = await db.insert(programAnnouncementsTable).values({
    programId,
    ...(businessId === null ? {} : { businessId }),
    kind: input.kind,
    title,
    body,
    scheduledFor,
    createdByStaffId: staff.id,
    }).returning({
      id: programAnnouncementsTable.id,
      programId: programAnnouncementsTable.programId,
      kind: programAnnouncementsTable.kind,
      title: programAnnouncementsTable.title,
      body: programAnnouncementsTable.body,
      scheduledFor: programAnnouncementsTable.scheduledFor,
      createdAt: programAnnouncementsTable.createdAt,
    });
  } catch (error) {
    if (businessId !== null && isMissingAnnouncementBusinessColumn(error)) {
      res.status(503).json({
        error: "Business-targeted messages require the business announcement database update.",
      });
      return;
    }
    throw error;
  }
  const [program] = programId === null
    ? []
    : await db.select({ name: programsTable.name }).from(programsTable)
      .where(eq(programsTable.id, programId)).limit(1);

  res.status(201).json(CreateAnnouncementResponse.parse({
    id: announcement.id,
    programId: announcement.programId,
    businessId,
    programName: program?.name ?? null,
    businessName,
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
