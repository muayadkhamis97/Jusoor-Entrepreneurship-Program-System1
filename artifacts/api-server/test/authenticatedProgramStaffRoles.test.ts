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
} = database;
const { createApp } = await import("../src/app");

type Row = Record<string, any>;
const staffId = 14;
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

let server: Server;
let requestPath = "";
let requestRole = "";
const restoreMethods: Array<() => void> = [];

function rowsFor(table: unknown): Row[] {
  if (table === staffMembersTable) {
    return [{
      id: staffId,
      email: "multi-role@example.com",
      clerkUserId: "test-staff-user",
      role: "staff",
      status: "active",
      bookingProvider: "calendly",
      calendlyBookingUrl: null,
      googleCalendarAccountEmail: null,
      googleCalendarBookingUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }];
  }
  if (table === staffProgramAssignmentsTable) return [{ programId: 11 }, { programId: 22 }];
  if (table === staffProgramRolesTable) {
    return [
      { programId: 11, role: "trainer" },
      { programId: 11, role: "mentor" },
      { programId: 22, role: "judge" },
    ];
  }
  if (table === programsTable) {
    return [{ id: 11, archivedAt: null }, { id: 22, archivedAt: null }];
  }
  if (table === sessionsTable && requestPath.startsWith("/api/trainer/") && requestRole === "trainer") {
    return [trainerSession];
  }
  if (table === supportTable && requestPath === "/api/mentor/support/301") return [mentorUpdate];
  if (table === businessesTable && requestPath.includes("/api/mentor/")) return [{ id: 201, programId: 11 }];
  if (table === pitchJudgesTable && requestPath === "/api/judge/scorecards/402") return [judgeResponse];
  return [];
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
  const query: any = {
    from(nextTable: unknown) { table = nextTable; return query; },
    innerJoin() { return query; },
    leftJoin() { return query; },
    where() { return query; },
    orderBy() { return query; },
    limit(limit: number) { return Promise.resolve(rowsFor(table).slice(0, limit)); },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(rowsFor(table)).then(resolve, reject);
    },
  };
  return query;
}

const testAuthentication: RequestHandler = (req, _res, next) => {
  requestPath = req.originalUrl;
  requestRole = req.get("x-jusoor-staff-role") ?? "";
  const authHandler = Object.assign(
    () => ({
      tokenType: "session_token",
      userId: "test-staff-user",
      sessionId: "test-session",
      sessionStatus: "active",
      sessionClaims: { sub: "test-staff-user" },
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
    const query: any = {
      values(nextValues: Row) { values = nextValues; return query; },
      onConflictDoNothing() { return query; },
      returning() {
        return Promise.resolve(table === trainingAssignmentsTable
          && requestPath === "/api/trainer/assignments"
          && requestRole === "trainer"
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
    const query: any = {
      set() { return query; },
      where() {
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

async function request(method: string, path: string, role: string, body?: Row) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "x-jusoor-staff-role": role,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("secondary staff roles can use only their assigned program workflows through authenticated routes", async () => {
  const trainingAssignment = {
    title: "Customer discovery review",
    instructions: "Review the participant's customer interviews.",
  };
  const trainerInAssignedProgram = await request("POST", "/api/trainer/assignments", "trainer", {
    programId: 11,
    ...trainingAssignment,
  });
  assert.equal(trainerInAssignedProgram.status, 201);
  assert.equal((await trainerInAssignedProgram.json() as Row).programId, 11);

  const trainerInUnassignedProgram = await request("POST", "/api/trainer/assignments", "trainer", {
    programId: 22,
    ...trainingAssignment,
  });
  assert.equal(trainerInUnassignedProgram.status, 403);

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

