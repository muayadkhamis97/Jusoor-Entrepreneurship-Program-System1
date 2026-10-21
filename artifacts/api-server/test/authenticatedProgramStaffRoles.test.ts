import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { Request, RequestHandler } from "express";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
process.env.JUSOOR_BOOTSTRAP_COORDINATOR_EMAIL = "bootstrap@example.com";

const database = await import("@workspace/db");
const {
  db,
  businessesTable,
  programsTable,
  sessionsTable,
  staffMembersTable,
  staffProgramAssignmentsTable,
  staffProgramRolesTable,
  supportTable,
  pitchJudgesTable,
  trainingAssignmentsTable,
  trainingQuestionsTable,
  trainingSubmissionsTable,
} = database;
const { createApp } = await import("../src/app");

type Row = Record<string, any>;
const staffId = 14;
const archivedStaffId = 15;
const archivedProgramIds = new Set([44, 55, 66]);
let activeStaffFixture = true;
let invitedStaffFixture = false;
let coordinatorStaffFixture = false;
const mutationAttempts: { table: unknown; path: string; role: string; values?: Row }[] = [];
const trainerSession: Row = {
  id: 110,
  programId: 11,
  title: "Program 11 training",
  type: "training",
  scheduledDate: "2026-10-01",
  startTime: "10:00",
  durationMinutes: 60,
  facilitator: null,
  trainerStaffId: staffId,
  deliveryMode: "online",
  location: null,
  zoomUrl: null,
  zoomMeetingId: null,
  recordingUrl: null,
  status: "scheduled",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
};
const otherTrainerSession: Row = {
  ...trainerSession,
  id: 111,
  title: "Program 11 session led by another trainer",
  trainerStaffId: 999,
};
const mentorUpdate: Row = {
  id: 301,
  businessId: 201,
  businessName: "Program 11 business",
  founderName: "Founder One",
  programName: "Program Eleven",
  type: "mentor",
  provider: "Assigned mentor",
  topic: "Customer discovery",
  scheduledDate: "2026-10-02",
  status: "completed",
  notes: null,
};
const judgeAssignment: Row = {
  id: 402,
  pitchId: 502,
  judgeStaffId: staffId,
  score: 8,
  feedback: "Clear market understanding",
  submittedAt: new Date("2026-10-03T00:00:00.000Z"),
};
const judgeResponse: Row = {
  assignmentId: 402,
  pitchId: 502,
  businessId: 202,
  businessName: "Program 22 business",
  industry: "Technology",
  eventType: "demo_day",
  eventDate: "2026-10-04",
  score: 8,
  feedback: "Clear market understanding",
  submittedAt: new Date("2026-10-03T00:00:00.000Z"),
};
const trainingAssignments: Row[] = [
  {
    id: 701,
    programId: 11,
    title: "Program 11 activity",
    instructions: "Complete the customer discovery exercise.",
    dueDate: null,
    sessionId: null,
    sessionTitle: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  },
  {
    id: 702,
    programId: 33,
    title: "Program 33 activity",
    instructions: "Complete the market validation exercise.",
    dueDate: null,
    sessionId: null,
    sessionTitle: null,
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
  },
  {
    id: 703,
    programId: 22,
    title: "Program 22 activity",
    instructions: "This is outside the trainer's role.",
    dueDate: null,
    sessionId: null,
    sessionTitle: null,
    createdAt: new Date("2026-10-03T00:00:00.000Z"),
  },
];
const trainingSubmissions: Row[] = [
  {
    id: 801,
    assignmentId: 701,
    programId: 11,
    businessId: 201,
    answer: "Program 11 answer",
    status: "submitted",
    score: null,
    feedback: null,
    submittedAt: new Date("2026-10-04T00:00:00.000Z"),
    reviewedAt: null,
    assignmentTitle: "Program 11 activity",
    businessName: "Program 11 business",
    founderName: "Founder One",
    programName: "Jusoor Growth Lab",
  },
  {
    id: 802,
    assignmentId: 702,
    programId: 33,
    businessId: 203,
    answer: "Program 33 answer",
    status: "submitted",
    score: null,
    feedback: null,
    submittedAt: new Date("2026-10-05T00:00:00.000Z"),
    reviewedAt: null,
    assignmentTitle: "Program 33 activity",
    businessName: "Program 33 business",
    founderName: "Founder Three",
    programName: "Women in Technology",
  },
  {
    id: 803,
    assignmentId: 703,
    programId: 22,
    businessId: 202,
    answer: "Program 22 answer",
    status: "submitted",
    score: null,
    feedback: null,
    submittedAt: new Date("2026-10-06T00:00:00.000Z"),
    reviewedAt: null,
    assignmentTitle: "Program 22 activity",
    businessName: "Program 22 business",
    founderName: "Founder Two",
    programName: "Pitch Day Program",
  },
];
const trainingQuestions: Row[] = [
  {
    id: 901,
    programId: 11,
    sessionId: null,
    assignmentId: null,
    businessId: 201,
    sessionTitle: null,
    assignmentTitle: null,
    question: "Program 11 question",
    reply: null,
    createdAt: new Date("2026-10-07T00:00:00.000Z"),
    repliedAt: null,
    businessName: "Program 11 business",
    founderName: "Founder One",
    programName: "Jusoor Growth Lab",
  },
  {
    id: 902,
    programId: 33,
    sessionId: null,
    assignmentId: null,
    businessId: 203,
    sessionTitle: null,
    assignmentTitle: null,
    question: "Program 33 question without a session",
    reply: null,
    createdAt: new Date("2026-10-08T00:00:00.000Z"),
    repliedAt: null,
    businessName: "Program 33 business",
    founderName: "Founder Three",
    programName: "Women in Technology",
  },
  {
    id: 903,
    programId: 22,
    sessionId: null,
    assignmentId: null,
    businessId: 202,
    sessionTitle: null,
    assignmentTitle: null,
    question: "Program 22 question",
    reply: null,
    createdAt: new Date("2026-10-09T00:00:00.000Z"),
    repliedAt: null,
    businessName: "Program 22 business",
    founderName: "Founder Two",
    programName: "Pitch Day Program",
  },
  {
    id: 904,
    programId: 11,
    sessionId: 110,
    assignmentId: null,
    businessId: 201,
    sessionTitle: trainerSession.title,
    assignmentTitle: null,
    question: "Question from the trainer's own session",
    reply: null,
    createdAt: new Date("2026-10-10T00:00:00.000Z"),
    repliedAt: null,
    businessName: "Program 11 business",
    founderName: "Founder One",
    programName: "Jusoor Growth Lab",
  },
  {
    id: 905,
    programId: 11,
    sessionId: 111,
    assignmentId: null,
    businessId: 201,
    sessionTitle: otherTrainerSession.title,
    assignmentTitle: null,
    question: "Question from another trainer's session",
    reply: null,
    createdAt: new Date("2026-10-11T00:00:00.000Z"),
    repliedAt: null,
    businessName: "Program 11 business",
    founderName: "Founder One",
    programName: "Jusoor Growth Lab",
  },
];

let server: Server;
let requestPath = "";
let requestRole = "";
const restoreMethods: Array<() => void> = [];

function rowsFor(table: unknown): Row[] {
  if (table === staffMembersTable) {
    return [{
      id: activeStaffFixture ? staffId : archivedStaffId,
      email: activeStaffFixture ? "multi-role@example.com" : "archived-specialist@example.com",
      clerkUserId: activeStaffFixture ? "test-staff-user" : "test-archived-staff-user",
      role: coordinatorStaffFixture ? "coordinator" : "staff",
      status: invitedStaffFixture ? "invited" : "active",
      invitationEmailStatus: invitedStaffFixture ? "pending" : null,
      bookingProvider: "calendly",
      calendlyBookingUrl: null,
      googleCalendarAccountEmail: null,
      googleCalendarBookingUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }];
  }
  if (table === staffProgramAssignmentsTable) {
    return activeStaffFixture
      ? [{ programId: 11 }, { programId: 22 }, { programId: 33 }]
      : [{ programId: 44 }, { programId: 55 }, { programId: 66 }];
  }
  if (table === staffProgramRolesTable) {
    return activeStaffFixture
      ? [
        { programId: 11, role: "trainer" },
        { programId: 11, role: "mentor" },
        { programId: 22, role: "judge" },
        { programId: 33, role: "trainer" },
      ]
      : [
        { programId: 44, role: "trainer" },
        { programId: 55, role: "mentor" },
        { programId: 66, role: "judge" },
      ];
  }
  if (table === programsTable) {
    return [
      { id: 11, name: "Jusoor Growth Lab", archivedAt: null },
      { id: 22, name: "Pitch Day Program", archivedAt: null },
      { id: 33, name: "Women in Technology", archivedAt: null },
      { id: 44, name: "Archived Trainer Cohort", archivedAt: new Date("2026-09-01T00:00:00.000Z") },
      { id: 55, name: "Archived Mentor Cohort", archivedAt: new Date("2026-09-01T00:00:00.000Z") },
      { id: 66, name: "Archived Judge Cohort", archivedAt: new Date("2026-09-01T00:00:00.000Z") },
    ];
  }
  if (table === sessionsTable && requestPath.startsWith("/api/trainer/") && requestRole === "trainer") {
    if (requestPath === "/api/trainer/dashboard") return [trainerSession];
    const questionId = Number(requestPath.split("/").at(-1));
    const question = trainingQuestions.find(({ id }) => id === questionId);
    if (question?.sessionId === trainerSession.id) return [trainerSession];
    if (question?.sessionId === otherTrainerSession.id) return [otherTrainerSession];
    return [];
  }
  if (table === trainingAssignmentsTable && requestPath === "/api/trainer/dashboard" && requestRole === "trainer") {
    return trainingAssignments;
  }
  if (table === trainingSubmissionsTable && requestPath === "/api/trainer/dashboard" && requestRole === "trainer") {
    return trainingSubmissions;
  }
  if (table === trainingSubmissionsTable && requestPath.startsWith("/api/trainer/submissions/") && requestRole === "trainer") {
    const id = Number(requestPath.split("/").at(-1));
    const submission = trainingSubmissions.find((row) => row.id === id);
    return submission ? [{ id: submission.id, programId: submission.programId }] : [];
  }
  if (table === trainingQuestionsTable && requestPath === "/api/trainer/dashboard" && requestRole === "trainer") {
    return trainingQuestions;
  }
  if (table === trainingQuestionsTable && requestPath.startsWith("/api/trainer/questions/") && requestRole === "trainer") {
    const id = Number(requestPath.split("/").at(-1));
    return trainingQuestions.filter((row) => row.id === id);
  }
  if (table === supportTable && requestPath === "/api/mentor/support/301") return [mentorUpdate];
  if (table === businessesTable && requestPath.includes("/api/mentor/")) return [{ id: 201, programId: 11 }];
  if (table === pitchJudgesTable && requestPath === "/api/judge/scorecards/402") return [judgeResponse];
  return [];
}

function conditionHasArchivedAtIsNull(condition: unknown): boolean {
  const pending = [condition];
  const seen = new Set<object>();
  let hasArchivedAtColumn = false;
  let hasIsNull = false;

  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    const chunk = current as { name?: unknown; queryChunks?: unknown[]; value?: unknown };
    if (chunk.name === "archived_at") hasArchivedAtColumn = true;
    if (Array.isArray(chunk.queryChunks)) pending.push(...chunk.queryChunks);
    if (Array.isArray(chunk.value)) {
      const text = chunk.value.filter((part): part is string => typeof part === "string").join("");
      if (/\bis null\b/i.test(text)) hasIsNull = true;
    }
  }

  return hasArchivedAtColumn && hasIsNull;
}

function sqlParameterValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const pending = [condition];
  const seen = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if ((current as { constructor?: { name?: string } }).constructor?.name === "Param") {
      values.push((current as { value?: unknown }).value);
      continue;
    }
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    const chunk = current as { queryChunks?: unknown[] };
    if (Array.isArray(chunk.queryChunks)) pending.push(...chunk.queryChunks);
  }
  return values;
}

function replaceDbMethod(name: "select" | "selectDistinct" | "insert" | "update", replacement: unknown) {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, { configurable: true, writable: true, value: replacement });
  restoreMethods.push(() => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  });
}

function selectBuilder() {
  let table: unknown;
  let joinedPrograms = false;
  let excludesArchivedPrograms = false;
  let trainerProgramFilter: number[] | null = null;
  let assignmentSessionFilter: number[] = [];
  const query: any = {
    from(nextTable: unknown) { table = nextTable; return query; },
    innerJoin(nextTable: unknown) {
      if (nextTable === programsTable) joinedPrograms = true;
      return query;
    },
    leftJoin() { return query; },
    where(condition: unknown) {
      excludesArchivedPrograms = conditionHasArchivedAtIsNull(condition);
      if (requestPath === "/api/trainer/dashboard" && requestRole === "trainer"
        && (table === trainingAssignmentsTable || table === trainingSubmissionsTable || table === trainingQuestionsTable)) {
        trainerProgramFilter = sqlParameterValues(condition).filter((value): value is number => typeof value === "number");
        assert.deepEqual(
          [...trainerProgramFilter].sort((a, b) => a - b),
          [11, 33],
          "trainer participant-work queries must be scoped to active trainer-role programs",
        );
      }
      if (requestPath === "/api/training-assignments" && table === sessionsTable) {
        assignmentSessionFilter = sqlParameterValues(condition).filter((value): value is number => typeof value === "number");
      }
      return query;
    },
    orderBy() { return query; },
    limit(limit: number) {
      return Promise.resolve(filteredRows().slice(0, limit));
    },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(filteredRows()).then(resolve, reject);
    },
  };
  function filteredRows(): Row[] {
    if (table === sessionsTable && requestPath === "/api/training-assignments") {
      const otherFilterValues = assignmentSessionFilter.filter(value => value !== trainerSession.id);
      return assignmentSessionFilter.includes(trainerSession.id)
        && (!otherFilterValues.length || otherFilterValues.includes(trainerSession.programId))
        ? [trainerSession]
        : [];
    }
    const rows = rowsFor(table);
    if (trainerProgramFilter) return rows.filter(({ programId }) => trainerProgramFilter!.includes(programId));
    if (!excludesArchivedPrograms) return rows;
    if (table === programsTable) return rows.filter(({ id }) => !archivedProgramIds.has(id));
    if (joinedPrograms && (table === staffProgramAssignmentsTable || table === staffProgramRolesTable)) {
      return rows.filter(({ programId }) => !archivedProgramIds.has(programId));
    }
    return rows;
  }
  return query;
}

const testAuthentication: RequestHandler = (req, _res, next) => {
  requestPath = req.originalUrl;
  requestRole = req.get("x-jusoor-staff-role") ?? "";
  const staffFixture = req.get("x-test-staff-fixture");
  activeStaffFixture = staffFixture !== "archived";
  invitedStaffFixture = staffFixture === "invited";
  coordinatorStaffFixture = staffFixture === "coordinator";
  const userId = activeStaffFixture ? "test-staff-user" : "test-archived-staff-user";
  const authHandler = Object.assign(
    () => ({
      tokenType: "session_token",
      userId,
      sessionId: "test-session",
      sessionStatus: "active",
      sessionClaims: { sub: userId },
    }),
    { [Symbol.for("@clerk/express.auth")]: true },
  );
  (req as Request & { auth: typeof authHandler }).auth = authHandler;
  next();
};

before(async () => {
  replaceDbMethod("select", selectBuilder as never);
  replaceDbMethod("selectDistinct", selectBuilder as never);
  replaceDbMethod("insert", ((table: unknown) => {
    let values: Row = {};
    const attempt = { table, path: requestPath, role: requestRole };
    mutationAttempts.push(attempt);
    const query: any = {
      values(nextValues: Row) { values = nextValues; attempt.values = nextValues; return query; },
      onConflictDoNothing() { return query; },
      returning() {
        return Promise.resolve(table === trainingAssignmentsTable
          && requestPath === "/api/training-assignments"
          && (requestRole === "staff" || requestRole === "coordinator")
          ? [{
            id: 601,
            ...values,
            dueDate: values.dueDate ?? null,
            sessionId: values.sessionId ?? null,
            createdAt: new Date("2026-10-05T00:00:00.000Z"),
          }]
          : []);
      },
      then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve([]).then(resolve, reject);
      },
    };
    return query;
  }) as never);
  replaceDbMethod("update", ((table: unknown) => {
    let result: Row[] = [];
    let updateValues: Row = {};
    mutationAttempts.push({ table, path: requestPath, role: requestRole });
    const query: any = {
      set(values: Row) { updateValues = values; return query; },
      where() {
        if (table === trainingSubmissionsTable && requestPath === "/api/trainer/submissions/802" && requestRole === "trainer") {
          const submission = trainingSubmissions.find(({ id }) => id === 802);
          if (submission) result = [{ ...submission, ...updateValues }];
        }
        if (table === trainingQuestionsTable && requestPath.startsWith("/api/trainer/questions/") && requestRole === "trainer") {
          const id = Number(requestPath.split("/").at(-1));
          const question = trainingQuestions.find(({ id: questionId }) => questionId === id);
          if (question) result = [{ ...question, ...updateValues }];
        }
        if (table === supportTable && requestPath === "/api/mentor/support/301" && requestRole === "mentor") {
          result = [mentorUpdate];
        }
        if (table === pitchJudgesTable && requestPath === "/api/judge/scorecards/402" && requestRole === "judge") {
          result = [judgeAssignment];
        }
        return query;
      },
      returning() { return Promise.resolve(result); },
    };
    return query;
  }) as never);

  server = createServer(createApp({ authenticationMiddleware: testAuthentication }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  for (const restore of restoreMethods.reverse()) restore();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(method: string, path: string, role: string, body?: Row, fixture: "active" | "archived" | "invited" | "coordinator" = "active") {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "x-jusoor-staff-role": role,
      ...(fixture !== "active" ? { "x-test-staff-fixture": fixture } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("current staff access response includes nullable or pending invitation email status", async () => {
  const response = await request("GET", "/api/auth/me", "staff");
  assert.equal(response.status, 200);
  const staff = await response.json() as Row;
  assert.equal(staff.invitationEmailStatus, null);

  const invitedResponse = await request("GET", "/api/auth/me", "staff", undefined, "invited");
  assert.equal(invitedResponse.status, 200);
  assert.equal((await invitedResponse.json() as Row).invitationEmailStatus, "pending");
});

test("secondary staff roles can use only their assigned program workflows through authenticated routes", async () => {
  const trainerDashboard = await request("GET", "/api/trainer/dashboard", "trainer");
  assert.equal(trainerDashboard.status, 200);
  const dashboard = await trainerDashboard.json() as Row;
  assert.deepEqual(dashboard.programs, [
    { id: 11, name: "Jusoor Growth Lab" },
    { id: 33, name: "Women in Technology" },
  ]);
  assert.deepEqual(dashboard.sessions.map(({ programId }: Row) => programId), [11]);
  assert.deepEqual(dashboard.assignments.map(({ id, programId }: Row) => ({ id, programId })), [
    { id: 701, programId: 11 },
    { id: 702, programId: 33 },
  ]);
  assert.deepEqual(dashboard.submissions.map(({ id, assignmentId }: Row) => ({ id, assignmentId })).sort((a: Row, b: Row) => a.id - b.id), [
    { id: 801, assignmentId: 701 },
    { id: 802, assignmentId: 702 },
  ]);
  assert.deepEqual(dashboard.questions.map(({ id, programId }: Row) => ({ id, programId })).sort((a: Row, b: Row) => a.id - b.id), [
    { id: 901, programId: 11 },
    { id: 902, programId: 33 },
    { id: 904, programId: 11 },
  ]);

  const reviewInAssignedProgram = await request("PATCH", "/api/trainer/submissions/802", "trainer", {
    score: 90,
    feedback: "Good validation.",
  });
  assert.equal(reviewInAssignedProgram.status, 200);
  assert.equal((await reviewInAssignedProgram.json() as Row).id, 802);

  const mutationsBeforeDeniedReview = mutationAttempts.length;
  const reviewInUnassignedProgram = await request("PATCH", "/api/trainer/submissions/803", "trainer", {
    score: 20,
    feedback: "Must not be saved.",
  });
  assert.equal(reviewInUnassignedProgram.status, 404);
  assert.equal(mutationAttempts.length, mutationsBeforeDeniedReview, "unassigned submission reviews must not reach the database update");

  const replyInAssignedProgramWithoutSession = await request("PATCH", "/api/trainer/questions/902", "trainer", {
    reply: "Program 33 response.",
  });
  assert.equal(replyInAssignedProgramWithoutSession.status, 200);
  assert.equal((await replyInAssignedProgramWithoutSession.json() as Row).id, 902);

  const replyInOwnSession = await request("PATCH", "/api/trainer/questions/904", "trainer", {
    reply: "Reply from the trainer assigned to this session.",
  });
  assert.equal(replyInOwnSession.status, 200);
  assert.equal((await replyInOwnSession.json() as Row).id, 904);

  const mutationsBeforeDeniedSessionReply = mutationAttempts.length;
  const replyInAnotherTrainersSession = await request("PATCH", "/api/trainer/questions/905", "trainer", {
    reply: "Must not be saved.",
  });
  assert.equal(replyInAnotherTrainersSession.status, 404);
  assert.equal(
    mutationAttempts.length,
    mutationsBeforeDeniedSessionReply,
    "a trainer must not update a question from another trainer's session in an assigned cohort",
  );

  const mutationsBeforeDeniedReply = mutationAttempts.length;
  const replyInUnassignedProgram = await request("PATCH", "/api/trainer/questions/903", "trainer", {
    reply: "Must not be saved.",
  });
  assert.equal(replyInUnassignedProgram.status, 404);
  assert.equal(mutationAttempts.length, mutationsBeforeDeniedReply, "unassigned question replies must not reach the database update");

  const trainingAssignment = {
    title: "Customer discovery review",
    instructions: "Review the participant's customer interviews.",
  };
  const staffCreatedAssignment = await request("POST", "/api/training-assignments", "staff", {
    programId: 11,
    sessionId: 110,
    ...trainingAssignment,
  });
  assert.equal(staffCreatedAssignment.status, 201);
  assert.equal((await staffCreatedAssignment.json() as Row).programId, 11);
  assert.equal(mutationAttempts.at(-1)?.values?.createdByStaffId, staffId, "the authenticated staff member is recorded as creator");

  const staffAssignmentWithCrossProgramSession = await request("POST", "/api/training-assignments", "staff", {
    programId: 33,
    sessionId: 110,
    ...trainingAssignment,
  });
  assert.equal(staffAssignmentWithCrossProgramSession.status, 400, "a linked session must belong to the assignment program");

  const staffInUnassignedProgram = await request("POST", "/api/training-assignments", "staff", {
    programId: 44,
    ...trainingAssignment,
  });
  assert.equal(staffInUnassignedProgram.status, 403);

  const mutationsBeforeTrainerCreate = mutationAttempts.length;
  const trainerAssignmentAttempt = await request("POST", "/api/training-assignments", "trainer", {
    programId: 11,
    ...trainingAssignment,
  });
  assert.equal(trainerAssignmentAttempt.status, 403, "trainers must not create cohort assignments");
  assert.equal(mutationAttempts.length, mutationsBeforeTrainerCreate, "denied trainer requests must not reach the database");

  const adminCreatedAssignment = await request("POST", "/api/training-assignments", "coordinator", {
    programId: 33,
    ...trainingAssignment,
  }, "coordinator");
  assert.equal(adminCreatedAssignment.status, 201, "admins can create assignments across active programs");
  assert.equal((await adminCreatedAssignment.json() as Row).programId, 33);
  assert.equal(mutationAttempts.at(-1)?.values?.createdByStaffId, staffId);

  const legacyTrainerAssignmentAttempt = await request("POST", "/api/trainer/assignments", "trainer", {
    programId: 11,
    ...trainingAssignment,
  });
  assert.equal(legacyTrainerAssignmentAttempt.status, 403, "the former trainer-only create endpoint no longer permits trainers");

  const mentorInAssignedProgram = await request("PATCH", "/api/mentor/support/301", "mentor", { status: "completed" });
  assert.equal(mentorInAssignedProgram.status, 200);
  assert.equal((await mentorInAssignedProgram.json() as Row).id, mentorUpdate.id);

  const mentorInUnassignedProgram = await request("PATCH", "/api/mentor/support/302", "mentor", { status: "completed" });
  assert.equal(mentorInUnassignedProgram.status, 404);

  const judgeInAssignedProgram = await request("PATCH", "/api/judge/scorecards/402", "judge", {
    score: 8,
    feedback: "Clear market understanding",
  });
  assert.equal(judgeInAssignedProgram.status, 200);
  assert.equal((await judgeInAssignedProgram.json() as Row).assignmentId, judgeAssignment.id);

  const judgeInUnassignedProgram = await request("PATCH", "/api/judge/scorecards/401", "judge", {
    score: 8,
    feedback: "Not assigned",
  });
  assert.equal(judgeInUnassignedProgram.status, 404);
});

test("archived-only specialist assignments cannot open or mutate trainer, mentor, or judge workspaces", async () => {
  const mutationsBefore = mutationAttempts.length;
  const routes = [
    {
      role: "trainer",
      dashboard: "/api/trainer/dashboard",
      mutationPath: "/api/trainer/assignments",
      method: "POST",
      body: { programId: 44, title: "Archived assignment", instructions: "Must not be created." },
    },
    {
      role: "mentor",
      dashboard: "/api/mentor/dashboard",
      mutationPath: "/api/mentor/support/303",
      method: "PATCH",
      body: { status: "completed" },
    },
    {
      role: "judge",
      dashboard: "/api/judge/dashboard",
      mutationPath: "/api/judge/scorecards/403",
      method: "PATCH",
      body: { score: 10, feedback: "Must not be saved." },
    },
  ] as const;

  for (const route of routes) {
    const dashboard = await request("GET", route.dashboard, route.role, undefined, "archived");
    assert.equal(dashboard.status, 403, `${route.role} should not open a workspace based only on archived assignments`);
    assert.doesNotMatch(await dashboard.text(), /Archived (Trainer|Mentor|Judge) Cohort/);

    const mutation = await request(route.method, route.mutationPath, route.role, route.body, "archived");
    assert.equal(mutation.status, 403, `${route.role} should not mutate records in an archived cohort`);
    assert.doesNotMatch(await mutation.text(), /Archived (Trainer|Mentor|Judge) Cohort/);
  }

  assert.equal(mutationAttempts.length, mutationsBefore, "archived-only specialist requests must be rejected before any database mutation");
});

