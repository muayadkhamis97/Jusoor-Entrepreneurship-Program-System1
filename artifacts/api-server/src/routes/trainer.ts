import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  CreateTrainingAssignmentBody,
  CreateTrainingAssignmentResponse,
  GetTrainerAttendanceReportsResponse,
  GetTrainerDashboardResponse,
  ReplyTrainingQuestionBody,
  ReplyTrainingQuestionParams,
  ReplyTrainingQuestionResponse,
  ReviewTrainingAnswerBody,
  ReviewTrainingAnswerParams,
  ReviewTrainingAnswerResponse,
} from "@workspace/api-zod";
import {
  businessesTable,
  db,
  programsTable,
  sessionsTable,
  staffMembersTable,
  trainingAssignmentsTable,
  trainingQuestionsTable,
  trainingSubmissionsTable,
} from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import { getZoomAttendanceReport } from "../lib/zoom-attendance";
import { canTrainerAccessSessionQuestion } from "../lib/trainer-access";
import { activeProgramIdsFor } from "../lib/programScope";
import { filterAssignedTrainerPrograms } from "../lib/trainer-programs";

const router: IRouter = Router();

async function getAssignedProgramIds(staff: StaffAccess): Promise<number[]> {
  return activeProgramIdsFor(staff);
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programIds = await getAssignedProgramIds(staff);
  if (!programIds.length) {
    res.json(GetTrainerDashboardResponse.parse({ programs: [], sessions: [], assignments: [], submissions: [], questions: [] }));
    return;
  }

  const programs = await db.select({
    id: programsTable.id,
    name: programsTable.name,
  }).from(programsTable)
    .where(inArray(programsTable.id, programIds))
    .orderBy(asc(programsTable.name));
  const sessions = await db.select().from(sessionsTable)
    .where(and(
      eq(sessionsTable.trainerStaffId, staff.id),
      inArray(sessionsTable.programId, programIds),
    ))
    .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime));
  const assignments = await db.select({
    id: trainingAssignmentsTable.id,
    programId: trainingAssignmentsTable.programId,
    title: trainingAssignmentsTable.title,
    instructions: trainingAssignmentsTable.instructions,
    dueDate: trainingAssignmentsTable.dueDate,
    sessionId: trainingAssignmentsTable.sessionId,
    sessionTitle: sessionsTable.title,
    createdAt: trainingAssignmentsTable.createdAt,
  }).from(trainingAssignmentsTable)
    .leftJoin(sessionsTable, eq(trainingAssignmentsTable.sessionId, sessionsTable.id))
    .where(inArray(trainingAssignmentsTable.programId, programIds))
    .orderBy(asc(trainingAssignmentsTable.dueDate), desc(trainingAssignmentsTable.createdAt));
  const submissions = await db.select({
    id: trainingSubmissionsTable.id,
    assignmentId: trainingSubmissionsTable.assignmentId,
    businessId: trainingSubmissionsTable.businessId,
    answer: trainingSubmissionsTable.answer,
    status: trainingSubmissionsTable.status,
    score: trainingSubmissionsTable.score,
    feedback: trainingSubmissionsTable.feedback,
    submittedAt: trainingSubmissionsTable.submittedAt,
    reviewedAt: trainingSubmissionsTable.reviewedAt,
    assignmentTitle: trainingAssignmentsTable.title,
    businessName: businessesTable.businessName,
    founderName: businessesTable.founderName,
    programName: programsTable.name,
  }).from(trainingSubmissionsTable)
    .innerJoin(trainingAssignmentsTable, eq(trainingSubmissionsTable.assignmentId, trainingAssignmentsTable.id))
    .innerJoin(businessesTable, eq(trainingSubmissionsTable.businessId, businessesTable.id))
    .innerJoin(programsTable, eq(trainingAssignmentsTable.programId, programsTable.id))
    .where(inArray(trainingAssignmentsTable.programId, programIds))
    .orderBy(desc(trainingSubmissionsTable.submittedAt));
  const questions = await db.select({
    id: trainingQuestionsTable.id,
    programId: trainingQuestionsTable.programId,
    sessionId: trainingQuestionsTable.sessionId,
    sessionTitle: sessionsTable.title,
    assignmentTitle: trainingAssignmentsTable.title,
    question: trainingQuestionsTable.question,
    reply: trainingQuestionsTable.reply,
    createdAt: trainingQuestionsTable.createdAt,
    repliedAt: trainingQuestionsTable.repliedAt,
    businessName: businessesTable.businessName,
    founderName: businessesTable.founderName,
    programName: programsTable.name,
  }).from(trainingQuestionsTable)
    .innerJoin(businessesTable, eq(trainingQuestionsTable.businessId, businessesTable.id))
    .innerJoin(programsTable, eq(trainingQuestionsTable.programId, programsTable.id))
    .leftJoin(sessionsTable, eq(trainingQuestionsTable.sessionId, sessionsTable.id))
    .leftJoin(trainingAssignmentsTable, eq(trainingQuestionsTable.assignmentId, trainingAssignmentsTable.id))
    .where(inArray(trainingQuestionsTable.programId, programIds))
    .orderBy(desc(trainingQuestionsTable.createdAt));

  const assignedSessionIds = new Set(sessions.map(({ id }) => id));
  const visibleQuestions = questions.filter(({ sessionId }) =>
    canTrainerAccessSessionQuestion(sessionId, assignedSessionIds),
  );
  res.json(GetTrainerDashboardResponse.parse({
    programs: filterAssignedTrainerPrograms(programIds, programs),
    sessions,
    assignments,
    submissions,
    questions: visibleQuestions,
  }));
});

router.get("/attendance", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programIds = await getAssignedProgramIds(staff);
  if (!programIds.length) {
    res.json(GetTrainerAttendanceReportsResponse.parse([]));
    return;
  }
  const sessions = await db.select({
    id: sessionsTable.id,
    title: sessionsTable.title,
    scheduledDate: sessionsTable.scheduledDate,
  }).from(sessionsTable)
    .where(and(
      eq(sessionsTable.trainerStaffId, staff.id),
      inArray(sessionsTable.programId, programIds),
    ))
    .orderBy(desc(sessionsTable.scheduledDate), asc(sessionsTable.startTime));
  const reports = await Promise.all(sessions.map(async (session) => {
    const report = await getZoomAttendanceReport(session.id);
    if (!report) return null;
    return {
      sessionId: session.id,
      sessionTitle: session.title,
      scheduledDate: session.scheduledDate,
      attendance: report.roster,
      zoomSync: report.zoomSync,
      unmatchedParticipants: report.unmatchedParticipants,
    };
  }));
  res.json(GetTrainerAttendanceReportsResponse.parse(reports.filter((report) => report !== null)));
});

router.post("/assignments", async (req, res): Promise<void> => {
  const parsed = CreateTrainingAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await getAssignedProgramIds(staff);
  if (!programIds.includes(parsed.data.programId)) {
    res.status(403).json({ error: "You are not assigned to this cohort." });
    return;
  }
  if (parsed.data.sessionId !== undefined && parsed.data.sessionId !== null) {
    const [session] = await db.select().from(sessionsTable)
      .where(and(
        eq(sessionsTable.id, parsed.data.sessionId),
        eq(sessionsTable.trainerStaffId, staff.id),
        eq(sessionsTable.programId, parsed.data.programId),
      )).limit(1);
    if (!session) {
      res.status(400).json({ error: "Choose a session assigned to you in this cohort." });
      return;
    }
  }

  const [assignment] = await db.insert(trainingAssignmentsTable).values({
    ...parsed.data,
    createdByStaffId: staff.id,
  }).returning();
  const [session] = assignment.sessionId
    ? await db.select({ title: sessionsTable.title }).from(sessionsTable)
      .where(eq(sessionsTable.id, assignment.sessionId)).limit(1)
    : [];
  res.status(201).json(CreateTrainingAssignmentResponse.parse({
    ...assignment,
    sessionTitle: session?.title ?? null,
  }));
});

router.patch("/submissions/:id", async (req, res): Promise<void> => {
  const params = ReviewTrainingAnswerParams.safeParse(req.params);
  const body = ReviewTrainingAnswerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await getAssignedProgramIds(staff);
  const [submission] = await db.select({
    id: trainingSubmissionsTable.id,
    programId: trainingAssignmentsTable.programId,
  }).from(trainingSubmissionsTable)
    .innerJoin(trainingAssignmentsTable, eq(trainingSubmissionsTable.assignmentId, trainingAssignmentsTable.id))
    .where(eq(trainingSubmissionsTable.id, params.data.id)).limit(1);
  if (!submission || !programIds.includes(submission.programId)) {
    res.status(404).json({ error: "Answer not found in your assigned cohort." });
    return;
  }
  const [updated] = await db.update(trainingSubmissionsTable)
    .set({ ...body.data, status: "reviewed", reviewedAt: new Date() })
    .where(eq(trainingSubmissionsTable.id, params.data.id)).returning();
  res.json(ReviewTrainingAnswerResponse.parse(updated));
});

router.patch("/questions/:id", async (req, res): Promise<void> => {
  const params = ReplyTrainingQuestionParams.safeParse(req.params);
  const body = ReplyTrainingQuestionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await getAssignedProgramIds(staff);
  const [question] = await db.select().from(trainingQuestionsTable)
    .where(eq(trainingQuestionsTable.id, params.data.id)).limit(1);
  const [assignedSession] = question?.sessionId
    ? await db.select({
      id: sessionsTable.id,
      programId: sessionsTable.programId,
      trainerStaffId: sessionsTable.trainerStaffId,
    }).from(sessionsTable).where(eq(sessionsTable.id, question.sessionId)).limit(1)
    : [];
  const canReplyToQuestion = question && (question.sessionId !== null
    ? assignedSession?.trainerStaffId === staff.id && assignedSession.programId === question.programId
    : programIds.includes(question.programId));
  if (!question || !canReplyToQuestion) {
    res.status(404).json({ error: "Question not found in your assigned cohort." });
    return;
  }
  const [updated] = await db.update(trainingQuestionsTable).set({
    reply: body.data.reply,
    answeredByStaffId: staff.id,
    repliedAt: new Date(),
  }).where(eq(trainingQuestionsTable.id, params.data.id)).returning();
  const [session] = updated.sessionId
    ? await db.select({ title: sessionsTable.title }).from(sessionsTable).where(eq(sessionsTable.id, updated.sessionId)).limit(1)
    : [];
  const [assignment] = updated.assignmentId
    ? await db.select({ title: trainingAssignmentsTable.title }).from(trainingAssignmentsTable).where(eq(trainingAssignmentsTable.id, updated.assignmentId)).limit(1)
    : [];
  res.json(ReplyTrainingQuestionResponse.parse({
    ...updated,
    sessionTitle: session?.title ?? null,
    assignmentTitle: assignment?.title ?? null,
  }));
});

export default router;
