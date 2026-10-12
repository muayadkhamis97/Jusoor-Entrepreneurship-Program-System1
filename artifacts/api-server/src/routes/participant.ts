import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import {
  AskTrainingQuestionBody,
  AskTrainingQuestionResponse,
  GetParticipantCourseMaterialFileParams,
  GetParticipantCoursesResponse,
  GetParticipantDashboardResponse,
  MarkAnnouncementReadResponse,
  SubmitTrainingAnswerBody,
  SubmitTrainingAnswerParams,
  SubmitTrainingAnswerResponse,
} from "@workspace/api-zod";
import {
  announcementReceiptsTable,
  applicationsTable,
  businessesTable,
  calendlyMeetingsTable,
  courseMaterialsTable,
  courseModulesTable,
  db,
  programsTable,
  programAnnouncementsTable,
  sessionsTable,
  staffMembersTable,
  supportTable,
  trainingAssignmentsTable,
  trainingQuestionsTable,
  trainingSubmissionsTable,
} from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import { streamCourseMaterialFile } from "../lib/courseStorage";
import { getParticipantSupportForBusiness } from "../lib/participantBookingAccess";

const router: IRouter = Router();

router.get("/courses", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const enrolledPrograms = await db.select({
    programId: applicationsTable.programId,
    programName: programsTable.name,
  })
    .from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .innerJoin(businessesTable, eq(applicationsTable.businessId, businessesTable.id))
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ));
  const programs = new Map(enrolledPrograms.map(({ programId, programName }) => [
    programId,
    { programId, programName, modules: [] as Array<{
      id: number;
      title: string;
      description: string | null;
      position: number;
      releaseAt: string | null;
      materials: Array<{
        id: number;
        title: string;
        description: string | null;
        kind: string;
        externalUrl: string | null;
        fileName: string | null;
        contentType: string | null;
        fileSize: number | null;
      }>;
    }> },
  ]));
  const programIds = [...programs.keys()];
  if (!programIds.length) {
    res.json(GetParticipantCoursesResponse.parse({ programs: [] }));
    return;
  }
  const now = new Date();
  const modules = await db.select().from(courseModulesTable)
    .where(and(
      inArray(courseModulesTable.programId, programIds),
      eq(courseModulesTable.isPublished, true),
      or(isNull(courseModulesTable.releaseAt), lte(courseModulesTable.releaseAt, now)),
    ))
    .orderBy(asc(courseModulesTable.position));
  if (!modules.length) {
    res.json(GetParticipantCoursesResponse.parse({ programs: [...programs.values()] }));
    return;
  }
  const moduleIds = modules.map(({ id }) => id);
  const materials = await db.select().from(courseMaterialsTable)
    .where(inArray(courseMaterialsTable.moduleId, moduleIds))
    .orderBy(asc(courseMaterialsTable.position));
  for (const module of modules) {
    const targetProgram = programs.get(module.programId);
    if (!targetProgram) continue;
    targetProgram.modules.push({
      id: module.id,
      title: module.title,
      description: module.description,
      position: module.position,
      releaseAt: module.releaseAt?.toISOString() ?? null,
      materials: materials
        .filter((material) => material.moduleId === module.id && material.allowedRoles.includes("participant"))
        .map((material) => ({
          id: material.id,
          title: material.title,
          description: material.description,
          kind: material.kind,
          externalUrl: material.externalUrl,
          fileName: material.fileName,
          contentType: material.contentType,
          fileSize: material.fileSize,
        })),
    });
  }
  res.json(GetParticipantCoursesResponse.parse({ programs: [...programs.values()] }));
});

router.get("/courses/materials/:id/file", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess;
  const params = GetParticipantCourseMaterialFileParams.safeParse(req.params);
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [record] = await db.select({
    material: courseMaterialsTable,
    module: courseModulesTable,
  })
    .from(courseMaterialsTable)
    .innerJoin(courseModulesTable, eq(courseMaterialsTable.moduleId, courseModulesTable.id))
    .where(eq(courseMaterialsTable.id, params.data.id))
    .limit(1);
  if (!record || !record.material.objectPath) {
    res.status(404).json({ error: "Course material file not found." });
    return;
  }
  const released = record.module.isPublished &&
    (!record.module.releaseAt || record.module.releaseAt <= new Date());
  if (!released || !record.material.allowedRoles.includes("participant")) {
    res.status(403).json({ error: "This course material is not available to your role." });
    return;
  }
  const [enrollment] = await db.select({ id: applicationsTable.id })
    .from(applicationsTable)
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.programId, record.module.programId),
      eq(applicationsTable.status, "accepted"),
      isNotNull(applicationsTable.businessId),
    ))
    .limit(1);
  if (!enrollment) {
    res.status(403).json({ error: "This course is not part of your accepted enrollment." });
    return;
  }
  await streamCourseMaterialFile(
    req,
    res,
    record.material.objectPath,
    record.material.fileName,
    record.material.contentType,
  );
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const rows = await db.select({
    application: applicationsTable,
    program: programsTable,
    business: businessesTable,
  })
    .from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .leftJoin(businessesTable, eq(applicationsTable.businessId, businessesTable.id))
    .where(eq(applicationsTable.clerkUserId, participant.userId))
    .orderBy(desc(applicationsTable.createdAt));

  const eligible = rows.filter(({ application, business }) => application.status === "accepted" && business);
  const programIds = [...new Set(eligible.map(({ application }) => application.programId))];
  const businessIds = eligible.flatMap(({ business }) => business ? [business.id] : []);
  const announcementRows = programIds.length
    ? await db.select({
      announcement: programAnnouncementsTable,
      programName: programsTable.name,
      readAt: announcementReceiptsTable.readAt,
    }).from(programAnnouncementsTable)
      .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
      .leftJoin(announcementReceiptsTable, and(
        eq(announcementReceiptsTable.announcementId, programAnnouncementsTable.id),
        eq(announcementReceiptsTable.clerkUserId, participant.userId),
      ))
      .where(and(
        lte(programAnnouncementsTable.scheduledFor, new Date()),
        or(isNull(programAnnouncementsTable.programId), inArray(programAnnouncementsTable.programId, programIds)),
      ))
      .orderBy(desc(programAnnouncementsTable.scheduledFor))
    : [];

  const sessions = programIds.length
    ? await db.select({
      id: sessionsTable.id,
      programId: sessionsTable.programId,
      title: sessionsTable.title,
      type: sessionsTable.type,
      scheduledDate: sessionsTable.scheduledDate,
      startTime: sessionsTable.startTime,
      facilitator: sessionsTable.facilitator,
      deliveryMode: sessionsTable.deliveryMode,
      location: sessionsTable.location,
      zoomUrl: sessionsTable.zoomUrl,
      recordingUrl: sessionsTable.recordingUrl,
      status: sessionsTable.status,
    })
      .from(sessionsTable)
      .where(and(inArray(sessionsTable.programId, programIds), ne(sessionsTable.status, "cancelled")))
      .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime))
    : [];

  const support = businessIds.length
    ? await db.select({
      id: supportTable.id,
      businessId: supportTable.businessId,
      type: supportTable.type,
      provider: supportTable.provider,
      topic: supportTable.topic,
      scheduledDate: supportTable.scheduledDate,
      status: supportTable.status,
      calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
    })
      .from(supportTable)
      .leftJoin(staffMembersTable, eq(supportTable.mentorStaffId, staffMembersTable.id))
      .where(inArray(supportTable.businessId, businessIds))
      .orderBy(asc(supportTable.scheduledDate), asc(supportTable.id))
    : [];

  const calendlyMeetings = businessIds.length
    ? await db.selectDistinct({
      id: calendlyMeetingsTable.id,
      businessId: calendlyMeetingsTable.businessId,
      eventName: calendlyMeetingsTable.eventName,
      startsAt: calendlyMeetingsTable.startsAt,
      endsAt: calendlyMeetingsTable.endsAt,
      timezone: calendlyMeetingsTable.timezone,
      status: calendlyMeetingsTable.status,
    })
      .from(calendlyMeetingsTable)
      .innerJoin(supportTable, and(
        eq(supportTable.businessId, calendlyMeetingsTable.businessId),
        eq(supportTable.mentorStaffId, calendlyMeetingsTable.mentorStaffId),
        eq(supportTable.type, "mentor"),
      ))
      .where(inArray(calendlyMeetingsTable.businessId, businessIds))
      .orderBy(asc(calendlyMeetingsTable.startsAt))
    : [];
  const assignments = programIds.length
    ? await db.select({
      id: trainingAssignmentsTable.id,
      programId: trainingAssignmentsTable.programId,
      title: trainingAssignmentsTable.title,
      instructions: trainingAssignmentsTable.instructions,
      dueDate: trainingAssignmentsTable.dueDate,
      sessionTitle: sessionsTable.title,
    }).from(trainingAssignmentsTable)
      .leftJoin(sessionsTable, eq(trainingAssignmentsTable.sessionId, sessionsTable.id))
      .where(inArray(trainingAssignmentsTable.programId, programIds))
      .orderBy(asc(trainingAssignmentsTable.dueDate), desc(trainingAssignmentsTable.createdAt))
    : [];
  const submissions = businessIds.length
    ? await db.select().from(trainingSubmissionsTable)
      .where(inArray(trainingSubmissionsTable.businessId, businessIds))
    : [];
  const questions = businessIds.length
    ? await db.select({
      id: trainingQuestionsTable.id,
      businessId: trainingQuestionsTable.businessId,
      programId: trainingQuestionsTable.programId,
      sessionTitle: sessionsTable.title,
      assignmentTitle: trainingAssignmentsTable.title,
      question: trainingQuestionsTable.question,
      reply: trainingQuestionsTable.reply,
      createdAt: trainingQuestionsTable.createdAt,
      repliedAt: trainingQuestionsTable.repliedAt,
    }).from(trainingQuestionsTable)
      .leftJoin(sessionsTable, eq(trainingQuestionsTable.sessionId, sessionsTable.id))
      .leftJoin(trainingAssignmentsTable, eq(trainingQuestionsTable.assignmentId, trainingAssignmentsTable.id))
      .where(inArray(trainingQuestionsTable.businessId, businessIds))
      .orderBy(desc(trainingQuestionsTable.createdAt))
    : [];

  const result = rows.map(({ application, program, business }) => ({
    applicationId: application.id,
    applicationStatus: application.status,
    submittedAt: application.createdAt,
    program: {
      id: program.id,
      name: program.name,
      format: program.format,
      description: program.description,
      startDate: program.startDate,
      endDate: program.endDate,
    },
    business: business ? {
      id: business.id,
      businessName: business.businessName,
      industry: business.industry,
      stage: business.stage,
    } : null,
    sessions: application.status === "accepted" && business
      ? sessions.filter((session) => session.programId === application.programId).map(({ programId: _programId, ...session }) => session)
      : [],
    support: application.status === "accepted" && business
      ? getParticipantSupportForBusiness(support, business.id)
      : [],
    calendlyMeetings: application.status === "accepted" && business
      ? calendlyMeetings.filter((meeting) => meeting.businessId === business.id)
        .map(({ businessId: _businessId, ...meeting }) => meeting)
      : [],
    assignments: application.status === "accepted" && business
      ? assignments.filter((assignment) => assignment.programId === application.programId).map((assignment) => {
        const submission = submissions.find((item) =>
          item.assignmentId === assignment.id && item.businessId === business.id,
        );
        return {
          id: assignment.id,
          title: assignment.title,
          instructions: assignment.instructions,
          dueDate: assignment.dueDate,
          sessionTitle: assignment.sessionTitle,
          answer: submission?.answer ?? null,
          status: submission?.status ?? null,
          score: submission?.score ?? null,
          feedback: submission?.feedback ?? null,
          submittedAt: submission?.submittedAt ?? null,
        };
      })
      : [],
    questions: application.status === "accepted" && business
      ? questions.filter((question) => question.businessId === business.id && question.programId === application.programId)
        .map(({ businessId: _businessId, ...question }) => question)
      : [],
  }));

  const announcements = announcementRows.map(({ announcement, programName, readAt }) => ({
    id: announcement.id,
    programId: announcement.programId,
    programName,
    kind: announcement.kind,
    title: announcement.title,
    body: announcement.body,
    scheduledFor: announcement.scheduledFor,
    createdAt: announcement.createdAt,
    readAt,
  }));

  res.json(GetParticipantDashboardResponse.parse({ applications: result, announcements }));
});

router.post("/announcements/:id/read", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess;
  const announcementId = Number(req.params.id);
  if (!Number.isInteger(announcementId) || announcementId < 1) {
    res.status(400).json({ error: "Announcement ID must be a positive integer." });
    return;
  }
  const [announcement] = await db.select().from(programAnnouncementsTable)
    .where(eq(programAnnouncementsTable.id, announcementId)).limit(1);
  if (!announcement) {
    res.status(404).json({ error: "Announcement not found." });
    return;
  }
  if (announcement.scheduledFor > new Date()) {
    res.status(403).json({ error: "This announcement has not been published yet." });
    return;
  }
  const acceptedPrograms = await db.select({ programId: applicationsTable.programId })
    .from(applicationsTable)
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
      isNotNull(applicationsTable.businessId),
    ));
  const programIds = new Set(acceptedPrograms.map((item) => item.programId));
  if (!programIds.size || (announcement.programId !== null && !programIds.has(announcement.programId))) {
    res.status(403).json({ error: "This announcement is not available to this participant." });
    return;
  }
  await db.insert(announcementReceiptsTable)
    .values({ announcementId, clerkUserId: participant.userId })
    .onConflictDoNothing();
  const [receipt] = await db.select({ readAt: announcementReceiptsTable.readAt })
    .from(announcementReceiptsTable)
    .where(and(
      eq(announcementReceiptsTable.announcementId, announcementId),
      eq(announcementReceiptsTable.clerkUserId, participant.userId),
    ))
    .limit(1);
  res.json(MarkAnnouncementReadResponse.parse({ id: announcementId, readAt: receipt?.readAt ?? new Date() }));
});

router.post("/assignments/:id/submission", async (req, res): Promise<void> => {
  const params = SubmitTrainingAnswerParams.safeParse(req.params);
  const body = SubmitTrainingAnswerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const participant = res.locals.participant as ParticipantAccess;
  const [assignment] = await db.select().from(trainingAssignmentsTable)
    .where(eq(trainingAssignmentsTable.id, params.data.id)).limit(1);
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found." });
    return;
  }
  const [enrollment] = await db.select({
    businessId: applicationsTable.businessId,
  }).from(applicationsTable)
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.programId, assignment.programId),
      eq(applicationsTable.status, "accepted"),
    )).limit(1);
  if (!enrollment?.businessId) {
    res.status(403).json({ error: "This assignment is not part of your cohort." });
    return;
  }
  const [submission] = await db.insert(trainingSubmissionsTable).values({
    assignmentId: assignment.id,
    businessId: enrollment.businessId,
    answer: body.data.answer,
    status: "submitted",
  }).onConflictDoUpdate({
    target: [trainingSubmissionsTable.assignmentId, trainingSubmissionsTable.businessId],
    set: {
      answer: body.data.answer,
      status: "submitted",
      score: null,
      feedback: null,
      submittedAt: new Date(),
      reviewedAt: null,
    },
  }).returning();
  res.json(SubmitTrainingAnswerResponse.parse(submission));
});

router.post("/questions", async (req, res): Promise<void> => {
  const body = AskTrainingQuestionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const participant = res.locals.participant as ParticipantAccess;
  const [enrollment] = await db.select({
    businessId: applicationsTable.businessId,
  }).from(applicationsTable)
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.programId, body.data.programId),
      eq(applicationsTable.status, "accepted"),
    )).limit(1);
  if (!enrollment?.businessId) {
    res.status(403).json({ error: "This program is not part of your cohort." });
    return;
  }
  if (body.data.sessionId !== undefined && body.data.sessionId !== null) {
    const [session] = await db.select({ id: sessionsTable.id }).from(sessionsTable)
      .where(and(
        eq(sessionsTable.id, body.data.sessionId),
        eq(sessionsTable.programId, body.data.programId),
      ))
      .limit(1);
    if (!session) {
      res.status(400).json({ error: "That session does not belong to your cohort." });
      return;
    }
  }
  if (body.data.assignmentId !== undefined && body.data.assignmentId !== null) {
    const [assignment] = await db.select({ id: trainingAssignmentsTable.id }).from(trainingAssignmentsTable)
      .where(and(
        eq(trainingAssignmentsTable.id, body.data.assignmentId),
        eq(trainingAssignmentsTable.programId, body.data.programId),
      ))
      .limit(1);
    if (!assignment) {
      res.status(400).json({ error: "That assignment does not belong to your cohort." });
      return;
    }
  }
  const [question] = await db.insert(trainingQuestionsTable).values({
    ...body.data,
    businessId: enrollment.businessId,
    askedByClerkUserId: participant.userId,
  }).returning();
  const [session] = question.sessionId
    ? await db.select({ title: sessionsTable.title }).from(sessionsTable).where(eq(sessionsTable.id, question.sessionId)).limit(1)
    : [];
  const [assignment] = question.assignmentId
    ? await db.select({ title: trainingAssignmentsTable.title }).from(trainingAssignmentsTable).where(eq(trainingAssignmentsTable.id, question.assignmentId)).limit(1)
    : [];
  res.status(201).json(AskTrainingQuestionResponse.parse({
    ...question,
    sessionTitle: session?.title ?? null,
    assignmentTitle: assignment?.title ?? null,
  }));
});

export default router;
