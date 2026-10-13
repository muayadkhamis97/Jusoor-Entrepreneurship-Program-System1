import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetLearningProgressAnalyticsQueryParams,
  GetLearningProgressAnalyticsResponse,
  GetParticipantLearningProgressResponse,
  IssueCourseCertificateParams,
  IssueCourseCertificateResponse,
  RecordParticipantCourseActivityBody,
  RecordParticipantCourseActivityParams,
  RecordParticipantCourseActivityResponse,
  RecordParticipantModuleProgressBody,
  RecordParticipantModuleProgressParams,
  RecordParticipantModuleProgressResponse,
  RetryCourseReminderParams,
  RetryCourseReminderResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  courseCertificatesTable,
  courseMaterialsTable,
  courseModuleProgressTable,
  courseModulesTable,
  coursePackageProgressTable,
  courseProgramActivityTable,
  courseQuizAttemptsTable,
  courseQuizzesTable,
  courseReminderDeliveriesTable,
  db,
  programsTable,
  staffMembersTable,
  xapiStatementsTable,
} from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { isCourseModuleReleased } from "../lib/courseAccess";

export const participantCourseProgressRouter: IRouter = Router();
export const staffLearningProgressRouter: IRouter = Router();

type AcceptedApplication = {
  id: number;
  programId: number;
  programName: string;
  founderName: string;
  businessName: string;
  email: string;
  clerkUserId: string | null;
};

type ProgressData = {
  application: AcceptedApplication;
  modules: Array<typeof courseModulesTable.$inferSelect>;
  moduleProgress: Array<typeof courseModuleProgressTable.$inferSelect>;
  programActivity: typeof courseProgramActivityTable.$inferSelect | null;
  quizzes: Array<typeof courseQuizzesTable.$inferSelect>;
  attempts: Array<typeof courseQuizAttemptsTable.$inferSelect>;
  materials: Array<typeof courseMaterialsTable.$inferSelect>;
  packageProgress: Array<typeof coursePackageProgressTable.$inferSelect>;
  xapiStatements: Array<typeof xapiStatementsTable.$inferSelect>;
  certificate: {
    certificate: typeof courseCertificatesTable.$inferSelect;
    issuedByName: string;
  } | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function xapiPackageStatus(rows: ProgressData["xapiStatements"]) {
  let completionStatus = "not_attempted";
  let successStatus = "unknown";
  let scoreScaled: number | null = null;
  for (const row of [...rows].sort((a, b) => a.storedAt.getTime() - b.storedAt.getTime())) {
    const statement = record(row.statement);
    const verb = record(statement?.verb);
    const verbId = typeof verb?.id === "string" ? verb.id.toLowerCase() : "";
    const result = record(statement?.result);
    if (verbId.endsWith("/completed") || result?.completion === true) completionStatus = "completed";
    if (verbId.endsWith("/passed") || result?.success === true) {
      completionStatus = "completed";
      successStatus = "passed";
    } else if (verbId.endsWith("/failed") || result?.success === false) {
      completionStatus = "completed";
      successStatus = "failed";
    }
    const score = record(result?.score);
    if (typeof score?.scaled === "number") scoreScaled = score.scaled;
  }
  return { completionStatus, successStatus, scoreScaled };
}

function buildProgramProgress(data: ProgressData) {
  const {
    application,
    modules,
    moduleProgress,
    programActivity,
    quizzes,
    attempts,
    materials,
    packageProgress,
    xapiStatements,
    certificate,
  } = data;
  const moduleProgressById = new Map(moduleProgress.map((item) => [item.moduleId, item]));
  const attemptsByQuiz = new Map<number, typeof attempts>();
  for (const attempt of attempts) {
    const list = attemptsByQuiz.get(attempt.quizId) ?? [];
    list.push(attempt);
    attemptsByQuiz.set(attempt.quizId, list);
  }
  const progressPercentFor = (quizId: number) => {
    const quizAttempts = attemptsByQuiz.get(quizId) ?? [];
    const best = quizAttempts.reduce<(typeof quizAttempts)[number] | null>((current, attempt) => {
      if (!current) return attempt;
      const currentPercent = current.totalQuestions ? current.score / current.totalQuestions : 0;
      const nextPercent = attempt.totalQuestions ? attempt.score / attempt.totalQuestions : 0;
      return nextPercent > currentPercent ? attempt : current;
    }, null);
    const latest = quizAttempts.reduce<(typeof quizAttempts)[number] | null>((current, attempt) =>
      !current || attempt.submittedAt > current.submittedAt ? attempt : current, null);
    const first = quizAttempts[0] ?? null;
    return {
      quizId,
      attempts: quizAttempts.length,
      bestScore: best?.score ?? null,
      totalQuestions: best?.totalQuestions ?? 0,
      firstScore: first?.score ?? null,
      latestScore: latest?.score ?? null,
      firstSubmittedAt: first?.submittedAt ?? null,
      latestSubmittedAt: latest?.submittedAt ?? null,
    };
  };
  const moduleRows = modules.map((module) => {
    const progress = moduleProgressById.get(module.id);
    const status = progress?.completedAt
      ? "completed"
      : progress?.lastActivityAt || attempts.some((attempt) => quizzes.some((quiz) =>
        quiz.moduleId === module.id && quiz.id === attempt.quizId)) ||
        packageProgress.some((item) => materials.some((material) =>
          material.moduleId === module.id && material.id === item.materialId))
        ? "in_progress"
        : "not_started";
    const modulePackages = materials
      .filter((material) => material.moduleId === module.id &&
        (material.kind === "scorm" || material.kind === "xapi"))
      .map((material) => {
        const scorm = packageProgress.find((item) => item.materialId === material.id);
        const statements = xapiStatements.filter((item) => item.materialId === material.id);
        const xapi = material.kind === "xapi" ? xapiPackageStatus(statements) : null;
        return {
          materialId: material.id,
          title: material.title,
          format: (material.packageFormat ?? "xapi") as "scorm12" | "scorm2004" | "xapi",
          completionStatus: scorm?.completionStatus ?? xapi?.completionStatus ?? "not_attempted",
          successStatus: scorm?.successStatus ?? xapi?.successStatus ?? "unknown",
          scoreScaled: scorm?.scoreScaled ?? xapi?.scoreScaled ?? null,
          updatedAt: scorm?.updatedAt ?? statements.at(-1)?.storedAt ?? null,
        };
      });
    return {
      moduleId: module.id,
      title: module.title,
      isRequired: module.isRequired,
      dueAt: module.dueAt,
      completedAt: progress?.completedAt ?? null,
      completionStatus: status as "not_started" | "in_progress" | "completed",
      packages: modulePackages,
    };
  });
  const requiredModules = moduleRows.filter((module) => module.isRequired);
  const completedRequiredModules = requiredModules.filter((module) => module.completedAt).length;
  const quizRows = quizzes.map((quiz) => {
    const result = progressPercentFor(quiz.id);
    return {
      quizId: quiz.id,
      title: quiz.title,
      assessmentType: quiz.assessmentType,
      gradingFormat: quiz.gradingFormat,
      letterGradeScale: quiz.letterGradeScale,
      attempts: result.attempts,
      bestScore: result.bestScore,
      totalQuestions: result.totalQuestions,
      firstScore: result.firstScore,
      latestScore: result.latestScore,
      firstSubmittedAt: result.firstSubmittedAt,
      latestSubmittedAt: result.latestSubmittedAt,
    };
  });
  return {
    programId: application.programId,
    programName: application.programName,
    completedRequiredModules,
    totalRequiredModules: requiredModules.length,
    completionPercent: requiredModules.length
      ? Math.round(completedRequiredModules / requiredModules.length * 100)
      : 0,
    activeSeconds: programActivity?.activeSeconds ?? 0,
    lastActivityAt: programActivity?.lastActivityAt ?? null,
    modules: moduleRows,
    quizzes: quizRows,
    certificate: certificate ? {
      id: certificate.certificate.id,
      applicationId: certificate.certificate.applicationId,
      programId: certificate.certificate.programId,
      programName: certificate.certificate.programName,
      participantName: certificate.certificate.participantName,
      businessName: certificate.certificate.businessName,
      certificateCode: certificate.certificate.certificateCode,
      issuedAt: certificate.certificate.issuedAt,
      issuedByName: certificate.issuedByName,
    } : null,
  };
}

async function loadProgressData(applications: AcceptedApplication[]): Promise<ProgressData[]> {
  if (!applications.length) return [];
  const applicationIds = applications.map((application) => application.id);
  const programIds = [...new Set(applications.map((application) => application.programId))];
  const userIds = [...new Set(applications.flatMap((application) => application.clerkUserId ? [application.clerkUserId] : []))];
  const now = new Date();
  const modules = await db.select().from(courseModulesTable).where(and(
    inArray(courseModulesTable.programId, programIds),
    eq(courseModulesTable.isPublished, true),
    or(isNull(courseModulesTable.releaseAt), lte(courseModulesTable.releaseAt, now)),
  )).orderBy(asc(courseModulesTable.position));
  const moduleIds = modules.map((module) => module.id);
  const [moduleProgress, programActivity, quizzes, materials, certificates] = await Promise.all([
    db.select().from(courseModuleProgressTable).where(inArray(courseModuleProgressTable.applicationId, applicationIds)),
    db.select().from(courseProgramActivityTable).where(inArray(courseProgramActivityTable.applicationId, applicationIds)),
    moduleIds.length
      ? db.select().from(courseQuizzesTable).where(and(
        inArray(courseQuizzesTable.moduleId, moduleIds),
        eq(courseQuizzesTable.isPublished, true),
      )).orderBy(asc(courseQuizzesTable.id))
      : Promise.resolve([] as Array<typeof courseQuizzesTable.$inferSelect>),
    moduleIds.length
      ? db.select().from(courseMaterialsTable).where(inArray(courseMaterialsTable.moduleId, moduleIds)).orderBy(asc(courseMaterialsTable.position))
      : Promise.resolve([] as Array<typeof courseMaterialsTable.$inferSelect>),
    db.select({
      certificate: courseCertificatesTable,
      issuedByName: staffMembersTable.email,
    }).from(courseCertificatesTable)
      .innerJoin(staffMembersTable, eq(courseCertificatesTable.issuedByStaffId, staffMembersTable.id))
      .where(inArray(courseCertificatesTable.applicationId, applicationIds)),
  ]);
  const quizIds = quizzes.map((quiz) => quiz.id);
  const packageMaterialIds = materials
    .filter((material) => material.kind === "scorm" || material.kind === "xapi")
    .map((material) => material.id);
  const [attempts, packageProgress, xapiStatements] = await Promise.all([
    userIds.length && quizIds.length
      ? db.select().from(courseQuizAttemptsTable).where(and(
        inArray(courseQuizAttemptsTable.participantClerkUserId, userIds),
        inArray(courseQuizAttemptsTable.quizId, quizIds),
      )).orderBy(asc(courseQuizAttemptsTable.submittedAt))
      : Promise.resolve([] as Array<typeof courseQuizAttemptsTable.$inferSelect>),
    packageMaterialIds.length
      ? db.select().from(coursePackageProgressTable).where(and(
        inArray(coursePackageProgressTable.applicationId, applicationIds),
        inArray(coursePackageProgressTable.materialId, packageMaterialIds),
      ))
      : Promise.resolve([] as Array<typeof coursePackageProgressTable.$inferSelect>),
    userIds.length && packageMaterialIds.length
      ? db.select().from(xapiStatementsTable).where(and(
        inArray(xapiStatementsTable.participantClerkUserId, userIds),
        inArray(xapiStatementsTable.materialId, packageMaterialIds),
      )).orderBy(asc(xapiStatementsTable.storedAt)).limit(10_000)
      : Promise.resolve([] as Array<typeof xapiStatementsTable.$inferSelect>),
  ]);
  const activitiesByApplication = new Map(programActivity.map((item) => [item.applicationId, item]));
  const certificatesByApplication = new Map(certificates.map((item) => [item.certificate.applicationId, item]));
  return applications.map((application) => {
    const applicationModules = modules.filter((module) => module.programId === application.programId);
    const moduleIdsForApplication = new Set(applicationModules.map((module) => module.id));
    const applicationQuizzes = quizzes.filter((quiz) => moduleIdsForApplication.has(quiz.moduleId));
    const quizIdSet = new Set(applicationQuizzes.map((quiz) => quiz.id));
    const applicationMaterialIds = new Set(materials
      .filter((material) => moduleIdsForApplication.has(material.moduleId))
      .map((material) => material.id));
    return {
      application,
      modules: applicationModules,
      moduleProgress: moduleProgress.filter((item) => item.applicationId === application.id),
      programActivity: activitiesByApplication.get(application.id) ?? null,
      quizzes: applicationQuizzes,
      attempts: application.clerkUserId
        ? attempts.filter((attempt) => attempt.participantClerkUserId === application.clerkUserId && quizIdSet.has(attempt.quizId))
        : [],
      materials: materials.filter((material) => moduleIdsForApplication.has(material.moduleId) &&
        material.allowedRoles.includes("participant")),
      packageProgress: packageProgress.filter((item) =>
        item.applicationId === application.id && applicationMaterialIds.has(item.materialId)),
      xapiStatements: application.clerkUserId
        ? xapiStatements.filter((item) =>
          item.participantClerkUserId === application.clerkUserId && applicationMaterialIds.has(item.materialId))
        : [],
      certificate: certificatesByApplication.get(application.id) ?? null,
    };
  });
}

async function acceptedApplicationsForParticipant(participant: ParticipantAccess): Promise<AcceptedApplication[]> {
  return db.select({
    id: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    founderName: applicationsTable.founderName,
    businessName: applicationsTable.businessName,
    email: applicationsTable.email,
    clerkUserId: applicationsTable.clerkUserId,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    ));
}

participantCourseProgressRouter.get("/progress", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const applications = await acceptedApplicationsForParticipant(participant);
  const rows = await loadProgressData(applications);
  res.json(GetParticipantLearningProgressResponse.parse({
    programs: rows.map(buildProgramProgress),
  }));
});

participantCourseProgressRouter.post("/modules/:id/progress", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const params = RecordParticipantModuleProgressParams.safeParse(req.params);
  const body = RecordParticipantModuleProgressBody.safeParse(req.body);
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid module id and completion state are required." });
    return;
  }
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, params.data.id)).limit(1);
  if (!module || !isCourseModuleReleased(module.isPublished, module.releaseAt)) {
    res.status(404).json({ error: "Released course module not found." });
    return;
  }
  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    const [application] = await tx.select({ id: applicationsTable.id })
      .from(applicationsTable).where(and(
        eq(applicationsTable.programId, module.programId),
        eq(applicationsTable.clerkUserId, participant.userId),
        eq(applicationsTable.status, "accepted"),
      )).limit(1).for("update");
    if (!application) return null;
    const [progress] = await tx.insert(courseModuleProgressTable).values({
      moduleId: module.id,
      applicationId: application.id,
      participantClerkUserId: participant.userId,
      completedAt: body.data.completed ? now : null,
      lastActivityAt: now,
    }).onConflictDoUpdate({
      target: [courseModuleProgressTable.applicationId, courseModuleProgressTable.moduleId],
      set: {
        completedAt: body.data.completed ? now : null,
        lastActivityAt: now,
        updatedAt: now,
      },
    }).returning();
    return { progress };
  });
  if (!outcome) {
    res.status(403).json({ error: "This module is not part of your accepted cohort." });
    return;
  }
  const { progress } = outcome;
  res.json(RecordParticipantModuleProgressResponse.parse({
    moduleId: progress.moduleId,
    completedAt: progress.completedAt,
    lastActivityAt: progress.lastActivityAt,
  }));
});

participantCourseProgressRouter.post("/programs/:id/activity", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const params = RecordParticipantCourseActivityParams.safeParse(req.params);
  const body = RecordParticipantCourseActivityBody.safeParse(req.body);
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid program id and active time interval are required." });
    return;
  }
  const [application] = await db.select({ id: applicationsTable.id })
    .from(applicationsTable).where(and(
      eq(applicationsTable.programId, params.data.id),
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.status, "accepted"),
    )).limit(1);
  if (!application) {
    res.status(403).json({ error: "This program is not part of your accepted cohort." });
    return;
  }
  const now = new Date();
  const [activity] = await db.insert(courseProgramActivityTable).values({
    applicationId: application.id,
    participantClerkUserId: participant.userId,
    activeSeconds: body.data.activeSeconds,
    lastActivityAt: now,
  }).onConflictDoUpdate({
    target: courseProgramActivityTable.applicationId,
    set: {
      activeSeconds: sql`${courseProgramActivityTable.activeSeconds} + ${body.data.activeSeconds}`,
      lastActivityAt: now,
      updatedAt: now,
    },
  }).returning();
  res.json(RecordParticipantCourseActivityResponse.parse({
    programId: params.data.id,
    activeSeconds: activity.activeSeconds,
    lastActivityAt: activity.lastActivityAt,
  }));
});

staffLearningProgressRouter.get("/analytics/learning-progress", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = GetLearningProgressAnalyticsQueryParams.safeParse(req.query);
  if (!staff || staff.role !== "coordinator") {
    res.status(403).json({ error: "Coordinator access is required." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const programs = await db.select().from(programsTable)
    .where(params.data.programId ? eq(programsTable.id, params.data.programId) : undefined)
    .orderBy(asc(programsTable.name));
  if (!programs.length) {
    res.json(GetLearningProgressAnalyticsResponse.parse({ programs: [] }));
    return;
  }
  const applications = await db.select({
    id: applicationsTable.id,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    founderName: applicationsTable.founderName,
    businessName: applicationsTable.businessName,
    email: applicationsTable.email,
    clerkUserId: applicationsTable.clerkUserId,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      inArray(applicationsTable.programId, programs.map((program) => program.id)),
      eq(applicationsTable.status, "accepted"),
    ));
  const rows = await loadProgressData(applications);
  const byApplicationId = new Map(rows.map((row) => [row.application.id, row]));
  const programIds = programs.map((program) => program.id);
  const [reminderCounts, failedReminders] = await Promise.all([
    db.select({
      programId: courseModulesTable.programId,
      status: courseReminderDeliveriesTable.status,
      count: sql<number>`count(*)::int`,
    }).from(courseReminderDeliveriesTable)
      .innerJoin(courseModulesTable, eq(courseModulesTable.id, courseReminderDeliveriesTable.moduleId))
      .where(inArray(courseModulesTable.programId, programIds))
      .groupBy(courseModulesTable.programId, courseReminderDeliveriesTable.status),
    db.select({
      programId: courseModulesTable.programId,
      id: courseReminderDeliveriesTable.id,
      founderName: applicationsTable.founderName,
      businessName: applicationsTable.businessName,
      moduleTitle: courseModulesTable.title,
      lastError: courseReminderDeliveriesTable.lastError,
      failedAt: courseReminderDeliveriesTable.updatedAt,
    }).from(courseReminderDeliveriesTable)
      .innerJoin(courseModulesTable, eq(courseModulesTable.id, courseReminderDeliveriesTable.moduleId))
      .innerJoin(applicationsTable, eq(applicationsTable.id, courseReminderDeliveriesTable.applicationId))
      .where(and(
        inArray(courseModulesTable.programId, programIds),
        eq(courseReminderDeliveriesTable.status, "failed"),
      ))
      .orderBy(desc(courseReminderDeliveriesTable.updatedAt)),
  ]);
  const remindersByProgram = new Map(programIds.map((programId) => [programId, {
    pending: 0,
    sent: 0,
    failed: 0,
    latestError: null as { message: string; failedAt: Date } | null,
    failedDeliveries: [] as Array<{
      id: number;
      founderName: string;
      businessName: string;
      moduleTitle: string;
      lastError: string;
      failedAt: Date;
    }>,
  }]));
  for (const row of reminderCounts) {
    const summary = remindersByProgram.get(row.programId);
    if (!summary) continue;
    if (row.status === "pending" || row.status === "sending") summary.pending += row.count;
    if (row.status === "sent") summary.sent += row.count;
    if (row.status === "failed") summary.failed += row.count;
  }
  for (const row of failedReminders) {
    const summary = remindersByProgram.get(row.programId);
    if (!summary) continue;
    const lastError = row.lastError ?? "Email delivery failed.";
    if (!summary.latestError) summary.latestError = { message: lastError, failedAt: row.failedAt };
    if (summary.failedDeliveries.length < 20) {
      summary.failedDeliveries.push({
        id: row.id,
        founderName: row.founderName,
        businessName: row.businessName,
        moduleTitle: row.moduleTitle,
        lastError,
        failedAt: row.failedAt,
      });
    }
  }
  const programCertificates = applications.length
    ? await db.select({ programId: courseCertificatesTable.programId })
      .from(courseCertificatesTable)
      .where(inArray(courseCertificatesTable.applicationId, applications.map((app) => app.id)))
    : [];
  const certificatesByProgram = new Map<number, number>();
  for (const certificate of programCertificates) {
    certificatesByProgram.set(certificate.programId, (certificatesByProgram.get(certificate.programId) ?? 0) + 1);
  }
  const response = programs.map((program) => {
    const participants = applications
      .filter((application) => application.programId === program.id)
      .map((application) => {
        const progress = byApplicationId.get(application.id);
        const course = progress ? buildProgramProgress(progress) : {
          programId: program.id,
          programName: program.name,
          completedRequiredModules: 0,
          totalRequiredModules: 0,
          completionPercent: 0,
          activeSeconds: 0,
          lastActivityAt: null,
          modules: [],
          quizzes: [],
          certificate: null,
        };
        return {
          ...course,
          applicationId: application.id,
          founderName: application.founderName,
          businessName: application.businessName,
          email: application.email,
        };
      });
    const quizPercentages = participants.flatMap((participant) =>
      participant.quizzes.flatMap((quiz) => quiz.bestScore !== null && quiz.totalQuestions > 0
        ? [quiz.bestScore / quiz.totalQuestions * 100]
        : []));
    const completedParticipants = participants.filter((participant) =>
      participant.totalRequiredModules > 0 &&
      participant.completedRequiredModules === participant.totalRequiredModules).length;
    return {
      programId: program.id,
      programName: program.name,
      participantCount: participants.length,
      completedParticipants,
      averageCompletionPercent: participants.length
        ? Math.round(participants.reduce((sum, item) => sum + item.completionPercent, 0) / participants.length)
        : 0,
      averageActiveSeconds: participants.length
        ? Math.round(participants.reduce((sum, item) => sum + item.activeSeconds, 0) / participants.length)
        : 0,
      averageQuizPercent: quizPercentages.length
        ? Math.round(quizPercentages.reduce((sum, value) => sum + value, 0) / quizPercentages.length)
        : null,
      certificatesIssued: certificatesByProgram.get(program.id) ?? 0,
      reminders: remindersByProgram.get(program.id) ?? {
        pending: 0,
        sent: 0,
        failed: 0,
        latestError: null,
        failedDeliveries: [],
      },
      participants,
    };
  });
  res.json(GetLearningProgressAnalyticsResponse.parse({ programs: response }));
});

staffLearningProgressRouter.post("/analytics/learning-progress/applications/:id/certificate", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = IssueCourseCertificateParams.safeParse(req.params);
  if (!staff || staff.role !== "coordinator") {
    res.status(403).json({ error: "Coordinator access is required." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [application] = await tx.select({
      application: applicationsTable,
      programName: programsTable.name,
    }).from(applicationsTable)
      .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
      .where(and(
        eq(applicationsTable.id, params.data.id),
        eq(applicationsTable.status, "accepted"),
      )).limit(1).for("update");
    if (!application) return { kind: "not_found" as const };
    const [alreadyIssued] = await tx.select({ id: courseCertificatesTable.id })
      .from(courseCertificatesTable)
      .where(eq(courseCertificatesTable.applicationId, application.application.id))
      .limit(1);
    if (alreadyIssued) return { kind: "already_issued" as const };

    const now = new Date();
    const requiredModules = await tx.select({ id: courseModulesTable.id })
      .from(courseModulesTable)
      .where(and(
        eq(courseModulesTable.programId, application.application.programId),
        eq(courseModulesTable.isPublished, true),
        eq(courseModulesTable.isRequired, true),
        or(isNull(courseModulesTable.releaseAt), lte(courseModulesTable.releaseAt, now)),
      ));
    const completedModules = requiredModules.length
      ? await tx.select({ moduleId: courseModuleProgressTable.moduleId })
        .from(courseModuleProgressTable)
        .where(and(
          eq(courseModuleProgressTable.applicationId, application.application.id),
          eq(courseModuleProgressTable.participantClerkUserId, application.application.clerkUserId ?? ""),
          inArray(courseModuleProgressTable.moduleId, requiredModules.map((module) => module.id)),
          sql`${courseModuleProgressTable.completedAt} IS NOT NULL`,
        ))
      : [];
    if (!requiredModules.length || completedModules.length !== requiredModules.length) {
      return { kind: "ineligible" as const };
    }

    const [issued] = await tx.insert(courseCertificatesTable).values({
      applicationId: application.application.id,
      programId: application.application.programId,
      certificateCode: randomUUID().toUpperCase(),
      participantName: application.application.founderName,
      businessName: application.application.businessName,
      programName: application.programName,
      issuedByStaffId: staff.id,
    }).onConflictDoNothing({ target: courseCertificatesTable.applicationId }).returning();
    return issued ? { kind: "issued" as const, certificate: issued } : { kind: "already_issued" as const };
  });

  if (outcome.kind === "not_found") {
    res.status(404).json({ error: "Accepted participant application not found." });
    return;
  }
  if (outcome.kind === "already_issued") {
    res.status(409).json({ error: "A certificate has already been issued for this participant." });
    return;
  }
  if (outcome.kind === "ineligible") {
    res.status(400).json({ error: "Complete all required published modules before issuing a certificate." });
    return;
  }
  res.status(201).json(IssueCourseCertificateResponse.parse({
    id: outcome.certificate.id,
    applicationId: outcome.certificate.applicationId,
    programId: outcome.certificate.programId,
    programName: outcome.certificate.programName,
    participantName: outcome.certificate.participantName,
    businessName: outcome.certificate.businessName,
    certificateCode: outcome.certificate.certificateCode,
    issuedAt: outcome.certificate.issuedAt,
    issuedByName: staff.email,
  }));
});

staffLearningProgressRouter.post("/analytics/learning-progress/reminders/:id/retry", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = RetryCourseReminderParams.safeParse(req.params);
  if (!staff || staff.role !== "coordinator") {
    res.status(403).json({ error: "Coordinator access is required." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: "A valid reminder delivery id is required." });
    return;
  }
  const now = new Date();
  const [delivery] = await db.update(courseReminderDeliveriesTable).set({
    status: "pending",
    nextAttemptAt: now,
    lastError: null,
    updatedAt: now,
  }).where(and(
    eq(courseReminderDeliveriesTable.id, params.data.id),
    eq(courseReminderDeliveriesTable.status, "failed"),
  )).returning({ id: courseReminderDeliveriesTable.id });
  if (!delivery) {
    const [existing] = await db.select({ id: courseReminderDeliveriesTable.id })
      .from(courseReminderDeliveriesTable)
      .where(eq(courseReminderDeliveriesTable.id, params.data.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Course reminder delivery not found." });
      return;
    }
    res.status(409).json({ error: "This reminder is no longer failed and cannot be retried." });
    return;
  }
  res.status(202).json(RetryCourseReminderResponse.parse({
    id: delivery.id,
    status: "pending",
  }));
});
