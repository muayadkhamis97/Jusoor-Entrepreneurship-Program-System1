import { Router, type IRouter, type Response } from "express";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  announcementRepliesTable, applicationsTable, businessesTable, db,
  participantBusinessMembershipsTable, programAnnouncementsTable, programsTable, sessionsTable,
} from "@workspace/db";
import {
  ListParticipantAnnouncementRepliesParams, ListParticipantAnnouncementRepliesResponse,
  ListStaffAnnouncementRepliesResponse,
  SendParticipantAnnouncementReplyParams, SendParticipantAnnouncementReplyBody,
  SendParticipantAnnouncementReplyResponse, SendStaffAnnouncementReplyResponse,
  ReadParticipantAnnouncementRepliesBody,
} from "@workspace/api-zod";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { activeProgramIdsFor } from "../lib/programScope";
import { isCurrentRecordingNotice } from "../lib/participant-recording-notices";
import { sendStaffReplyNotification } from "../lib/announcement-reply-email";

type Actor = { kind: "participant"; participant: ParticipantAccess } | { kind: "staff"; staff: StaffAccess };

// The application is the private thread owner, never the business. Acceptance,
// active program, original audience and current ownership are checked each time.
async function eligibleApplications(announcementId: number, actor: Actor, applicationId?: number) {
  const activeIds = actor.kind === "staff" ? await activeProgramIdsFor(actor.staff) : null;
  if (activeIds?.length === 0) return null;
  const [announcement] = await db.select({
    programId: programAnnouncementsTable.programId,
    businessId: programAnnouncementsTable.businessId,
    sessionId: programAnnouncementsTable.sessionId,
    recordingVersion: programAnnouncementsTable.recordingVersion,
  }).from(programAnnouncementsTable)
    .where(and(eq(programAnnouncementsTable.id, announcementId),
      lte(programAnnouncementsTable.scheduledFor, new Date()))).limit(1);
  if (!announcement) return null;
  if (activeIds && announcement.programId !== null && !activeIds.includes(announcement.programId)) return null;
  if (announcement.sessionId !== null) {
    const [session] = await db.select({
      id: sessionsTable.id, programId: sessionsTable.programId,
      recordingVersion: sessionsTable.recordingVersion, recordingUrl: sessionsTable.recordingUrl,
    }).from(sessionsTable)
      .where(eq(sessionsTable.id, announcement.sessionId)).limit(1);
    if (!isCurrentRecordingNotice(announcement, session)) return null;
  }
  const rows = await db.select({
    applicationId: applicationsTable.id,
    participantEmail: applicationsTable.email,
    programName: programsTable.name,
    participantName: applicationsTable.founderName,
    businessName: businessesTable.businessName,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(programsTable.id, applicationsTable.programId))
    .leftJoin(participantBusinessMembershipsTable,
      eq(participantBusinessMembershipsTable.applicationId, applicationsTable.id))
    .leftJoin(businessesTable, and(
      eq(businessesTable.programId, applicationsTable.programId),
      eq(businessesTable.id, sql`coalesce(${applicationsTable.businessId}, ${participantBusinessMembershipsTable.businessId})`),
    ))
    .where(and(
      eq(applicationsTable.status, "accepted"),
      isNull(programsTable.archivedAt),
      applicationId === undefined ? undefined : eq(applicationsTable.id, applicationId),
      actor.kind === "participant" ? eq(applicationsTable.clerkUserId, actor.participant.userId)
        : inArray(applicationsTable.programId, activeIds!),
      announcement.programId === null ? undefined : eq(applicationsTable.programId, announcement.programId),
      announcement.businessId === null ? undefined : and(
        eq(businessesTable.id, announcement.businessId),
        announcement.programId === null ? sql`false` : eq(businessesTable.programId, announcement.programId),
      ),
    ));
  return [...new Map(rows.map(row => [row.applicationId, row])).values()];
}

export function createAnnouncementRepliesRouter(kind: Actor["kind"]): IRouter {
  const router: IRouter = Router();
  router.use((_req, res, next): void => {
    if (kind === "participant" ? !res.locals.participant : !res.locals.staff) {
      res.status(401).json({ error: "Sign in to view private replies." }); return;
    }
    if (kind === "staff" && !["coordinator", "staff"].includes(res.locals.staff.role)) {
      res.status(403).json({ error: "Program team access is required." }); return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  const actorFor = (res: Response): Actor => kind === "participant"
    ? { kind, participant: res.locals.participant as ParticipantAccess }
    : { kind, staff: res.locals.staff as StaffAccess };

  router.get("/:id/replies", async (req, res): Promise<void> => {
    const parsed = ListParticipantAnnouncementRepliesParams.safeParse(req.params);
    if (!parsed.success) { res.status(400).json({ error: "Invalid announcement ID." }); return; }
    const applications = await eligibleApplications(parsed.data.id, actorFor(res));
    if (applications === null || (kind === "participant" && !applications.length)) {
      res.status(404).json({ error: "Private replies are not available for this announcement." }); return;
    }
    if (!applications.length) { res.json([]); return; }
    const messages = await db.select().from(announcementRepliesTable).where(and(
      eq(announcementRepliesTable.announcementId, parsed.data.id),
      inArray(announcementRepliesTable.applicationId, applications.map(row => row.applicationId)),
    )).orderBy(asc(announcementRepliesTable.id));
    const conversations = applications.map(application => {
      const replies = messages.filter(message => message.applicationId === application.applicationId);
      return {
        applicationId: application.applicationId,
        programName: application.programName,
        participantName: application.participantName,
        businessName: application.businessName,
        unreadCount: replies.filter(message => message.sender !== kind && message.readAt === null).length,
        messages: kind === "staff"
          ? replies.map(({ id, sender, body, createdAt, readAt, emailNotificationStatus, emailNotificationFailureKind }) => ({
            id, sender, body, createdAt, readAt, emailNotificationStatus, emailNotificationFailureKind,
          }))
          : replies.map(({ id, sender, body, createdAt, readAt }) => ({ id, sender, body, createdAt, readAt })),
      };
    }).filter(conversation => kind === "participant" || conversation.messages.length > 0);
    res.json(kind === "staff"
      ? ListStaffAnnouncementRepliesResponse.parse(conversations)
      : ListParticipantAnnouncementRepliesResponse.parse(conversations));
  });

  router.post("/:id/replies/:applicationId", async (req, res): Promise<void> => {
    const params = SendParticipantAnnouncementReplyParams.safeParse(req.params);
    const input = SendParticipantAnnouncementReplyBody.safeParse(req.body);
    if (!params.success || !input.success || !input.data.body.trim()) {
      res.status(400).json({ error: "Enter a reply of 1–5,000 characters and valid identifiers." }); return;
    }
    const applications = await eligibleApplications(params.data.id, actorFor(res), params.data.applicationId);
    if (!applications?.length) {
      res.status(404).json({ error: "Private conversation not found." }); return;
    }
    // Staff respond only to conversations initiated by the participant.
    if (kind === "staff") {
      const [existing] = await db.select({ id: announcementRepliesTable.id }).from(announcementRepliesTable)
        .where(and(eq(announcementRepliesTable.announcementId, params.data.id),
          eq(announcementRepliesTable.applicationId, params.data.applicationId))).limit(1);
      if (!existing) { res.status(404).json({ error: "Private conversation not found." }); return; }
    }
    const [reply] = await db.insert(announcementRepliesTable).values({
      announcementId: params.data.id, applicationId: params.data.applicationId,
      sender: kind, staffId: kind === "staff" ? (res.locals.staff as StaffAccess).id : null,
      body: input.data.body.trim(),
    }).returning();
    if (kind === "participant") {
      res.status(201).json(SendParticipantAnnouncementReplyResponse.parse(reply));
      return;
    }

    const application = applications[0];
    const notification = await sendStaffReplyNotification({
      replyId: reply.id,
      announcementId: params.data.id,
      applicationId: application.applicationId,
      participantEmail: application.participantEmail,
      participantName: application.participantName,
      programName: application.programName,
    }, process.env.REPLIT_APP_URL);
    const [savedReply] = await db.update(announcementRepliesTable).set({
      emailNotificationStatus: notification.status,
      emailNotificationFailureKind: notification.failureKind,
    }).where(eq(announcementRepliesTable.id, reply.id)).returning();
    if (notification.status !== "sent") {
      req.log.warn({
        replyId: reply.id,
        applicationId: application.applicationId,
        notificationStatus: notification.status,
        failureKind: notification.failureKind,
      }, "Private reply email notification was not confirmed");
    }
    res.status(201).json(SendStaffAnnouncementReplyResponse.parse(savedReply ?? {
      ...reply,
      emailNotificationStatus: notification.status,
      emailNotificationFailureKind: notification.failureKind,
    }));
  });

  router.post("/:id/replies/:applicationId/read", async (req, res): Promise<void> => {
    const params = SendParticipantAnnouncementReplyParams.safeParse(req.params);
    const input = ReadParticipantAnnouncementRepliesBody.safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({ error: "Invalid conversation or read position." }); return;
    }
    if (!(await eligibleApplications(params.data.id, actorFor(res), params.data.applicationId))?.length) {
      res.status(404).json({ error: "Private conversation not found." }); return;
    }
    await db.update(announcementRepliesTable).set({ readAt: new Date() }).where(and(
      eq(announcementRepliesTable.announcementId, params.data.id),
      eq(announcementRepliesTable.applicationId, params.data.applicationId),
      eq(announcementRepliesTable.sender, kind === "staff" ? "participant" : "staff"),
      isNull(announcementRepliesTable.readAt),
      lte(announcementRepliesTable.id, input.data.throughId),
    ));
    res.sendStatus(204);
  });
  return router;
}
