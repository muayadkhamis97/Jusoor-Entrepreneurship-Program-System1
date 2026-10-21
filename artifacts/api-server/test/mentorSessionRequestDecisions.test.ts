import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import { requireOperationsStaff } from "../src/middlewares/staffAccess";

let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;
let selectedProgramRows: unknown[] = [];
let selectedMentorRows: unknown[] = [];
let databaseSelectCalls = 0;
let transactionSelectRows: unknown[][] = [];
let transactionSelectCalls = 0;
let transactionWhereConditions: unknown[] = [];
let updateSets: Record<string, unknown>[] = [];
let requestStaff: Record<string, unknown>;
let dashboardMode = false;
let dashboardHistoryRows: Record<string, unknown>[] = [];
let dashboardHistoryWhereQueries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
let dashboardEngagementRows: Record<string, unknown>[] = [];

const assignedStaff = {
  id: 71,
  email: "staff@example.test",
  role: "staff",
  status: "active",
  programIds: [12],
};

function makeProgramScopeQuery() {
  const rows = databaseSelectCalls++ === 0 ? selectedProgramRows : selectedMentorRows;
  const query: Record<string, (...args: unknown[]) => unknown> = {
    from: () => query,
    where: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    limit: async () => rows,
    orderBy: () => query,
    groupBy: () => query,
  };
  query.then = (resolve, reject) => Promise.resolve(rows).then(resolve as never, reject as never);
  return query;
}

function makeDashboardQuery(projection: Record<string, unknown>) {
  const keys = Object.keys(projection);
  let rows: Record<string, unknown>[] = [];
  const isHistoryQuery = keys.includes("resolvedAt");
  if (keys.includes("mentorSessionsPerBusiness")) {
    rows = dashboardEngagementRows;
  } else if (keys.length === 1 && keys[0] === "id") {
    rows = selectedProgramRows as Record<string, unknown>[];
  } else if (isHistoryQuery) {
    rows = dashboardHistoryRows;
  }

  const query: Record<string, (...args: unknown[]) => unknown> = {
    from: () => query,
    where: (condition) => {
      if (isHistoryQuery) {
        const compiled = new PgDialect().sqlToQuery(condition as never);
        dashboardHistoryWhereQueries.push(compiled);
        const hasMentorFilter = compiled.sql.includes("mentor_staff_id");
        const hasProgramFilter = compiled.sql.includes("program_id");
        rows = dashboardHistoryRows.filter((request) =>
          (!hasMentorFilter || compiled.params.includes(request.mentorStaffId)) &&
          (!hasProgramFilter || compiled.params.includes(request.programId)),
        );
      }
      return query;
    },
    innerJoin: () => query,
    leftJoin: () => query,
    limit: async () => rows,
    orderBy: () => query,
    groupBy: () => query,
  };
  query.then = (resolve, reject) => Promise.resolve(rows).then(resolve as never, reject as never);
  return query;
}

function makeTransaction() {
  const tx = {
    select: () => {
      const rows = transactionSelectRows[transactionSelectCalls] ?? [];
      transactionSelectCalls += 1;
      const query: Record<string, (...args: unknown[]) => unknown> = {
        from: () => query,
        where: (condition) => {
          transactionWhereConditions.push(condition);
          return query;
        },
        for: (mode) => {
          assert.equal(mode, "update", "the request row should be locked before applying a decision");
          return query;
        },
        limit: async () => rows,
      };
      return query;
    },
    update: () => {
      const query: Record<string, (...args: unknown[]) => unknown> = {
        set: (values) => {
          updateSets.push(values as Record<string, unknown>);
          return query;
        },
        where: () => query,
        then: (resolve, reject) => Promise.resolve([]).then(resolve as never, reject as never),
        returning: async () => [{
          id: 56,
          status: updateSets.at(-1)?.status,
          decision: updateSets.at(-1)?.decision,
          approvedAdditionalSessions: updateSets.at(-1)?.approvedAdditionalSessions ?? null,
          resolvedAt: new Date("2026-10-21T12:00:00.000Z"),
        }],
      };
      return query;
    },
  };
  return tx;
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const database = await import("@workspace/db");
  db = database.db;
  const { default: mentorRouter, staffMentorMeetingReportsRouter } = await import("../src/routes/mentor");
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: (projection?: Record<string, unknown>) =>
      dashboardMode ? makeDashboardQuery(projection ?? {}) : makeProgramScopeQuery(),
  });
  restoreSelect = () => {
    if (originalSelect) Object.defineProperty(db, "select", originalSelect);
    else Reflect.deleteProperty(db, "select");
  };
  const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) => callback(makeTransaction()),
  });
  restoreTransaction = () => {
    if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
    else Reflect.deleteProperty(db, "transaction");
  };

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    (_req as typeof _req & { log: { error: () => void } }).log = { error: () => undefined };
    res.locals.staff = requestStaff;
    next();
  });
  app.use("/api/staff", requireOperationsStaff, staffMentorMeetingReportsRouter);
  app.use("/api/mentor", mentorRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect?.();
  restoreTransaction?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  requestStaff = { ...assignedStaff };
  selectedProgramRows = [{ id: 12 }];
  selectedMentorRows = [];
  databaseSelectCalls = 0;
  transactionSelectRows = [[{ id: 56, programId: 12 }]];
  transactionSelectCalls = 0;
  transactionWhereConditions = [];
  updateSets = [];
  dashboardMode = false;
  dashboardHistoryRows = [];
  dashboardHistoryWhereQueries = [];
  dashboardEngagementRows = [];
});

async function decide(body: Record<string, unknown>) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return fetch(`http://127.0.0.1:${address.port}/api/staff/mentor-additional-session-requests/56/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getMentorDashboard() {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return fetch(`http://127.0.0.1:${address.port}/api/mentor/dashboard`);
}

test("assigned program staff can approve an extra-session count atomically", async () => {
  const response = await decide({ decision: "approved", approvedAdditionalSessions: 3 });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 56,
    status: "resolved",
    decision: "approved",
    approvedAdditionalSessions: 3,
    resolvedAt: "2026-10-21T12:00:00.000Z",
  });
  const { resolvedAt: approvalTime, ...approvalSet } = updateSets[0]!;
  assert.ok(approvalTime instanceof Date);
  assert.deepEqual(approvalSet, {
    status: "resolved",
    decision: "approved",
    approvedAdditionalSessions: 3,
    resolvedByStaffId: 71,
  });
  const scopedRequestSql = new PgDialect().sqlToQuery(transactionWhereConditions[0] as never);
  assert.ok(scopedRequestSql.params.includes(12), "request lookup must include the staff member's authorized program");
});

test("staff can decline a request without changing the program target", async () => {
  requestStaff = { ...assignedStaff, role: "coordinator", programIds: [] };
  const response = await decide({ decision: "declined" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 56,
    status: "resolved",
    decision: "declined",
    approvedAdditionalSessions: null,
    resolvedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(updateSets.length, 1);
  const { resolvedAt: declineTime, ...declineSet } = updateSets[0]!;
  assert.ok(declineTime instanceof Date);
  assert.deepEqual(declineSet, {
    status: "resolved",
    decision: "declined",
    approvedAdditionalSessions: null,
    resolvedByStaffId: 71,
  });
});

test("a notification lookup failure does not undo a saved decision", async () => {
  const response = await decide({ decision: "approved", approvedAdditionalSessions: 4 });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 56,
    status: "resolved",
    decision: "approved",
    approvedAdditionalSessions: 4,
    resolvedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(updateSets[0]?.decision, "approved");
});

test("staff cannot decide requests from a program outside their assignment or submit an invalid decision count", async () => {
  transactionSelectRows = [[]];
  const outOfScope = await decide({ decision: "approved", approvedAdditionalSessions: 2 });
  assert.equal(outOfScope.status, 404);
  assert.deepEqual(updateSets, []);

  transactionSelectCalls = 0;
  transactionWhereConditions = [];
  const missingCount = await decide({ decision: "approved" });
  assert.equal(missingCount.status, 400);
  assert.equal(transactionSelectCalls, 0, "invalid decisions should be rejected before database writes");

  const countOnDecline = await decide({ decision: "declined", approvedAdditionalSessions: 1 });
  assert.equal(countOnDecline.status, 400);
});

test("mentor dashboard shows only the requesting mentor's session-request history within assigned programs", async () => {
  dashboardMode = true;
  selectedProgramRows = [{ id: 12 }, { id: 99 }];
  requestStaff = {
    ...assignedStaff,
    role: "mentor",
    bookingProvider: "calendly",
    calendlyBookingUrl: null,
    googleCalendarBookingUrl: null,
    googleCalendarAccountEmail: null,
  };
  dashboardEngagementRows = [{
    id: 301,
    businessId: 900,
    businessName: "Shared Business",
    founderName: "Founder",
    programName: "Assigned Program",
    mentorSessionsPerBusiness: 3,
    type: "mentor",
    provider: "Assigned mentor",
    topic: "Business support",
    scheduledDate: null,
    status: "matched",
    notes: null,
  }];
  dashboardHistoryRows = [
    {
      id: 501,
      businessId: 900,
      programId: 12,
      mentorStaffId: 71,
      status: "resolved",
      decision: "approved",
      approvedAdditionalSessions: 2,
      emailNotificationStatus: "delivered",
      createdAt: new Date("2026-10-10T12:00:00.000Z"),
      resolvedAt: new Date("2026-10-11T12:00:00.000Z"),
    },
    {
      id: 502,
      businessId: 900,
      programId: 12,
      mentorStaffId: 72,
      status: "resolved",
      decision: "declined",
      approvedAdditionalSessions: null,
      emailNotificationStatus: "delivered",
      createdAt: new Date("2026-10-12T12:00:00.000Z"),
      resolvedAt: new Date("2026-10-13T12:00:00.000Z"),
    },
    {
      id: 503,
      businessId: 901,
      programId: 99,
      mentorStaffId: 71,
      status: "resolved",
      decision: "approved",
      approvedAdditionalSessions: 4,
      emailNotificationStatus: "delivered",
      createdAt: new Date("2026-10-14T12:00:00.000Z"),
      resolvedAt: new Date("2026-10-15T12:00:00.000Z"),
    },
  ];

  const response = await getMentorDashboard();
  assert.equal(response.status, 200);
  const dashboard = await response.json() as {
    engagements: { businessId: number; additionalSessionRequests: { id: number; decision: string | null }[] }[];
  };
  assert.equal(dashboard.engagements.length, 1);
  assert.deepEqual(dashboard.engagements[0]?.additionalSessionRequests.map(({ id, decision }) => ({ id, decision })), [
    { id: 501, decision: "approved" },
  ]);

  const historyQuery = dashboardHistoryWhereQueries[0];
  assert.ok(historyQuery, "the dashboard should query the mentor's request history");
  assert.match(historyQuery.sql, /mentor_staff_id/);
  assert.match(historyQuery.sql, /program_id/);
  assert.ok(historyQuery.params.includes(71), "request history must be filtered to the signed-in mentor");
  assert.ok(historyQuery.params.includes(12), "request history must stay within the mentor's active program assignments");
  assert.ok(!historyQuery.params.includes(99), "unassigned programs must not be included in request history");
});
