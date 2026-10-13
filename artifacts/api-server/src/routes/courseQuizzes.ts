import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCourseQuizBody,
  CreateCourseQuizParams,
  CreateCourseQuizResponse,
  GetCourseModuleQuizzesParams,
  GetCourseModuleQuizzesResponse,
  GetCourseQuizAttemptsParams,
  GetCourseQuizAttemptsResponse,
  GetParticipantCourseModuleQuizzesParams,
  GetParticipantCourseModuleQuizzesResponse,
  SubmitParticipantCourseQuizAttemptBody,
  SubmitParticipantCourseQuizAttemptParams,
  SubmitParticipantCourseQuizAttemptResponse,
  UpdateCourseQuizBody,
  UpdateCourseQuizParams,
  UpdateCourseQuizResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  courseModulesTable,
  courseQuizAttemptsTable,
  courseQuizQuestionsTable,
  courseQuizzesTable,
  db,
  sessionsTable,
  type CourseQuizAttempt,
  type CourseQuizQuestion,
  type CourseQuiz,
} from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import { isCourseModuleReleased } from "../lib/courseAccess";
import {
  gradeCourseQuizAttempt,
  isValidQuizSubmissionValue,
  shuffleQuizChoices,
  validateCourseQuizQuestions,
  type CourseQuizWriteInput,
  type GradeableQuestion,
  type QuizSubmissionValue,
} from "../lib/courseQuizGrading";

export const staffCourseQuizRouter: IRouter = Router();
export const participantCourseQuizRouter: IRouter = Router();

function isStaffQuizReader(staff: StaffAccess): boolean {
  return staff.role === "coordinator" || staff.role === "trainer";
}

async function manageableProgramIds(staff: StaffAccess): Promise<number[] | null> {
  if (staff.role === "coordinator") return null;
  if (staff.role !== "trainer") return [];
  const assignments = await db.select({ programId: sessionsTable.programId })
    .from(sessionsTable)
    .where(eq(sessionsTable.trainerStaffId, staff.id));
  return [...new Set(assignments.flatMap(({ programId }) => programId === null ? [] : [programId]))];
}

async function staffCanReviewModule(
  module: typeof courseModulesTable.$inferSelect,
  staff: StaffAccess,
): Promise<boolean> {
  if (staff.role === "coordinator") return true;
  if (staff.role !== "trainer" || !isCourseModuleReleased(module.isPublished, module.releaseAt)) return false;
  const programIds = await manageableProgramIds(staff);
  return programIds?.includes(module.programId) ?? false;
}

async function findQuizAndModule(quizId: number) {
  const [row] = await db.select({ quiz: courseQuizzesTable, module: courseModulesTable })
    .from(courseQuizzesTable)
    .innerJoin(courseModulesTable, eq(courseQuizzesTable.moduleId, courseModulesTable.id))
    .where(eq(courseQuizzesTable.id, quizId))
    .limit(1);
  return row ?? null;
}

function mapQuiz(quiz: CourseQuiz, questions: CourseQuizQuestion[]) {
  return {
    id: quiz.id,
    moduleId: quiz.moduleId,
    title: quiz.title,
    description: quiz.description,
    isPublished: quiz.isPublished,
    questions: questions.map((question) => ({
      id: question.id,
      position: question.position,
      questionType: question.questionType,
      prompt: question.prompt,
      choices: question.choices,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    })),
  };
}

async function questionsForQuizzes(quizIds: number[]): Promise<CourseQuizQuestion[]> {
  if (!quizIds.length) return [];
  return db.select().from(courseQuizQuestionsTable)
    .where(inArray(courseQuizQuestionsTable.quizId, quizIds))
    .orderBy(asc(courseQuizQuestionsTable.position), asc(courseQuizQuestionsTable.id));
}

function parseQuizBody(body: unknown, update = false): CourseQuizWriteInput | null {
  const generated = update
    ? UpdateCourseQuizBody.safeParse(body)
    : CreateCourseQuizBody.safeParse(body);
  if (!generated.success) return null;
  const parsed = generated.data as unknown as CourseQuizWriteInput;
  if (validateCourseQuizQuestions(parsed.questions)) return null;
  return {
    ...parsed,
    title: parsed.title.trim(),
    description: parsed.description?.trim() || null,
    questions: parsed.questions.map((question) => ({
      ...question,
      prompt: question.prompt.trim(),
      explanation: question.explanation?.trim() || null,
      choices: question.choices.map((choice) => ({ ...choice, text: choice.text.trim() })),
    })),
  };
}

staffCourseQuizRouter.get("/modules/:id/quizzes", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || !isStaffQuizReader(staff)) {
    res.status(403).json({ error: "Coordinator or assigned trainer access is required." });
    return;
  }
  const params = GetCourseModuleQuizzesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, params.data.id)).limit(1);
  if (!module) {
    res.status(404).json({ error: "Course module not found." });
    return;
  }
  if (!await staffCanReviewModule(module, staff)) {
    res.status(403).json({ error: "This module is not released in a program assigned to you." });
    return;
  }

  const quizzes = await db.select().from(courseQuizzesTable)
    .where(eq(courseQuizzesTable.moduleId, module.id))
    .orderBy(asc(courseQuizzesTable.id));
  const questions = await questionsForQuizzes(quizzes.map(({ id }) => id));
  const questionsByQuiz = new Map<number, CourseQuizQuestion[]>();
  for (const question of questions) {
    const current = questionsByQuiz.get(question.quizId) ?? [];
    current.push(question);
    questionsByQuiz.set(question.quizId, current);
  }
  res.json(GetCourseModuleQuizzesResponse.parse({
    moduleId: module.id,
    moduleTitle: module.title,
    quizzes: quizzes.map((quiz) => mapQuiz(quiz, questionsByQuiz.get(quiz.id) ?? [])),
  }));
});

staffCourseQuizRouter.post("/modules/:id/quizzes", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || staff.role !== "coordinator") {
    res.status(403).json({ error: "Coordinator access is required to create quizzes." });
    return;
  }
  const params = CreateCourseQuizParams.safeParse(req.params);
  const body = parseQuizBody(req.body);
  if (!params.success || !body) {
    res.status(400).json({ error: "Provide a valid quiz with complete, correctly keyed questions." });
    return;
  }
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, params.data.id)).limit(1);
  if (!module) {
    res.status(404).json({ error: "Course module not found." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [quiz] = await tx.insert(courseQuizzesTable).values({
      moduleId: module.id,
      title: body.title,
      description: body.description,
      isPublished: body.isPublished,
      createdByStaffId: staff.id,
    }).returning();
    const questions = await tx.insert(courseQuizQuestionsTable).values(body.questions.map((question, position) => ({
      quizId: quiz.id,
      position,
      questionType: question.questionType,
      prompt: question.prompt,
      choices: question.choices,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation ?? null,
    }))).returning();
    return { quiz, questions };
  });
  res.status(201).json(CreateCourseQuizResponse.parse(mapQuiz(result.quiz, result.questions)));
});

staffCourseQuizRouter.patch("/quizzes/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || staff.role !== "coordinator") {
    res.status(403).json({ error: "Coordinator access is required to edit quizzes." });
    return;
  }
  const params = UpdateCourseQuizParams.safeParse(req.params);
  const body = parseQuizBody(req.body, true);
  if (!params.success || !body) {
    res.status(400).json({ error: "Provide a valid quiz with complete, correctly keyed questions." });
    return;
  }
  const existing = await findQuizAndModule(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Quiz not found." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [quiz] = await tx.update(courseQuizzesTable).set({
      title: body.title,
      description: body.description,
      isPublished: body.isPublished,
    }).where(eq(courseQuizzesTable.id, existing.quiz.id)).returning();
    await tx.delete(courseQuizQuestionsTable)
      .where(eq(courseQuizQuestionsTable.quizId, existing.quiz.id));
    const questions = await tx.insert(courseQuizQuestionsTable).values(body.questions.map((question, position) => ({
      quizId: quiz.id,
      position,
      questionType: question.questionType,
      prompt: question.prompt,
      choices: question.choices,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation ?? null,
    }))).returning();
    return { quiz, questions };
  });
  res.json(UpdateCourseQuizResponse.parse(mapQuiz(result.quiz, result.questions)));
});

staffCourseQuizRouter.get("/quizzes/:id/attempts", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || !isStaffQuizReader(staff)) {
    res.status(403).json({ error: "Coordinator or assigned trainer access is required." });
    return;
  }
  const params = GetCourseQuizAttemptsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const quizAndModule = await findQuizAndModule(params.data.id);
  if (!quizAndModule) {
    res.status(404).json({ error: "Quiz not found." });
    return;
  }
  if (!await staffCanReviewModule(quizAndModule.module, staff)) {
    res.status(403).json({ error: "This quiz belongs to a module outside your assigned programs." });
    return;
  }

  const attempts = await db.select({
    attempt: courseQuizAttemptsTable,
    businessName: businessesTable.businessName,
  }).from(courseQuizAttemptsTable)
    .leftJoin(businessesTable, eq(courseQuizAttemptsTable.participantBusinessId, businessesTable.id))
    .where(eq(courseQuizAttemptsTable.quizId, params.data.id))
    .orderBy(desc(courseQuizAttemptsTable.submittedAt))
    .limit(200);
  res.json(GetCourseQuizAttemptsResponse.parse(attempts.map(({ attempt, businessName }) => ({
    id: attempt.id,
    quizId: attempt.quizId,
    participantName: businessName || "Program participant",
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    submittedAt: attempt.submittedAt,
    answers: attempt.answers,
  }))));
});

async function findAcceptedApplication(participant: ParticipantAccess, programId: number) {
  const [application] = await db.select({
    id: applicationsTable.id,
    businessId: applicationsTable.businessId,
  }).from(applicationsTable)
    .innerJoin(businessesTable, eq(applicationsTable.businessId, businessesTable.id))
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.programId, programId),
      eq(applicationsTable.status, "accepted"),
      eq(businessesTable.programId, programId),
    )).limit(1);
  return application ?? null;
}

function mapAttempt(attempt: CourseQuizAttempt) {
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    submittedAt: attempt.submittedAt,
    answers: attempt.answers,
  };
}

participantCourseQuizRouter.get("/modules/:id/quizzes", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const params = GetParticipantCourseModuleQuizzesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, params.data.id)).limit(1);
  if (!module || !isCourseModuleReleased(module.isPublished, module.releaseAt)) {
    res.status(404).json({ error: "Released course module not found." });
    return;
  }
  const application = await findAcceptedApplication(participant, module.programId);
  if (!application) {
    res.status(403).json({ error: "This course module is not part of your accepted cohort." });
    return;
  }

  const quizzes = await db.select().from(courseQuizzesTable)
    .where(and(
      eq(courseQuizzesTable.moduleId, module.id),
      eq(courseQuizzesTable.isPublished, true),
    ))
    .orderBy(asc(courseQuizzesTable.id));
  const quizIds = quizzes.map(({ id }) => id);
  const questions = await questionsForQuizzes(quizIds);
  const attempts = quizIds.length
    ? await db.select().from(courseQuizAttemptsTable)
      .where(and(
        inArray(courseQuizAttemptsTable.quizId, quizIds),
        eq(courseQuizAttemptsTable.participantClerkUserId, participant.userId),
      ))
      .orderBy(desc(courseQuizAttemptsTable.submittedAt))
    : [];
  const questionsByQuiz = new Map<number, CourseQuizQuestion[]>();
  for (const question of questions) {
    const current = questionsByQuiz.get(question.quizId) ?? [];
    current.push(question);
    questionsByQuiz.set(question.quizId, current);
  }
  const attemptsByQuiz = new Map<number, CourseQuizAttempt[]>();
  for (const attempt of attempts) {
    const current = attemptsByQuiz.get(attempt.quizId) ?? [];
    current.push(attempt);
    attemptsByQuiz.set(attempt.quizId, current);
  }

  res.json(GetParticipantCourseModuleQuizzesResponse.parse({
    moduleId: module.id,
    moduleTitle: module.title,
    quizzes: quizzes.map((quiz) => {
      const quizQuestions = questionsByQuiz.get(quiz.id) ?? [];
      const quizAttempts = attemptsByQuiz.get(quiz.id) ?? [];
      return {
        id: quiz.id,
        moduleId: quiz.moduleId,
        title: quiz.title,
        description: quiz.description,
        questionCount: quizQuestions.length,
        attemptCount: quizAttempts.length,
        latestAttempt: quizAttempts[0] ? mapAttempt(quizAttempts[0]) : null,
        questions: quizQuestions.map((question) => ({
          id: question.id,
          position: question.position,
          questionType: question.questionType,
          prompt: question.prompt,
          choices: question.questionType === "true_false"
            ? question.choices
            : shuffleQuizChoices(question.choices),
        })),
      };
    }),
  }));
});

participantCourseQuizRouter.post("/quizzes/:id/attempts", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const params = SubmitParticipantCourseQuizAttemptParams.safeParse(req.params);
  const body = SubmitParticipantCourseQuizAttemptBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Submit one answer for every question." });
    return;
  }
  const quizAndModule = await findQuizAndModule(params.data.id);
  if (!quizAndModule || !quizAndModule.quiz.isPublished ||
      !isCourseModuleReleased(quizAndModule.module.isPublished, quizAndModule.module.releaseAt)) {
    res.status(404).json({ error: "Published quiz not found." });
    return;
  }
  const application = await findAcceptedApplication(participant, quizAndModule.module.programId);
  if (!application) {
    res.status(403).json({ error: "This quiz is not part of your accepted cohort." });
    return;
  }

  const questions = await db.select().from(courseQuizQuestionsTable)
    .where(eq(courseQuizQuestionsTable.quizId, quizAndModule.quiz.id))
    .orderBy(asc(courseQuizQuestionsTable.position), asc(courseQuizQuestionsTable.id));
  const submittedAnswers = body.data.answers;
  const answerMap = new Map<number, QuizSubmissionValue>();
  for (const answer of submittedAnswers) {
    if (answerMap.has(answer.questionId)) {
      res.status(400).json({ error: "A question can only be answered once per attempt." });
      return;
    }
    answerMap.set(answer.questionId, answer.answer);
  }
  if (answerMap.size !== questions.length ||
      questions.some((question) => !answerMap.has(question.id) ||
        !isValidQuizSubmissionValue(question as GradeableQuestion, answerMap.get(question.id)))) {
    res.status(400).json({ error: "Submit a valid answer for every quiz question." });
    return;
  }

  const graded = gradeCourseQuizAttempt(
    questions as GradeableQuestion[],
    answerMap,
  );
  const [attempt] = await db.insert(courseQuizAttemptsTable).values({
    quizId: quizAndModule.quiz.id,
    participantClerkUserId: participant.userId,
    participantBusinessId: application.businessId,
    applicationId: application.id,
    score: graded.score,
    totalQuestions: graded.totalQuestions,
    answers: graded.answers,
  }).returning();
  res.status(201).json(SubmitParticipantCourseQuizAttemptResponse.parse(mapAttempt(attempt)));
});

