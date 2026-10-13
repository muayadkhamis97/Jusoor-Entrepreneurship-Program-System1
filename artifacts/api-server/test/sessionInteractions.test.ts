import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import type { Response } from "express";
import {
  applicationsTable,
  db,
  sessionInteractiveActivitiesTable,
  sessionInteractiveResponsesTable,
  sessionsTable,
  trainingQuestionsTable,
} from "@workspace/db";
import { canTrainerAccessSessionQuestion } from "../src/lib/trainer-access";

const nativeFetch = globalThis.fetch;
let server: Server;
let restoreSelect: (() => void) | undefined;
let restoreInsert: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;

const session = {
  id: 71,
  programId: 8,
  trainerStaffId: 11,
  status: "scheduled",
};
const pollQuestion = {
  id: "poll-choice",
  type: "single_choice" as const,
  prompt: "Which topic should we cover next?",
  options: [
    { id: "finance", label: "Finance" },
    { id: "sales", label: "Sales" },
  ],
};
const surveyQuestions = [{
  id: "survey-text",
  type: "short_text" as const,
  prompt: "What is your biggest challenge?",
}];
let activities: Array<Record<string, any>>;
let responses: Array<Record<string, any>>;
let createdActivityCount = 0;
let requestParticipantId: string | undefined;
let requestRole: string | undefined;
let requestPath: string | undefined;

function resetFixtures() {
  activities = [
    {
      id: 101,
      sessionId: session.id,
      type: "poll",
      title: "Cohort poll",
      description: null,
      status: "open",
      questions: [pollQuestion],
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
      updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      createdByStaffId: 3,
    },
    {
      id: 102,
      sessionId: session.id,
      type: "survey",
      title: "Cohort survey",
      description: null,
      status: "open",
      questions: surveyQuestions,
      createdAt: new Date("2026-10-01T10:01:00.000Z"),
      updatedAt: new Date("2026-10-01T10:01:00.000Z"),
      createdByStaffId: 3,
    },
    {
      id: 103,
      sessionId: session.id,
      type: "poll",
      title: "Closed poll",
      description: null,
      status: "closed",
      questions: [pollQuestion],
      createdAt: new Date("2026-10-01T10:02:00.000Z"),
      updatedAt: new Date("2026-10-01T10:02:00.000Z"),
      createdByStaffId: 3,
    },
    {
      id: 104,
      sessionId: session.id,
      type: "survey",
      title: "Draft survey",
      description: null,
      status: "draft",
      questions: [{ id: "draft-text", type: "short_text", prompt: "Do not show before launch." }],
      createdAt: new Date("2026-10-01T10:03:00.000Z"),
      updatedAt: new Date("2026-10-01T10:03:00.000Z"),
      createdByStaffId: 3,
    },
  ];
  responses = [
    {
      id: 201,
      activityId: 101,
      businessId: 200,
      answers: [{ questionId: "poll-choice", value: "sales" }],
      submittedAt: new Date("2026-10-02T10:00:00.000Z"),
      businessName: "Other Business",
    },
    {
      id: 202,
      activityId: 102,
      businessId: 200,
      answers: [{ questionId: "survey-text", value: "Confidential survey response" }],
      submittedAt: new Date("2026-10-02T10:01:00.000Z"),
      businessName: "Other Business",
    },
    {
      id: 203,
      activityId: 103,
      businessId: 200,
      answers: [{ questionId: "poll-choice", value: "finance" }],
      submittedAt: new Date("2026-10-02T10:02:00.000Z"),
      businessName: "Other Business",
    },
  ];
  createdActivityCount = 0;
}

function rowsFor(table: unknown): Array<Record<string, any>> {
  if (table === sessionsTable) return [session];
  if (table === sessionInteractiveActivitiesTable) {
    return requestRole === "participant" && requestPath === "/sessions/71/interactive-activities"
      ? activities.filter(({ status }) => status === "open" || status === "closed")
      : activities;
  }
  if (table === sessionInteractiveResponsesTable) {
    return responses.map(({ activityId, businessId, answers, submittedAt, businessName }) => ({
      activityId,
      businessId,
      answers,
      submittedAt,
      businessName: businessName ?? (businessId === 100 ? "Founder Business" : "Other Business"),
    }));
  }
  if (table === applicationsTable) {
    return requestParticipantId === "accepted-user" || requestParticipantId === "same-business-user"
      ? [{ businessId: 100 }]
      : [];
  }
  if (table === trainingQuestionsTable) return [];
  return [];
}

function replaceDbMethod(
  name: "select" | "insert" | "update",
  replacement: (...args: never[]) => unknown,
): () => void {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, {
    configurable: true,
    writable: true,
    value: replacement,
  });
  return () => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  };
}

function testIdentity(req: express.Request, res: Response, next: express.NextFunction) {
  const role = req.header("x-test-role");
  if (!role) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }
  requestParticipantId = req.header("x-test-user") ?? undefined;
  requestRole = role;
  requestPath = req.path;
  if (role === "participant") {
    res.locals.participant = {
      userId: requestParticipantId ?? "",
      email: "participant@example.com",
    };
  } else {
    res.locals.staff = {
      id: Number(req.header("x-test-staff-id") ?? 0),
      email: "staff@example.com",
      role,
      status: "active",
    };
  }
  next();
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const { staffSessionInteractionsRouter, participantSessionInteractionsRouter } =
    await import("../src/routes/sessionInteractions");

  restoreSelect = replaceDbMethod("select", (() => {
    let selectedTable: unknown;
    const query = {
      from(table: unknown) {
        selectedTable = table;
        return query;
      },
      innerJoin() { return query; },
      where() { return query; },
      orderBy() { return query; },
      limit(limit: number) {
        const rows = selectedTable === sessionInteractiveResponsesTable
          ? responses.filter(({ activityId, businessId }) => activityId === 101 && businessId === 100)
          : rowsFor(selectedTable);
        return Promise.resolve(rows.slice(0, limit));
      },
      then(resolve: (value: Array<Record<string, any>>) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rowsFor(selectedTable)).then(resolve, reject);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  restoreInsert = replaceDbMethod("insert", ((table: unknown) => {
    let values: Record<string, any> = {};
    const query = {
      values(next: Record<string, any>) {
        values = next;
        return query;
      },
      returning: async () => {
        if (table === sessionInteractiveActivitiesTable) {
          const now = new Date();
          const activity = {
            ...values,
            id: 300 + ++createdActivityCount,
            createdAt: now,
            updatedAt: now,
          };
          activities.push(activity);
          return [activity];
        }
        return [];
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        if (table === sessionInteractiveResponsesTable) {
          responses.push({
            ...values,
            id: 400 + responses.length,
            submittedAt: new Date(),
            businessName: "Founder Business",
          });
        }
        return Promise.resolve(undefined).then(resolve, reject);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  restoreUpdate = replaceDbMethod("update", ((table: unknown) => {
    let changes: Record<string, unknown> = {};
    const query = {
      set(next: Record<string, unknown>) {
        changes = next;
        return query;
      },
      where() { return query; },
      returning: async () => {
        if (table !== sessionInteractiveActivitiesTable) return [];
        const [activity] = activities.filter(({ id }) => id === 101);
        if (!activity) return [];
        Object.assign(activity, changes);
        return [activity];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use("/api/participant", testIdentity, participantSessionInteractionsRouter);
  app.use("/api", testIdentity, staffSessionInteractionsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

beforeEach(resetFixtures);

after(async () => {
  restoreInsert?.();
  restoreUpdate?.();
  restoreSelect?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, options);
}

function staffHeaders(role: string, id = 11) {
  return { "x-test-role": role, "x-test-staff-id": String(id) };
}

function participantHeaders(userId: string) {
  return { "x-test-role": "participant", "x-test-user": userId };
}

test("only coordinators can create session activities", async () => {
  const coordinator = await request("/api/sessions/71/interactive-activities", {
    method: "POST",
    headers: { ...staffHeaders("coordinator"), "content-type": "application/json" },
    body: JSON.stringify({ type: "poll", title: "Next topic", description: null, questions: [pollQuestion] }),
  });
  assert.equal(coordinator.status, 201);
  assert.equal(createdActivityCount, 1);

  const trainer = await request("/api/sessions/71/interactive-activities", {
    method: "POST",
    headers: { ...staffHeaders("trainer"), "content-type": "application/json" },
    body: JSON.stringify({ type: "poll", title: "Unauthorized", description: null, questions: [pollQuestion] }),
  });
  assert.equal(trainer.status, 403);
  assert.equal(createdActivityCount, 1);
});

test("assigned trainers can review live answers but unassigned trainers cannot read or change activities", async () => {
  const assigned = await request("/api/sessions/71/interactive-activities", {
    headers: staffHeaders("trainer", 11),
  });
  assert.equal(assigned.status, 200);
  const staffView = await assigned.json() as { activities: Array<{ responses: Array<{ answers: unknown[] }> }> };
  assert.equal(staffView.activities[0]?.responses.length, 1);
  assert.deepEqual(staffView.activities[0]?.responses[0]?.answers, [
    { questionId: "poll-choice", value: "sales" },
  ]);

  const contentEdit = await request("/api/interactive-activities/101", {
    method: "PATCH",
    headers: { ...staffHeaders("trainer", 11), "content-type": "application/json" },
    body: JSON.stringify({ title: "Trainer cannot rewrite the question" }),
  });
  assert.equal(contentEdit.status, 403);

  const assignedStatusChange = await request("/api/interactive-activities/101", {
    method: "PATCH",
    headers: { ...staffHeaders("trainer", 11), "content-type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  });
  assert.equal(assignedStatusChange.status, 200);
  assert.equal((await assignedStatusChange.json() as { status: string }).status, "closed");

  const unassignedRead = await request("/api/sessions/71/interactive-activities", {
    headers: staffHeaders("trainer", 12),
  });
  const unassignedChange = await request("/api/interactive-activities/101", {
    method: "PATCH",
    headers: { ...staffHeaders("trainer", 12), "content-type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  });
  assert.deepEqual([unassignedRead.status, unassignedChange.status], [403, 403]);
});

test("participants must belong to the accepted cohort and never receive survey answers", async () => {
  const blocked = await request("/api/participant/sessions/71/interactive-activities", {
    headers: participantHeaders("outside-user"),
  });
  assert.equal(blocked.status, 403);

  const visible = await request("/api/participant/sessions/71/interactive-activities", {
    headers: participantHeaders("accepted-user"),
  });
  assert.equal(visible.status, 200);
  const payload = await visible.text();
  assert.doesNotMatch(payload, /Confidential survey response|Other Business|Draft survey|Do not show before launch/);
  const parsed = JSON.parse(payload) as {
    activities: Array<{ id: number; results: Array<{ choiceId: string; count: number }> | null }>;
  };
  const openPoll = parsed.activities.find(({ id }) => id === 101);
  const closedPoll = parsed.activities.find(({ id }) => id === 103);
  const survey = parsed.activities.find(({ id }) => id === 102);
  assert.equal(openPoll?.results, null);
  assert.deepEqual(closedPoll?.results?.map(({ choiceId, count }) => [choiceId, count]), [
    ["finance", 1],
    ["sales", 0],
  ]);
  assert.equal(survey?.results, null);
});

test("a business can respond once, then sees poll totals without exposing survey responses", async () => {
  const first = await request("/api/participant/interactive-activities/101/responses", {
    method: "POST",
    headers: { ...participantHeaders("accepted-user"), "content-type": "application/json" },
    body: JSON.stringify({ answers: [{ questionId: "poll-choice", value: "finance" }] }),
  });
  assert.equal(first.status, 201);
  const afterResponse = await request("/api/participant/sessions/71/interactive-activities", {
    headers: participantHeaders("accepted-user"),
  });
  const activitiesAfterResponse = await afterResponse.json() as {
    activities: Array<{ id: number; results: Array<{ choiceId: string; count: number }> | null }>;
  };
  assert.deepEqual(
    activitiesAfterResponse.activities.find(({ id }) => id === 101)?.results?.map(({ choiceId, count }) => [choiceId, count]),
    [["finance", 1], ["sales", 1]],
  );

  const duplicateFromSameBusiness = await request("/api/participant/interactive-activities/101/responses", {
    method: "POST",
    headers: { ...participantHeaders("same-business-user"), "content-type": "application/json" },
    body: JSON.stringify({ answers: [{ questionId: "poll-choice", value: "sales" }] }),
  });
  assert.equal(duplicateFromSameBusiness.status, 409);
  assert.equal(responses.filter(({ activityId, businessId }) => activityId === 101 && businessId === 100).length, 1);
});

test("session questions are available only to assigned trainers and accepted participants", async () => {
  const unassignedTrainer = await request("/api/sessions/71/questions", {
    headers: staffHeaders("trainer", 12),
  });
  const participant = await request("/api/participant/sessions/71/questions", {
    headers: participantHeaders("accepted-user"),
  });
  const outsideParticipant = await request("/api/participant/sessions/71/questions", {
    headers: participantHeaders("outside-user"),
  });
  assert.deepEqual([unassignedTrainer.status, participant.status, outsideParticipant.status], [403, 200, 403]);
});

test("session interaction endpoints reject requests without an authenticated identity", async () => {
  const staff = await request("/api/sessions/71/interactive-activities");
  const participant = await request("/api/participant/sessions/71/interactive-activities");
  assert.deepEqual([staff.status, participant.status], [401, 401]);
});

test("trainer session-question scope excludes questions from other trainers' sessions", () => {
  const assignedSessions = new Set([71, 72]);
  assert.equal(canTrainerAccessSessionQuestion(71, assignedSessions), true);
  assert.equal(canTrainerAccessSessionQuestion(900, assignedSessions), false);
  assert.equal(canTrainerAccessSessionQuestion(null, assignedSessions), true);
});
