import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  CreateSessionInteractiveActivityBody,
  CreateSessionInteractiveActivityResponse,
  GetParticipantSessionInteractiveActivitiesResponse,
  GetParticipantSessionQuestionsResponse,
  GetSessionInteractiveActivitiesResponse,
  GetSessionQuestionsResponse,
  SubmitParticipantSessionInteractiveActivityBody,
  SubmitParticipantSessionInteractiveActivityResponse,
  UpdateSessionInteractiveActivityBody,
  UpdateSessionInteractiveActivityResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  db,
  sessionInteractiveActivitiesTable,
  sessionInteractiveResponsesTable,
  sessionsTable,
  trainingQuestionsTable,
  type SessionActivityAnswer,
  type SessionActivityQuestion,
} from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import type { StaffAccess } from "../middlewares/staffAccess";

const staffRouter: IRouter = Router();
const participantRouter: IRouter = Router();

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function canManageSession(staff: StaffAccess, session: { trainerStaffId: number | null }): boolean {
  return staff.role === "coordinator" ||
    (staff.role === "trainer" && session.trainerStaffId === staff.id);
}

async function getSession(sessionId: number) {
  const [session] = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId)).limit(1);
  return session ?? null;
}

async function getParticipantEnrollment(
  participant: ParticipantAccess,
  programId: number | null,
): Promise<{ businessId: number } | null> {
  if (programId === null) return null;
  const [enrollment] = await db.select({
    businessId: applicationsTable.businessId,
  }).from(applicationsTable)
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.programId, programId),
      eq(applicationsTable.status, "accepted"),
    )).limit(1);
  return enrollment?.businessId == null ? null : { businessId: enrollment.businessId };
}

function validateQuestionSet(type: "poll" | "survey", questions: SessionActivityQuestion[]): string | null {
  if (questions.length === 0 || questions.length > 20) return "Add between one and twenty questions.";
  if (type === "poll" && (questions.length !== 1 || questions[0]?.type !== "single_choice")) {
    return "A poll must contain one multiple-choice question.";
  }
  const questionIds = new Set<string>();
  for (const question of questions) {
    if (questionIds.has(question.id)) return "Question IDs must be unique.";
    questionIds.add(question.id);
    if (!question.prompt.trim()) return "Every question needs a prompt.";
    if (question.type === "single_choice") {
      const options = question.options ?? [];
      if (options.length < 2 || options.length > 10) return "Multiple-choice questions need two to ten options.";
      const optionIds = new Set<string>();
      for (const option of options) {
        if (!option.label.trim() || optionIds.has(option.id)) return "Choice labels must be filled in and choice IDs must be unique.";
        optionIds.add(option.id);
      }
    } else if (question.options?.length) {
      return "Only multiple-choice questions can include choices.";
    }
  }
  return null;
}

async function getStaffActivities(sessionId: number) {
  const activities = await db.select().from(sessionInteractiveActivitiesTable)
    .where(eq(sessionInteractiveActivitiesTable.sessionId, sessionId))
    .orderBy(asc(sessionInteractiveActivitiesTable.createdAt));
  const responsesByActivity = new Map<number, Array<{
    businessName: string;
    submittedAt: Date;
    answers: SessionActivityAnswer[];
  }>>();
  if (activities.length > 0) {
    const responseRows = await db.select({
      activityId: sessionInteractiveResponsesTable.activityId,
      businessName: businessesTable.businessName,
      submittedAt: sessionInteractiveResponsesTable.submittedAt,
      answers: sessionInteractiveResponsesTable.answers,
    }).from(sessionInteractiveResponsesTable)
      .innerJoin(businessesTable, eq(sessionInteractiveResponsesTable.businessId, businessesTable.id))
      .where(inArray(sessionInteractiveResponsesTable.activityId, activities.map((activity) => activity.id)))
      .orderBy(asc(sessionInteractiveResponsesTable.submittedAt));
    for (const response of responseRows) {
      const current = responsesByActivity.get(response.activityId) ?? [];
      current.push({
        businessName: response.businessName,
        submittedAt: response.submittedAt,
        answers: response.answers,
      });
      responsesByActivity.set(response.activityId, current);
    }
  }
  return activities.map((activity) => {
    const responses = responsesByActivity.get(activity.id) ?? [];
    return CreateSessionInteractiveActivityResponse.parse({
      ...activity,
      responseCount: responses.length,
      responses,
    });
  });
}

function pollResults(activity: {
  type: string;
  questions: SessionActivityQuestion[];
}, responses: Array<{ answers: SessionActivityAnswer[] }>) {
  if (activity.type !== "poll") return null;
  const question = activity.questions[0];
  if (!question || question.type !== "single_choice") return null;
  return (question.options ?? []).map((option) => ({
    choiceId: option.id,
    label: option.label,
    count: responses.reduce((count, response) =>
      count + Number(response.answers.some((answer) =>
        answer.questionId === question.id && answer.value === option.id,
      )), 0),
  }));
}

async function getParticipantActivities(sessionId: number, businessId: number) {
  const activities = await db.select().from(sessionInteractiveActivitiesTable)
    .where(and(
      eq(sessionInteractiveActivitiesTable.sessionId, sessionId),
      inArray(sessionInteractiveActivitiesTable.status, ["open", "closed"]),
    )).orderBy(asc(sessionInteractiveActivitiesTable.createdAt));
  if (activities.length === 0) return GetParticipantSessionInteractiveActivitiesResponse.parse({ activities: [] });
  const responseRows = await db.select({
    activityId: sessionInteractiveResponsesTable.activityId,
    businessId: sessionInteractiveResponsesTable.businessId,
    answers: sessionInteractiveResponsesTable.answers,
  }).from(sessionInteractiveResponsesTable)
    .where(inArray(sessionInteractiveResponsesTable.activityId, activities.map((activity) => activity.id)));
  const responsesByActivity = new Map<number, typeof responseRows>();
  for (const response of responseRows) {
    const current = responsesByActivity.get(response.activityId) ?? [];
    current.push(response);
    responsesByActivity.set(response.activityId, current);
  }
  const visibleActivities = activities.map((activity) => {
    const responses = responsesByActivity.get(activity.id) ?? [];
    const hasResponded = responses.some((response) => response.businessId === businessId);
    const canSeePollResults = activity.type === "poll" && (hasResponded || activity.status === "closed");
    return {
      ...activity,
      responseCount: responses.length,
      hasResponded,
      results: canSeePollResults ? pollResults(activity, responses) : null,
    };
  });
  return GetParticipantSessionInteractiveActivitiesResponse.parse({ activities: visibleActivities });
}

function validateAnswers(
  questions: SessionActivityQuestion[],
  answers: SessionActivityAnswer[],
): string | null {
  if (answers.length !== questions.length) return "Answer every question before submitting.";
  const answerByQuestion = new Map<string, SessionActivityAnswer>();
  for (const answer of answers) {
    if (answerByQuestion.has(answer.questionId)) return "Each question can only have one answer.";
    answerByQuestion.set(answer.questionId, answer);
  }
  for (const question of questions) {
    const answer = answerByQuestion.get(question.id);
    if (!answer) return "Answer every question before submitting.";
    if (question.type === "single_choice") {
      if (typeof answer.value !== "string" || !(question.options ?? []).some((option) => option.id === answer.value)) {
        return "Choose one of the listed options.";
      }
    } else if (question.type === "rating") {
      if (typeof answer.value !== "number" || !Number.isInteger(answer.value) || answer.value < 1 || answer.value > 5) {
        return "Ratings must be a whole number from one to five.";
      }
    } else if (typeof answer.value !== "string" || !answer.value.trim() || answer.value.length > 2000) {
      return "Text answers must contain up to 2,000 characters.";
    }
  }
  return null;
}

async function getSessionQuestions(sessionId: number) {
  const questions = await db.select({
    id: trainingQuestionsTable.id,
    businessName: businessesTable.businessName,
    question: trainingQuestionsTable.question,
    reply: trainingQuestionsTable.reply,
    createdAt: trainingQuestionsTable.createdAt,
    repliedAt: trainingQuestionsTable.repliedAt,
  }).from(trainingQuestionsTable)
    .innerJoin(businessesTable, eq(trainingQuestionsTable.businessId, businessesTable.id))
    .where(and(
      eq(trainingQuestionsTable.sessionId, sessionId),
      isNull(trainingQuestionsTable.assignmentId),
    ))
    .orderBy(asc(trainingQuestionsTable.createdAt));
  return { questions };
}

staffRouter.get("/sessions/:id/interactive-activities", async (req, res): Promise<void> => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (!canManageSession(staff, session)) {
    res.status(403).json({ error: "Admin or assigned trainer access required." });
    return;
  }
  res.json(GetSessionInteractiveActivitiesResponse.parse({
    activities: await getStaffActivities(sessionId),
  }));
});

staffRouter.post("/sessions/:id/interactive-activities", async (req, res): Promise<void> => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  if (staff.role !== "coordinator") {
    res.status(403).json({ error: "Admin access required to create activities." });
    return;
  }
  const body = CreateSessionInteractiveActivityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (session.status === "cancelled") {
    res.status(409).json({ error: "Activities cannot be created for a cancelled session." });
    return;
  }
  const questionError = validateQuestionSet(body.data.type, body.data.questions as SessionActivityQuestion[]);
  if (questionError) {
    res.status(400).json({ error: questionError });
    return;
  }
  const [activity] = await db.insert(sessionInteractiveActivitiesTable).values({
    sessionId,
    type: body.data.type,
    title: body.data.title.trim(),
    description: body.data.description?.trim() || null,
    status: "draft",
    questions: body.data.questions as SessionActivityQuestion[],
    createdByStaffId: staff.id,
  }).returning();
  res.status(201).json(CreateSessionInteractiveActivityResponse.parse({
    ...activity,
    responseCount: 0,
    responses: [],
  }));
});

staffRouter.patch("/interactive-activities/:id", async (req, res): Promise<void> => {
  const activityId = parseId(req.params.id);
  const body = UpdateSessionInteractiveActivityBody.safeParse(req.body);
  if (!activityId || !body.success) {
    res.status(400).json({ error: body.success ? "Invalid activity ID." : body.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const [activity] = await db.select().from(sessionInteractiveActivitiesTable)
    .where(eq(sessionInteractiveActivitiesTable.id, activityId)).limit(1);
  if (!activity) {
    res.status(404).json({ error: "Activity not found." });
    return;
  }
  const session = await getSession(activity.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (!canManageSession(staff, session)) {
    res.status(403).json({ error: "Admin or assigned trainer access required." });
    return;
  }
  const changesContent = body.data.title !== undefined ||
    body.data.description !== undefined ||
    body.data.questions !== undefined;
  if (changesContent && staff.role !== "coordinator") {
    res.status(403).json({ error: "Only admins can edit activity content." });
    return;
  }
  if (session.status === "cancelled" && body.data.status === "open") {
    res.status(409).json({ error: "Activities cannot be opened for a cancelled session." });
    return;
  }
  const type = activity.type as "poll" | "survey";
  const questions = (body.data.questions ?? activity.questions) as SessionActivityQuestion[];
  const questionError = validateQuestionSet(type, questions);
  if (questionError) {
    res.status(400).json({ error: questionError });
    return;
  }
  if (activity.status === "open" && changesContent) {
    res.status(409).json({ error: "Close the activity before editing its content." });
    return;
  }
  if (changesContent) {
    const [existingResponse] = await db.select({ id: sessionInteractiveResponsesTable.id })
      .from(sessionInteractiveResponsesTable)
      .where(eq(sessionInteractiveResponsesTable.activityId, activityId))
      .limit(1);
    if (existingResponse) {
      res.status(409).json({ error: "Activity content cannot change after participants have responded." });
      return;
    }
  }
  const [updated] = await db.update(sessionInteractiveActivitiesTable).set({
    ...(body.data.title !== undefined ? { title: body.data.title.trim() } : {}),
    ...(body.data.description !== undefined ? { description: body.data.description?.trim() || null } : {}),
    ...(body.data.questions !== undefined ? { questions: body.data.questions as SessionActivityQuestion[] } : {}),
    ...(body.data.status !== undefined ? { status: body.data.status } : {}),
  }).where(eq(sessionInteractiveActivitiesTable.id, activityId)).returning();
  const activities = await getStaffActivities(activity.sessionId);
  const result = activities.find((item) => item.id === activityId);
  res.json(result ?? UpdateSessionInteractiveActivityResponse.parse({
    ...updated,
    responseCount: 0,
    responses: [],
  }));
});

staffRouter.get("/sessions/:id/questions", async (req, res): Promise<void> => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (!canManageSession(staff, session)) {
    res.status(403).json({ error: "Admin or assigned trainer access required." });
    return;
  }
  res.json(GetSessionQuestionsResponse.parse(await getSessionQuestions(sessionId)));
});

participantRouter.get("/sessions/:id/interactive-activities", async (req, res): Promise<void> => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const enrollment = await getParticipantEnrollment(
    res.locals.participant as ParticipantAccess,
    session.programId,
  );
  if (!enrollment) {
    res.status(403).json({ error: "Session is outside your accepted cohort." });
    return;
  }
  if (session.status === "cancelled") {
    res.json(GetParticipantSessionInteractiveActivitiesResponse.parse({ activities: [] }));
    return;
  }
  res.json(await getParticipantActivities(sessionId, enrollment.businessId));
});

participantRouter.post("/interactive-activities/:id/responses", async (req, res): Promise<void> => {
  const activityId = parseId(req.params.id);
  const body = SubmitParticipantSessionInteractiveActivityBody.safeParse(req.body);
  if (!activityId || !body.success) {
    res.status(400).json({ error: body.success ? "Invalid activity ID." : body.error.message });
    return;
  }
  const [activity] = await db.select().from(sessionInteractiveActivitiesTable)
    .where(eq(sessionInteractiveActivitiesTable.id, activityId)).limit(1);
  if (!activity) {
    res.status(404).json({ error: "Activity not found." });
    return;
  }
  const session = await getSession(activity.sessionId);
  if (!session || session.programId === null) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const enrollment = await getParticipantEnrollment(
    res.locals.participant as ParticipantAccess,
    session.programId,
  );
  if (!enrollment) {
    res.status(403).json({ error: "Activity is outside your accepted cohort." });
    return;
  }
  if (activity.status !== "open" || session.status === "cancelled") {
    res.status(409).json({ error: "This activity is not open for responses." });
    return;
  }
  const questionError = validateAnswers(activity.questions, body.data.answers as SessionActivityAnswer[]);
  if (questionError) {
    res.status(400).json({ error: questionError });
    return;
  }
  const [existing] = await db.select({ id: sessionInteractiveResponsesTable.id })
    .from(sessionInteractiveResponsesTable)
    .where(and(
      eq(sessionInteractiveResponsesTable.activityId, activity.id),
      eq(sessionInteractiveResponsesTable.businessId, enrollment.businessId),
    )).limit(1);
  if (existing) {
    res.status(409).json({ error: "Your business has already responded to this activity." });
    return;
  }
  try {
    await db.insert(sessionInteractiveResponsesTable).values({
      activityId: activity.id,
      businessId: enrollment.businessId,
      answers: body.data.answers as SessionActivityAnswer[],
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Your business has already responded to this activity." });
      return;
    }
    throw error;
  }
  const activities = await getParticipantActivities(activity.sessionId, enrollment.businessId);
  const response = activities.activities.find((item) => item.id === activity.id);
  if (!response) {
    res.status(500).json({ error: "The saved response could not be loaded." });
    return;
  }
  res.status(201).json(SubmitParticipantSessionInteractiveActivityResponse.parse(response));
});

participantRouter.get("/sessions/:id/questions", async (req, res): Promise<void> => {
  const sessionId = parseId(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const enrollment = await getParticipantEnrollment(
    res.locals.participant as ParticipantAccess,
    session.programId,
  );
  if (!enrollment) {
    res.status(403).json({ error: "Session is outside your accepted cohort." });
    return;
  }
  res.json(GetParticipantSessionQuestionsResponse.parse(await getSessionQuestions(sessionId)));
});

export const staffSessionInteractionsRouter = staffRouter;
export const participantSessionInteractionsRouter = participantRouter;
