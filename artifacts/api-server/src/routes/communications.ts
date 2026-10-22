import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import {
  CreateAnnouncementBody,
  CreateAnnouncementResponse,
  DeleteAnnouncementResponse,
  GetRecordingNoticeReceiptsParams,
  GetRecordingNoticeReceiptsResponse,
  ListAnnouncementsResponse,
} from "@workspace/api-zod";
import {
  announcementReceiptsTable,
  applicationsTable,
  businessesTable,
  db,
  programAnnouncementsTable,
  programsTable,
  sessionsTable,
} from "@workspace/db";
import { requireOperationsStaff, type StaffAccess } from "../middlewares/staffAccess";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import {
  businessBelongsToSelectedProgram,
  isMissingAnnouncementBusinessColumn,
} from "../lib/announcement-targeting";
import { isCurrentRecordingNotice } from "../lib/participant-recording-notices";

const router: IRouter = Router();
router.use("/communications", requireOperationsStaff);

async function announcementScope(staff: StaffAccess): Promise<SQL | undefined> {
  return staff.role === "coordinator"
    ? undefined
    : inArray(programAnnouncementsTable.programId, await activeProgramIdsFor(staff));
}

type AnnouncementListRow = {
  id: number;
  sessionId: number | null;
  recordingVersion: number | null;
  currentRecordingVersion: number | null;
  recordingUrl: string | null;
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

async function listAnnouncementRows(scope?: SQL): Promise<AnnouncementListRow[]> {
  try {
    return await db.select({
      id: programAnnouncementsTable.id,
      sessionId: programAnnouncementsTable.sessionId,
      recordingVersion: programAnnouncementsTable.recordingVersion,
      currentRecordingVersion: sessionsTable.recordingVersion,
      recordingUrl: sessionsTable.recordingUrl,
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
      .leftJoin(sessionsTable, eq(programAnnouncementsTable.sessionId, sessionsTable.id))
      .leftJoin(businessesTable, and(
        eq(programAnnouncementsTable.businessId, businessesTable.id),
        eq(programAnnouncementsTable.programId, businessesTable.programId),
      ))
      .where(scope)
      .orderBy(desc(programAnnouncementsTable.scheduledFor), desc(programAnnouncementsTable.createdAt));
  } catch (error) {
    if (!isMissingAnnouncementBusinessColumn(error)) throw error;
    const rows = await db.select({
      id: programAnnouncementsTable.id,
      sessionId: programAnnouncementsTable.sessionId,
      recordingVersion: programAnnouncementsTable.recordingVersion,
      currentRecordingVersion: sessionsTable.recordingVersion,
      recordingUrl: sessionsTable.recordingUrl,
      programId: programAnnouncementsTable.programId,
      programName: programsTable.name,
      kind: programAnnouncementsTable.kind,
      title: programAnnouncementsTable.title,
      body: programAnnouncementsTable.body,
      scheduledFor: programAnnouncementsTable.scheduledFor,
      createdAt: programAnnouncementsTable.createdAt,
    }).from(programAnnouncementsTable)
      .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
      .leftJoin(sessionsTable, eq(programAnnouncementsTable.sessionId, sessionsTable.id))
      .where(scope)
      .orderBy(desc(programAnnouncementsTable.scheduledFor), desc(programAnnouncementsTable.createdAt));
    return rows.map(row => ({ ...row, businessId: null, businessName: null }));
  }
}

router.get("/communications", async (_req, res): Promise<void> => {
  const now = new Date();
  const scope = await announcementScope(res.locals.staff as StaffAccess);
  const announcements = (await listAnnouncementRows(scope)).map(announcement => ({
    id: announcement.id,
    sessionId: announcement.sessionId,
    isCurrentRecordingNotice: isCurrentRecordingNotice({
      sessionId: announcement.sessionId,
      programId: announcement.programId,
      recordingVersion: announcement.recordingVersion,
    }, announcement.sessionId !== null &&
      announcement.currentRecordingVersion !== null &&
      announcement.recordingUrl !== null
      ? {
          id: announcement.sessionId,
          programId: announcement.programId,
          recordingVersion: announcement.currentRecordingVersion,
          recordingUrl: announcement.recordingUrl,
        }
      : null),
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

router.get("/communications/:id/read-receipts", async (req, res): Promise<void> => {
  const params = GetRecordingNoticeReceiptsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scope = await announcementScope(res.locals.staff as StaffAccess);
  const [announcement] = await db.select({
    id: programAnnouncementsTable.id,
    sessionId: programAnnouncementsTable.sessionId,
    programId: programAnnouncementsTable.programId,
    recordingVersion: programAnnouncementsTable.recordingVersion,
    scheduledFor: programAnnouncementsTable.scheduledFor,
  }).from(programAnnouncementsTable)
    .where(and(eq(programAnnouncementsTable.id, params.data.id), scope))
    .limit(1);
  if (!announcement?.sessionId) {
    res.status(404).json({ error: "Current recording notice not found." });
    return;
  }

  const [session] = await db.select({
    id: sessionsTable.id,
    programId: sessionsTable.programId,
    title: sessionsTable.title,
    recordingVersion: sessionsTable.recordingVersion,
    recordingUrl: sessionsTable.recordingUrl,
  }).from(sessionsTable)
    .where(eq(sessionsTable.id, announcement.sessionId))
    .limit(1);
  if (
    !session ||
    session.programId === null ||
    announcement.scheduledFor > new Date() ||
    !isCurrentRecordingNotice(announcement, session)
  ) {
    res.status(404).json({ error: "Current recording notice not found." });
    return;
  }

  const participants = await db.select({
    founderName: applicationsTable.founderName,
    email: applicationsTable.email,
    readAt: announcementReceiptsTable.readAt,
  }).from(applicationsTable)
    .leftJoin(announcementReceiptsTable, and(
      eq(announcementReceiptsTable.announcementId, announcement.id),
      eq(announcementReceiptsTable.clerkUserId, applicationsTable.clerkUserId),
    ))
    .where(and(
      eq(applicationsTable.programId, session.programId),
      eq(applicationsTable.status, "accepted"),
    ))
    .orderBy(asc(applicationsTable.founderName), asc(applicationsTable.email));

  res.json(GetRecordingNoticeReceiptsResponse.parse({
    announcementId: announcement.id,
    sessionId: session.id,
    sessionTitle: session.title,
    recordingVersion: session.recordingVersion,
    participants,
  }));
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
  const staff = res.locals.staff as StaffAccess;
  if (staff.role !== "coordinator" && (programId === null || !await canAccessActiveProgram(staff, programId))) {
    res.status(403).json({ error: "Choose an active program assigned to your account. Only Admins can message all programs." });
    return;
  }
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
    sessionId: null,
    isCurrentRecordingNotice: false,
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
    .where(and(eq(programAnnouncementsTable.id, id), await announcementScope(res.locals.staff as StaffAccess)))
    .returning({ id: programAnnouncementsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Announcement not found." });
    return;
  }
  res.json(DeleteAnnouncementResponse.parse(deleted));
});

export default router;
