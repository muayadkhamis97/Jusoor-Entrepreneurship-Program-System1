import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  AskTrainingQuestionBody,
  AskTrainingQuestionResponse,
  GetParticipantCourseMaterialFileParams,
  GetParticipantCoursesResponse,
  GetParticipantDashboardResponse,
  GetParticipantIdeaValidationResponse,
  GetParticipantBusinessPlansResponse,
  GetParticipantBusinessTeamsResponse,
  GetParticipantPeerDirectoryParams,
  GetParticipantPeerDirectoryResponse,
  MarkAnnouncementReadResponse,
  SaveParticipantBusinessPlanBody,
  SaveParticipantBusinessPlanParams,
  SaveParticipantBusinessPlanResponse,
  SaveParticipantIdeaValidationBody,
  SaveParticipantIdeaValidationParams,
  SaveParticipantIdeaValidationResponse,
  SubmitTrainingAnswerBody,
  SubmitTrainingAnswerParams,
  SubmitTrainingAnswerResponse,
  UpdateParticipantPeerDirectoryPreferencesBody,
  UpdateParticipantPeerDirectoryPreferencesParams,
  UpdateParticipantPeerDirectoryPreferencesResponse,
} from "@workspace/api-zod";
import {
  announcementReceiptsTable,
  applicationsTable,
  businessesTable,
  calendlyMeetingsTable,
  courseMaterialsTable,
  courseModulesTable,
  db,
  ideaValidationWorkbooksTable,
  participantBusinessPlansTable,
  participantBusinessMembershipsTable,
  participantPeerDirectoryPreferencesTable,
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
import {
  canParticipantAccessRecordingNotice,
  isCurrentRecordingNotice,
} from "../lib/participant-recording-notices";
import { participantBusinessTeamMembers } from "../lib/participantBusinessTeamAccess";
import { getAdminInvitedApplicationIds } from "../lib/participantInvitations";
import {
  canParticipantAccessAnnouncement,
  isMissingAnnouncementBusinessColumn,
  isMissingBusinessMembershipTable,
} from "../lib/announcement-targeting";

const router: IRouter = Router();

const isUndefinedRelation = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");

const participantTargetBusinessTable = alias(businessesTable, "participant_target_business");

async function getAcceptedParticipantBusinessPrograms(userId: string): Promise<Map<number, number>> {
  try {
    const rows = await db.select({
      businessId: participantTargetBusinessTable.id,
      programId: participantTargetBusinessTable.programId,
    })
      .from(applicationsTable)
      .leftJoin(participantBusinessMembershipsTable, eq(
        participantBusinessMembershipsTable.applicationId,
        applicationsTable.id,
      ))
      .innerJoin(participantTargetBusinessTable, and(
        eq(participantTargetBusinessTable.programId, applicationsTable.programId),
        or(
          and(
            isNotNull(applicationsTable.businessId),
            eq(participantTargetBusinessTable.id, applicationsTable.businessId),
          ),
          and(
            isNull(applicationsTable.businessId),
            eq(participantTargetBusinessTable.id, participantBusinessMembershipsTable.businessId),
          ),
        ),
      ))
      .where(and(
        eq(applicationsTable.clerkUserId, userId),
        eq(applicationsTable.status, "accepted"),
      ));
    return new Map(rows.map(({ businessId, programId }) => [businessId, programId]));
  } catch (error) {
    if (!isMissingBusinessMembershipTable(error)) throw error;
    const rows = await db.select({
      businessId: businessesTable.id,
      programId: businessesTable.programId,
    })
      .from(applicationsTable)
      .innerJoin(businessesTable, and(
        eq(applicationsTable.businessId, businessesTable.id),
        eq(applicationsTable.programId, businessesTable.programId),
      ))
      .where(and(
        eq(applicationsTable.clerkUserId, userId),
        eq(applicationsTable.status, "accepted"),
      ));
    return new Map(rows.map(({ businessId, programId }) => [businessId, programId]));
  }
}

type ParticipantAnnouncementDbRow = {
  announcement: {
    id: number;
    programId: number | null;
    businessId: number | null;
    sessionId: number | null;
    recordingVersion: number | null;
    kind: string;
    title: string;
    body: string;
    scheduledFor: Date;
    createdAt: Date;
  };
  programName: string | null;
  businessName: string | null;
  readAt: Date | null;
  sessionId: number | null;
  recordingVersion: number | null;
  sessionProgramId: number | null;
  currentRecordingVersion: number | null;
  sessionTitle: string | null;
  sessionDate: string | null;
  recordingUrl: string | null;
};

async function listParticipantAnnouncementRows(
  userId: string,
  acceptedProgramIds: number[],
): Promise<ParticipantAnnouncementDbRow[]> {
  try {
    return await db.select({
      announcement: {
        id: programAnnouncementsTable.id,
        programId: programAnnouncementsTable.programId,
        businessId: programAnnouncementsTable.businessId,
        sessionId: programAnnouncementsTable.sessionId,
        recordingVersion: programAnnouncementsTable.recordingVersion,
        kind: programAnnouncementsTable.kind,
        title: programAnnouncementsTable.title,
        body: programAnnouncementsTable.body,
        scheduledFor: programAnnouncementsTable.scheduledFor,
        createdAt: programAnnouncementsTable.createdAt,
      },
      programName: programsTable.name,
      businessName: businessesTable.businessName,
      readAt: announcementReceiptsTable.readAt,
      sessionId: programAnnouncementsTable.sessionId,
      recordingVersion: programAnnouncementsTable.recordingVersion,
      sessionProgramId: sessionsTable.programId,
      currentRecordingVersion: sessionsTable.recordingVersion,
      sessionTitle: sessionsTable.title,
      sessionDate: sessionsTable.scheduledDate,
      recordingUrl: sessionsTable.recordingUrl,
    }).from(programAnnouncementsTable)
      .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
      .leftJoin(businessesTable, and(
        eq(programAnnouncementsTable.businessId, businessesTable.id),
        eq(programAnnouncementsTable.programId, businessesTable.programId),
      ))
      .leftJoin(sessionsTable, eq(programAnnouncementsTable.sessionId, sessionsTable.id))
      .leftJoin(announcementReceiptsTable, and(
        eq(announcementReceiptsTable.announcementId, programAnnouncementsTable.id),
        eq(announcementReceiptsTable.clerkUserId, userId),
      ))
      .where(and(
        lte(programAnnouncementsTable.scheduledFor, new Date()),
        or(isNull(programAnnouncementsTable.programId), inArray(programAnnouncementsTable.programId, acceptedProgramIds)),
      ))
      .orderBy(desc(programAnnouncementsTable.scheduledFor));
  } catch (error) {
    if (!isMissingAnnouncementBusinessColumn(error)) throw error;
    const rows = await db.select({
      announcement: {
        id: programAnnouncementsTable.id,
        programId: programAnnouncementsTable.programId,
        sessionId: programAnnouncementsTable.sessionId,
        recordingVersion: programAnnouncementsTable.recordingVersion,
        kind: programAnnouncementsTable.kind,
        title: programAnnouncementsTable.title,
        body: programAnnouncementsTable.body,
        scheduledFor: programAnnouncementsTable.scheduledFor,
        createdAt: programAnnouncementsTable.createdAt,
      },
      programName: programsTable.name,
      readAt: announcementReceiptsTable.readAt,
      sessionId: programAnnouncementsTable.sessionId,
      recordingVersion: programAnnouncementsTable.recordingVersion,
      sessionProgramId: sessionsTable.programId,
      currentRecordingVersion: sessionsTable.recordingVersion,
      sessionTitle: sessionsTable.title,
      sessionDate: sessionsTable.scheduledDate,
      recordingUrl: sessionsTable.recordingUrl,
    }).from(programAnnouncementsTable)
      .leftJoin(programsTable, eq(programAnnouncementsTable.programId, programsTable.id))
      .leftJoin(sessionsTable, eq(programAnnouncementsTable.sessionId, sessionsTable.id))
      .leftJoin(announcementReceiptsTable, and(
        eq(announcementReceiptsTable.announcementId, programAnnouncementsTable.id),
        eq(announcementReceiptsTable.clerkUserId, userId),
      ))
      .where(and(
        lte(programAnnouncementsTable.scheduledFor, new Date()),
        or(isNull(programAnnouncementsTable.programId), inArray(programAnnouncementsTable.programId, acceptedProgramIds)),
      ))
      .orderBy(desc(programAnnouncementsTable.scheduledFor));
    return rows.map(row => ({
      ...row,
      announcement: { ...row.announcement, businessId: null },
      businessName: null,
    }));
  }
}

router.get("/business-teams", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  try {
    await db.select({ id: participantBusinessMembershipsTable.id })
      .from(participantBusinessMembershipsTable)
      .limit(1);
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
    res.status(503).json({
      error: "Participant business teams require the additive assignment database migration.",
    });
    return;
  }

  const ownApplications = await db.select({
    id: applicationsTable.id,
    businessId: applicationsTable.businessId,
    programId: applicationsTable.programId,
  }).from(applicationsTable)
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ));
  const ownApplicationIds = ownApplications.map(({ id }) => id);
  const ownMemberships = ownApplicationIds.length
    ? await db.select({
      applicationId: participantBusinessMembershipsTable.applicationId,
      businessId: participantBusinessMembershipsTable.businessId,
    }).from(participantBusinessMembershipsTable)
      .where(inArray(participantBusinessMembershipsTable.applicationId, ownApplicationIds))
    : [];
  const businessIds = [...new Set([
    ...ownApplications.flatMap(({ businessId }) => businessId === null ? [] : [businessId]),
    ...ownMemberships.map(({ businessId }) => businessId),
  ])];
  if (!businessIds.length) {
    res.json(GetParticipantBusinessTeamsResponse.parse([]));
    return;
  }

  const candidateBusinesses = await db.select({
      businessId: businessesTable.id,
      businessName: businessesTable.businessName,
      industry: businessesTable.industry,
      stage: businessesTable.stage,
      programId: programsTable.id,
      programName: programsTable.name,
    }).from(businessesTable)
      .innerJoin(programsTable, eq(programsTable.id, businessesTable.programId))
      .where(inArray(businessesTable.id, businessIds))
      .orderBy(asc(programsTable.name), asc(businessesTable.businessName));
  const businesses = candidateBusinesses.filter((business) => ownApplications.some((application) =>
    application.programId === business.programId && (
      application.businessId === business.businessId ||
      ownMemberships.some((membership) =>
        membership.applicationId === application.id && membership.businessId === business.businessId,
      )
    ),
  ));
  const allowedBusinessIds = businesses.map(({ businessId }) => businessId);
  if (!allowedBusinessIds.length) {
    res.json(GetParticipantBusinessTeamsResponse.parse([]));
    return;
  }
  const membershipRows = await db.select({
      applicationId: applicationsTable.id,
      programId: applicationsTable.programId,
      primaryBusinessId: applicationsTable.businessId,
      membershipBusinessId: participantBusinessMembershipsTable.businessId,
      founderName: applicationsTable.founderName,
      clerkUserId: applicationsTable.clerkUserId,
    }).from(applicationsTable)
      .leftJoin(
        participantBusinessMembershipsTable,
        eq(participantBusinessMembershipsTable.applicationId, applicationsTable.id),
      )
      .where(and(
        eq(applicationsTable.status, "accepted"),
        or(
          inArray(applicationsTable.businessId, allowedBusinessIds),
          inArray(participantBusinessMembershipsTable.businessId, allowedBusinessIds),
        ),
      ))
      .orderBy(asc(applicationsTable.founderName), asc(applicationsTable.id));

  res.json(GetParticipantBusinessTeamsResponse.parse(businesses.map((business) => ({
    programId: business.programId,
    programName: business.programName,
    businessId: business.businessId,
    businessName: business.businessName,
    industry: business.industry,
    stage: business.stage,
    members: participantBusinessTeamMembers(business, membershipRows, participant.userId),
  }))));
});

router.get("/programs/:programId/peers", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const params = GetParticipantPeerDirectoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [application] = await db.select({
    applicationId: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.programId, params.data.programId),
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ))
    .limit(1);

  if (!application) {
    res.status(404).json({ error: "Accepted application not found for this participant." });
    return;
  }

  const [savedPreferences] = await db.select({
    isListed: participantPeerDirectoryPreferencesTable.isListed,
    shareEmail: participantPeerDirectoryPreferencesTable.shareEmail,
    sharePhone: participantPeerDirectoryPreferencesTable.sharePhone,
  }).from(participantPeerDirectoryPreferencesTable)
    .where(eq(participantPeerDirectoryPreferencesTable.applicationId, application.applicationId))
    .limit(1);

  const peerRows = await db.select({
    founderName: applicationsTable.founderName,
    businessName: applicationsTable.businessName,
    industry: applicationsTable.industry,
    email: applicationsTable.email,
    phone: applicationsTable.phone,
    shareEmail: participantPeerDirectoryPreferencesTable.shareEmail,
    sharePhone: participantPeerDirectoryPreferencesTable.sharePhone,
  }).from(participantPeerDirectoryPreferencesTable)
    .innerJoin(applicationsTable, eq(participantPeerDirectoryPreferencesTable.applicationId, applicationsTable.id))
    .where(and(
      eq(applicationsTable.programId, application.programId),
      eq(applicationsTable.status, "accepted"),
      eq(participantPeerDirectoryPreferencesTable.isListed, true),
      ne(applicationsTable.id, application.applicationId),
    ))
    .orderBy(asc(applicationsTable.founderName), asc(applicationsTable.businessName));

  res.json(GetParticipantPeerDirectoryResponse.parse({
    programId: application.programId,
    programName: application.programName,
    preferences: savedPreferences ?? { isListed: false, shareEmail: false, sharePhone: false },
    peers: peerRows.map((peer) => ({
      founderName: peer.founderName,
      businessName: peer.businessName,
      industry: peer.industry,
      email: peer.shareEmail ? peer.email : null,
      phone: peer.sharePhone ? peer.phone : null,
    })),
  }));
});

router.put("/programs/:programId/peers", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const params = UpdateParticipantPeerDirectoryPreferencesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateParticipantPeerDirectoryPreferencesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [application] = await db.select({ applicationId: applicationsTable.id })
    .from(applicationsTable)
    .where(and(
      eq(applicationsTable.programId, params.data.programId),
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ))
    .limit(1);

  if (!application) {
    res.status(404).json({ error: "Accepted application not found for this participant." });
    return;
  }

  const preferences = {
    isListed: body.data.isListed,
    shareEmail: body.data.isListed && body.data.shareEmail,
    sharePhone: body.data.isListed && body.data.sharePhone,
  };
  const [saved] = await db.insert(participantPeerDirectoryPreferencesTable)
    .values({ applicationId: application.applicationId, ...preferences })
    .onConflictDoUpdate({
      target: participantPeerDirectoryPreferencesTable.applicationId,
      set: { ...preferences, updatedAt: new Date() },
    })
    .returning();

  res.json(UpdateParticipantPeerDirectoryPreferencesResponse.parse({
    isListed: saved.isListed,
    shareEmail: saved.shareEmail,
    sharePhone: saved.sharePhone,
  }));
});

router.get("/idea-validation", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const applications = await db.select({
    applicationId: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    businessName: applicationsTable.businessName,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ))
    .orderBy(asc(programsTable.name), asc(applicationsTable.id));

  if (!applications.length) {
    res.json(GetParticipantIdeaValidationResponse.parse({ workbooks: [] }));
    return;
  }

  const saved = await db.select().from(ideaValidationWorkbooksTable)
    .where(inArray(ideaValidationWorkbooksTable.applicationId, applications.map(({ applicationId }) => applicationId)));
  const savedByApplication = new Map(saved.map((workbook) => [workbook.applicationId, workbook]));
  const workbooks = applications.map((application) => {
    const workbook = savedByApplication.get(application.applicationId);
    return {
      ...application,
      customerSegment: workbook?.customerSegment ?? "",
      problemStatement: workbook?.problemStatement ?? "",
      riskiestAssumption: workbook?.riskiestAssumption ?? "",
      mvpExperiment: workbook?.mvpExperiment ?? "",
      successSignal: workbook?.successSignal ?? "",
      evidenceAndNextStep: workbook?.evidenceAndNextStep ?? "",
      updatedAt: workbook?.updatedAt ?? null,
    };
  });
  res.json(GetParticipantIdeaValidationResponse.parse({ workbooks }));
});

router.put("/idea-validation/:applicationId", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const params = SaveParticipantIdeaValidationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SaveParticipantIdeaValidationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [application] = await db.select({
    applicationId: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    businessName: applicationsTable.businessName,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.id, params.data.applicationId),
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ))
    .limit(1);

  if (!application) {
    res.status(404).json({ error: "Accepted application not found for this participant." });
    return;
  }

  const updatedAt = new Date();
  const [workbook] = await db.insert(ideaValidationWorkbooksTable)
    .values({ applicationId: application.applicationId, ...body.data, updatedAt })
    .onConflictDoUpdate({
      target: ideaValidationWorkbooksTable.applicationId,
      set: { ...body.data, updatedAt },
    })
    .returning();

  res.json(SaveParticipantIdeaValidationResponse.parse({
    ...application,
    customerSegment: workbook.customerSegment,
    problemStatement: workbook.problemStatement,
    riskiestAssumption: workbook.riskiestAssumption,
    mvpExperiment: workbook.mvpExperiment,
    successSignal: workbook.successSignal,
    evidenceAndNextStep: workbook.evidenceAndNextStep,
    updatedAt: workbook.updatedAt,
  }));
});

router.get("/business-plans", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const applications = await db.select({
    applicationId: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    businessName: applicationsTable.businessName,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ))
    .orderBy(asc(programsTable.name), asc(applicationsTable.id));

  if (!applications.length) {
    res.json(GetParticipantBusinessPlansResponse.parse({ plans: [] }));
    return;
  }

  const saved = await db.select().from(participantBusinessPlansTable)
    .where(inArray(participantBusinessPlansTable.applicationId, applications.map(({ applicationId }) => applicationId)));
  const savedByApplication = new Map(saved.map((plan) => [plan.applicationId, plan]));
  const plans = applications.map((application) => {
    const plan = savedByApplication.get(application.applicationId);
    return {
      ...application,
      acquisitionChannels: plan?.acquisitionChannels ?? "",
      outreachActions: plan?.outreachActions ?? "",
      fulfillmentSteps: plan?.fulfillmentSteps ?? "",
      reviewSignals: plan?.reviewSignals ?? "",
      updatedAt: plan?.updatedAt ?? null,
    };
  });
  res.json(GetParticipantBusinessPlansResponse.parse({ plans }));
});

router.put("/business-plans/:applicationId", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const params = SaveParticipantBusinessPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SaveParticipantBusinessPlanBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [application] = await db.select({
    applicationId: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    businessName: applicationsTable.businessName,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.id, params.data.applicationId),
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ))
    .limit(1);

  if (!application) {
    res.status(404).json({ error: "Accepted application not found for this participant." });
    return;
  }

  const updatedAt = new Date();
  const [plan] = await db.insert(participantBusinessPlansTable)
    .values({ applicationId: application.applicationId, ...body.data, updatedAt })
    .onConflictDoUpdate({
      target: participantBusinessPlansTable.applicationId,
      set: { ...body.data, updatedAt },
    })
    .returning();

  res.json(SaveParticipantBusinessPlanResponse.parse({
    ...application,
    acquisitionChannels: plan.acquisitionChannels,
    outreachActions: plan.outreachActions,
    fulfillmentSteps: plan.fulfillmentSteps,
    reviewSignals: plan.reviewSignals,
    updatedAt: plan.updatedAt,
  }));
});

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
      dueAt: string | null;
      isRequired: boolean;
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
      dueAt: module.dueAt?.toISOString() ?? null,
      isRequired: module.isRequired,
      materials: materials
        .filter((material) => material.moduleId === module.id && material.allowedRoles.includes("participant"))
        .map((material) => ({
          id: material.id,
          title: material.title,
          description: material.description,
          kind: material.kind,
          language: material.language,
          packageFormat: material.packageFormat,
          externalUrl: material.externalUrl,
          fileName: material.fileName,
          contentType: material.contentType,
          fileSize: material.fileSize,
        })),
    });
  }
  res.json(GetParticipantCoursesResponse.parse({ programs: [...programs.values()] }));
});

async function handleParticipantCourseMaterialFile(
  req: Request,
  res: Response,
  download: boolean,
): Promise<void> {
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
  if (!record || !record.material.objectPath || record.material.kind === "scorm" || record.material.kind === "xapi") {
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
    download,
  );
}

router.get("/courses/materials/:id/file", async (req, res): Promise<void> => {
  await handleParticipantCourseMaterialFile(req, res, false);
});

router.get("/courses/materials/:id/download", async (req, res): Promise<void> => {
  await handleParticipantCourseMaterialFile(req, res, true);
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

  const invitationIds = await getAdminInvitedApplicationIds(rows.map(({ application }) => application.id));
  const eligible = rows.filter(({ application, business }) => application.status === "accepted" && business);
  const programIds = [...new Set(eligible.map(({ application }) => application.programId))];
  const acceptedProgramIds = [...new Set(rows
    .filter(({ application }) => application.status === "accepted")
    .map(({ application }) => application.programId))];
  const businessIds = eligible.flatMap(({ business }) => business ? [business.id] : []);
  const acceptedProgramIdSet = new Set(acceptedProgramIds);
  const acceptedBusinessPrograms = await getAcceptedParticipantBusinessPrograms(participant.userId);
  const announcementRows = acceptedProgramIds.length
    ? await listParticipantAnnouncementRows(participant.userId, acceptedProgramIds)
    : [];
  const activeAnnouncementRows = announcementRows.filter((row) => {
    if (!canParticipantAccessAnnouncement(row.announcement, acceptedProgramIdSet, acceptedBusinessPrograms)) return false;
    if (row.sessionId === null) return true;
    return isCurrentRecordingNotice(
      {
        sessionId: row.sessionId,
        programId: row.announcement.programId,
        recordingVersion: row.recordingVersion,
      },
      row.sessionProgramId !== null &&
        row.currentRecordingVersion !== null &&
        row.recordingUrl !== null
        ? {
            id: row.sessionId,
            programId: row.sessionProgramId,
            recordingVersion: row.currentRecordingVersion,
            recordingUrl: row.recordingUrl,
          }
        : null,
    );
  });

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
      mentorStatus: staffMembersTable.status,
      bookingProvider: staffMembersTable.bookingProvider,
      calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
      googleCalendarBookingUrl: staffMembersTable.googleCalendarBookingUrl,
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
    enrollmentSource: invitationIds.has(application.id) ? "admin_invitation" : "application",
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

  const announcements = activeAnnouncementRows.map(({
    announcement,
    programName,
    businessName,
    readAt,
    sessionId,
    sessionTitle,
    sessionDate,
    recordingUrl,
  }) => ({
    id: announcement.id,
    programId: announcement.programId,
    programName,
    businessId: announcement.businessId,
    businessName,
    kind: announcement.kind,
    title: announcement.title,
    body: announcement.body,
    scheduledFor: announcement.scheduledFor,
    createdAt: announcement.createdAt,
    readAt,
    sessionId,
    sessionTitle: sessionId === null ? null : sessionTitle,
    sessionDate: sessionId === null ? null : sessionDate,
    recordingUrl: sessionId === null ? null : recordingUrl,
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
  type ReadableAnnouncement = {
    id: number;
    programId: number | null;
    businessId: number | null;
    sessionId: number | null;
    recordingVersion: number | null;
    scheduledFor: Date;
  };
  let announcement: ReadableAnnouncement | undefined;
  try {
    [announcement] = await db.select({
      id: programAnnouncementsTable.id,
      programId: programAnnouncementsTable.programId,
      businessId: programAnnouncementsTable.businessId,
      sessionId: programAnnouncementsTable.sessionId,
      recordingVersion: programAnnouncementsTable.recordingVersion,
      scheduledFor: programAnnouncementsTable.scheduledFor,
    }).from(programAnnouncementsTable)
      .where(eq(programAnnouncementsTable.id, announcementId)).limit(1);
  } catch (error) {
    if (!isMissingAnnouncementBusinessColumn(error)) throw error;
    const [legacyAnnouncement] = await db.select({
      id: programAnnouncementsTable.id,
      programId: programAnnouncementsTable.programId,
      sessionId: programAnnouncementsTable.sessionId,
      recordingVersion: programAnnouncementsTable.recordingVersion,
      scheduledFor: programAnnouncementsTable.scheduledFor,
    }).from(programAnnouncementsTable)
      .where(eq(programAnnouncementsTable.id, announcementId)).limit(1);
    announcement = legacyAnnouncement
      ? { ...legacyAnnouncement, businessId: null }
      : undefined;
  }
  if (!announcement) {
    res.status(404).json({ error: "Announcement not found." });
    return;
  }
  if (announcement.sessionId !== null) {
    const [session] = await db.select({
      id: sessionsTable.id,
      programId: sessionsTable.programId,
      recordingVersion: sessionsTable.recordingVersion,
      recordingUrl: sessionsTable.recordingUrl,
    }).from(sessionsTable)
      .where(eq(sessionsTable.id, announcement.sessionId))
      .limit(1);
    if (!isCurrentRecordingNotice({
      sessionId: announcement.sessionId,
      programId: announcement.programId,
      recordingVersion: announcement.recordingVersion,
    }, session)) {
      res.status(404).json({ error: "Announcement not found." });
      return;
    }
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
    ));
  const programIds = new Set(acceptedPrograms.map((item) => item.programId));
  const acceptedBusinessPrograms = await getAcceptedParticipantBusinessPrograms(participant.userId);
  if (
    !programIds.size ||
    !canParticipantAccessAnnouncement(announcement, programIds, acceptedBusinessPrograms) ||
    (announcement.sessionId !== null && !canParticipantAccessRecordingNotice({
      sessionId: announcement.sessionId,
      programId: announcement.programId,
      recordingVersion: announcement.recordingVersion,
    }, programIds))
  ) {
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
