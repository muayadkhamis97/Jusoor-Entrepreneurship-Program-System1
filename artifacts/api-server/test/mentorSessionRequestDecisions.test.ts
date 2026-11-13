import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { requireOperationsStaff } from "../src/middlewares/staffAccess";
import { sendMentorAdditionalSessionWithdrawalEmail } from "../src/lib/mentor-additional-session-email";

let server: Server;
let db: typeof import("@workspace/db").db;
let postgresPool: typeof import("@workspace/db").pool;
const postgresRaceTestUrl = process.env.TEST_DATABASE_URL;
let restoreSelect: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;
let restoreInsert: (() => void) | undefined;
let selectedProgramRows: unknown[] = [];
let selectedMentorRows: unknown[] = [];
let databaseSelectCalls = 0;
let transactionSelectRows: unknown[][] = [];
let transactionSelectCalls = 0;
let transactionWhereConditions: unknown[] = [];
let updateSets: Record<string, unknown>[] = [];
let withdrawalWhereConditions: unknown[] = [];
let withdrawalReturnedRows: Record<string, unknown>[] = [];
let requestStaff: Record<string, unknown>;
let dashboardMode = false;
let dashboardHistoryRows: Record<string, unknown>[] = [];
let dashboardHistoryWhereQueries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
let dashboardEngagementRows: Record<string, unknown>[] = [];
let creatingRequests = false;
let createRequestRows: Record<string, unknown>[] = [];
let createInsertAttempts = 0;
let expectedCreateInsertAttempts = 0;
let createReportedSessions = 1;
let createSessionTarget = 1;
let createBusinessLockCount = 0;
let finishCreateInsertBarrier!: () => void;
let createInsertBarrier: Promise<void> = Promise.resolve();

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

function makeCreateRequestQuery(projection: Record<string, unknown>) {
  const keys = Object.keys(projection);
  let tableName = "";
  let rows: Record<string, unknown>[] = [];
  const query: Record<string, (...args: unknown[]) => unknown> = {
    from: (table) => {
      tableName = getTableName(table as never);
      if (tableName === "jusoor_programs") {
        rows = keys.includes("sessionTarget")
          ? [{ id: 12, name: "Test program", sessionTarget: 1 }]
          : [{ id: 12 }];
      } else if (tableName === "mentor_session_requests" && keys.includes("approvedAdditionalSessions")) {
        rows = [{ approvedAdditionalSessions: null }];
      } else if (tableName === "jusoor_mentor_meeting_reports") {
        rows = [{ reportedSessions: 1 }];
      } else if (tableName === "jusoor_staff_members") {
        rows = keys.includes("clerkUserId") ? [{ clerkUserId: null, displayName: null }] : [];
      }
      return query;
    },
    where: (condition) => {
      const params = new PgDialect().sqlToQuery(condition as never).params;
      if (tableName === "jusoor_support") {
        const supportId = params.find((param) => param === 301 || param === 302);
        const businessId = supportId === 302 ? 901 : 900;
        rows = [{
          id: supportId,
          businessId,
          businessName: `Business ${businessId}`,
          programId: 12,
        }];
      } else if (tableName === "mentor_session_requests" && keys.includes("id")) {
        const businessId = params.find((param) => param === 900 || param === 901);
        rows = createRequestRows.filter((row) =>
          row.businessId === businessId && row.status === "open",
        );
      }
      return query;
    },
    innerJoin: () => query,
    leftJoin: () => query,
    limit: async (limit) => rows.slice(0, Number(limit)),
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

function makeCreateRequestTransaction() {
  const tx = {
    select: (projection: Record<string, unknown>) => {
      const keys = Object.keys(projection);
      let tableName = "";
      let rows: Record<string, unknown>[] = [];
      const query: Record<string, (...args: unknown[]) => unknown> = {
        from: (table) => {
          tableName = getTableName(table as never);
          if (tableName === "jusoor_businesses") {
            rows = [{ id: 900 }];
          } else if (tableName === "jusoor_programs") {
            rows = [{ id: 12, name: "Test program", sessionTarget: createSessionTarget }];
          } else if (tableName === "mentor_session_requests" && keys.includes("approvedAdditionalSessions")) {
            rows = [{ approvedAdditionalSessions: null }];
          } else if (tableName === "jusoor_mentor_meeting_reports") {
            rows = [{ reportedSessions: createReportedSessions }];
          } else if (tableName === "mentor_session_requests" && keys.includes("id")) {
            rows = createRequestRows.filter((row) => row.businessId === 900 && row.status === "open");
          }
          return query;
        },
        where: () => query,
        innerJoin: () => query,
        for: (mode) => {
          assert.equal(mode, "update", "eligibility should be read while the business row is locked");
          createBusinessLockCount += 1;
          return query;
        },
        limit: async (limit) => rows.slice(0, Number(limit)),
      };
      query.then = (resolve, reject) => Promise.resolve(rows).then(resolve as never, reject as never);
      return query;
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          createInsertAttempts += 1;
          if (createInsertAttempts === expectedCreateInsertAttempts) finishCreateInsertBarrier();
          await createInsertBarrier;
          if (createRequestRows.some((row) =>
            row.businessId === values.businessId && row.status === "open",
          )) {
            throw Object.assign(new Error("duplicate open mentor-session request"), { code: "23505" });
          }
          const request = {
            ...values,
            id: 800 + createRequestRows.length,
            decision: null,
            approvedAdditionalSessions: null,
            status: "open",
            emailNotificationStatus: "pending",
            emailNotificationUpdatedAt: new Date("2026-10-21T12:00:00.000Z"),
            createdAt: new Date("2026-10-21T12:00:00.000Z"),
            resolvedAt: null,
            resolvedByStaffId: null,
          };
          createRequestRows.push(request);
          return [request];
        },
      }),
    }),
  };
  return tx;
}

function makeUpdate() {
  const query: Record<string, (...args: unknown[]) => unknown> = {
    set: (values) => {
      updateSets.push(values as Record<string, unknown>);
      return query;
    },
    where: (condition) => {
      withdrawalWhereConditions.push(condition);
      return query;
    },
    returning: async () => withdrawalReturnedRows,
    then: (resolve, reject) => Promise.resolve([]).then(resolve as never, reject as never),
  };
  return query;
}

before(async () => {
  if (postgresRaceTestUrl) {
    process.env.DATABASE_URL = postgresRaceTestUrl;
  } else {
    process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  }
  process.env.NODE_ENV = "test";
  const database = await import("@workspace/db");
  db = database.db;
  postgresPool = database.pool;
  const { default: mentorRouter, staffMentorMeetingReportsRouter } = await import("../src/routes/mentor");
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: (projection?: Record<string, unknown>) => {
      if (creatingRequests) return makeCreateRequestQuery(projection ?? {});
      return dashboardMode ? makeDashboardQuery(projection ?? {}) : makeProgramScopeQuery();
    },
  });
  restoreSelect = () => {
    if (originalSelect) Object.defineProperty(db, "select", originalSelect);
    else Reflect.deleteProperty(db, "select");
  };
  const originalUpdate = Object.getOwnPropertyDescriptor(db, "update");
  Object.defineProperty(db, "update", {
    configurable: true,
    writable: true,
    value: () => makeUpdate(),
  });
  restoreUpdate = () => {
    if (originalUpdate) Object.defineProperty(db, "update", originalUpdate);
    else Reflect.deleteProperty(db, "update");
  };
  const originalInsert = Object.getOwnPropertyDescriptor(db, "insert");
  Object.defineProperty(db, "insert", {
    configurable: true,
    writable: true,
    value: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          createInsertAttempts += 1;
          if (createInsertAttempts === expectedCreateInsertAttempts) finishCreateInsertBarrier();
          await createInsertBarrier;
          if (createRequestRows.some((row) =>
            row.businessId === values.businessId && row.status === "open",
          )) {
            throw Object.assign(new Error("duplicate open mentor-session request"), { code: "23505" });
          }
          const request = {
            ...values,
            id: 800 + createRequestRows.length,
            decision: null,
            approvedAdditionalSessions: null,
            status: "open",
            emailNotificationStatus: "pending",
            emailNotificationUpdatedAt: new Date("2026-10-21T12:00:00.000Z"),
            createdAt: new Date("2026-10-21T12:00:00.000Z"),
            resolvedAt: null,
            resolvedByStaffId: null,
          };
          createRequestRows.push(request);
          return [request];
        },
      }),
    }),
  });
  restoreInsert = () => {
    if (originalInsert) Object.defineProperty(db, "insert", originalInsert);
    else Reflect.deleteProperty(db, "insert");
  };
  const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) =>
      callback(creatingRequests
        ? makeCreateRequestTransaction() as unknown as ReturnType<typeof makeTransaction>
        : makeTransaction()),
  });
  restoreTransaction = () => {
    if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
    else Reflect.deleteProperty(db, "transaction");
  };

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    (_req as typeof _req & { log: { error: () => void; warn: () => void } }).log = {
      error: () => undefined,
      warn: () => undefined,
    };
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
  restoreUpdate?.();
  restoreInsert?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await postgresPool.end();
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
  withdrawalWhereConditions = [];
  withdrawalReturnedRows = [];
  dashboardMode = false;
  dashboardHistoryRows = [];
  dashboardHistoryWhereQueries = [];
  dashboardEngagementRows = [];
  creatingRequests = false;
  createRequestRows = [];
  createInsertAttempts = 0;
  expectedCreateInsertAttempts = 0;
  createReportedSessions = 1;
  createSessionTarget = 1;
  createBusinessLockCount = 0;
  createInsertBarrier = Promise.resolve();
  finishCreateInsertBarrier = () => undefined;
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

async function withdraw(requestId: number) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return fetch(`http://127.0.0.1:${address.port}/api/mentor/additional-session-requests/${requestId}/withdraw`, {
    method: "POST",
  });
}

async function requestAdditionalSessions(supportId: number) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return fetch(`http://127.0.0.1:${address.port}/api/mentor/support/${supportId}/additional-session-requests`, {
    method: "POST",
  });
}

function beginConcurrentRequestCreates(expectedInsertions: number) {
  creatingRequests = true;
  expectedCreateInsertAttempts = expectedInsertions;
  createInsertBarrier = new Promise<void>((resolve) => {
    finishCreateInsertBarrier = resolve;
  });
}

test("simultaneous extra-session requests keep one open request per business", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  beginConcurrentRequestCreates(2);

  const responses = await Promise.all([
    requestAdditionalSessions(301),
    requestAdditionalSessions(301),
  ]);

  assert.deepEqual(
    responses.map(({ status }) => status).sort(),
    [201, 409],
    JSON.stringify(await Promise.all(responses.map((response) => response.clone().json()))),
  );
  const conflict = responses.find(({ status }) => status === 409);
  assert.ok(conflict);
  assert.match(
    (await conflict.json() as { error: string }).error,
    /already open for this business/i,
  );
  assert.equal(createRequestRows.filter(({ businessId, status }) => businessId === 900 && status === "open").length, 1);
  assert.equal(createBusinessLockCount, 2);
});

test("simultaneous extra-session requests for separate businesses remain independent", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  beginConcurrentRequestCreates(2);

  const responses = await Promise.all([
    requestAdditionalSessions(301),
    requestAdditionalSessions(302),
  ]);

  assert.deepEqual(
    responses.map(({ status }) => status),
    [201, 201],
    JSON.stringify(await Promise.all(responses.map((response) => response.clone().json()))),
  );
  assert.deepEqual(createRequestRows.map(({ businessId, status }) => ({ businessId, status })), [
    { businessId: 900, status: "open" },
    { businessId: 901, status: "open" },
  ]);
});

test("an extra-session request stores the report count observed under the business lock", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  creatingRequests = true;
  createReportedSessions = 3;
  createSessionTarget = 2;

  const response = await requestAdditionalSessions(301);

  assert.equal(response.status, 201);
  const body = await response.json() as {
    reportedSessionsAtRequest: number;
    sessionTargetAtRequest: number;
  };
  assert.equal(body.reportedSessionsAtRequest, 3);
  assert.equal(body.sessionTargetAtRequest, 2);
  assert.equal(createRequestRows[0]?.reportedSessionsAtRequest, 3);
  assert.equal(createRequestRows[0]?.sessionTargetAtRequest, 2);
  assert.equal(createBusinessLockCount, 1);
});

test("a request remains ineligible with a clear conflict when its locked report count is below target", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  creatingRequests = true;
  createReportedSessions = 1;
  createSessionTarget = 2;

  const response = await requestAdditionalSessions(301);

  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /has not reached.*target/i);
  assert.equal(createRequestRows.length, 0);
  assert.equal(createBusinessLockCount, 1);
});

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

test("a mentor can withdraw their own open request within an active program assignment", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  withdrawalReturnedRows = [{
    id: 56,
    status: "resolved",
    decision: "withdrawn",
    approvedAdditionalSessions: null,
    resolvedAt: new Date("2026-10-21T12:00:00.000Z"),
  }];

  const response = await withdraw(56);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 56,
    status: "resolved",
    decision: "withdrawn",
    approvedAdditionalSessions: null,
    resolvedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.deepEqual(updateSets[0], {
    status: "resolved",
    decision: "withdrawn",
    approvedAdditionalSessions: null,
    resolvedByStaffId: null,
    resolvedAt: updateSets[0]?.resolvedAt,
  });
  assert.ok(updateSets[0]?.resolvedAt instanceof Date);
  const condition = new PgDialect().sqlToQuery(withdrawalWhereConditions[0] as never);
  assert.match(condition.sql, /mentor_staff_id/);
  assert.match(condition.sql, /status/);
  assert.match(condition.sql, /program_id/);
  assert.ok(condition.params.includes(56));
  assert.ok(condition.params.includes(71));
  assert.ok(condition.params.includes(12));
  assert.equal(databaseSelectCalls, 2, "the withdrawal should trigger a lookup for the staff notice");
});

test("a withdrawal notice is sent to the program team with the request details", async () => {
  let sentMessage: {
    recipients: string[];
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  } | undefined;

  await sendMentorAdditionalSessionWithdrawalEmail({
    requestId: 56,
    recipients: ["coordinator@example.test", "program-staff@example.test"],
    mentorName: "Morgan Mentor",
    mentorEmail: "mentor@example.test",
    businessName: "Bright <Ideas>",
    programName: "Jusoor Program",
  }, async (message) => {
    sentMessage = message;
  });

  assert.ok(sentMessage);
  assert.deepEqual(sentMessage.recipients, ["coordinator@example.test", "program-staff@example.test"]);
  assert.equal(sentMessage.subject, "Mentor withdrew additional sessions request: Bright <Ideas>");
  assert.match(sentMessage.text, /Morgan Mentor withdrew the request for additional one-to-one sessions for Bright <Ideas>/);
  assert.match(sentMessage.text, /Program: Jusoor Program/);
  assert.match(sentMessage.text, /Mentor: Morgan Mentor \(mentor@example\.test\)/);
  assert.match(sentMessage.html, /Bright &lt;Ideas&gt;/);
  assert.equal(sentMessage.idempotencyKey, "mentor-additional-session-withdrawal-56");
});

test("a failed withdrawal notice does not undo the withdrawal", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  withdrawalReturnedRows = [{
    id: 56,
    status: "resolved",
    decision: "withdrawn",
    approvedAdditionalSessions: null,
    resolvedAt: new Date("2026-10-21T12:00:00.000Z"),
  }];
  selectedMentorRows = [];

  const response = await withdraw(56);

  assert.equal(response.status, 200);
  assert.equal((await response.json() as { decision: string }).decision, "withdrawn");
  assert.equal(updateSets[0]?.decision, "withdrawn");
  assert.equal(databaseSelectCalls, 2, "notification details should be loaded only after the withdrawal is saved");
});

test("a different mentor assigned to the same program cannot withdraw the request", async () => {
  requestStaff = { ...assignedStaff, id: 72, role: "mentor" };

  const response = await withdraw(56);
  assert.equal(response.status, 404);
  assert.equal(updateSets.length, 1);
  const condition = new PgDialect().sqlToQuery(withdrawalWhereConditions[0] as never);
  assert.ok(condition.params.includes(72), "the withdrawal must be scoped to the signed-in mentor");
  assert.ok(condition.params.includes(12), "the request must also be within the mentor's active program assignment");
});

test("resolved requests and requests outside active program assignments cannot be withdrawn", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  const resolvedRequest = await withdraw(56);
  assert.equal(resolvedRequest.status, 404);
  const resolvedCondition = new PgDialect().sqlToQuery(withdrawalWhereConditions[0] as never);
  assert.match(resolvedCondition.sql, /status/);
  assert.ok(resolvedCondition.params.includes("open"));

  updateSets = [];
  withdrawalWhereConditions = [];
  requestStaff = { ...assignedStaff, role: "mentor", programIds: [99] };
  const unassignedRequest = await withdraw(56);
  assert.equal(unassignedRequest.status, 404);
  assert.equal(updateSets.length, 0, "no update is attempted without an active matching program assignment");
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
      id: 504,
      businessId: 900,
      programId: 12,
      mentorStaffId: 71,
      status: "resolved",
      decision: "withdrawn",
      approvedAdditionalSessions: null,
      emailNotificationStatus: "delivered",
      createdAt: new Date("2026-10-16T12:00:00.000Z"),
      resolvedAt: new Date("2026-10-17T12:00:00.000Z"),
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
    engagements: { businessId: number; openAdditionalSessionsEmailStatus: string | null; additionalSessionRequests: { id: number; decision: string | null }[] }[];
  };
  assert.equal(dashboard.engagements.length, 1);
  assert.deepEqual(dashboard.engagements[0]?.additionalSessionRequests.map(({ id, decision }) => ({ id, decision })), [
    { id: 501, decision: "approved" },
    { id: 504, decision: "withdrawn" },
  ]);
  assert.equal(dashboard.engagements[0]?.openAdditionalSessionsEmailStatus, null, "the dashboard should allow a replacement request when no open request remains");

  const historyQuery = dashboardHistoryWhereQueries[0];
  assert.ok(historyQuery, "the dashboard should query the mentor's request history");
  assert.match(historyQuery.sql, /mentor_staff_id/);
  assert.match(historyQuery.sql, /program_id/);
  assert.ok(historyQuery.params.includes(71), "request history must be filtered to the signed-in mentor");
  assert.ok(historyQuery.params.includes(12), "request history must stay within the mentor's active program assignments");
  assert.ok(!historyQuery.params.includes(99), "unassigned programs must not be included in request history");
});

test("PostgreSQL lets exactly one concurrent staff review or mentor withdrawal finalize an open request", {
  skip: postgresRaceTestUrl
    ? false
    : "Set TEST_DATABASE_URL to a dedicated PostgreSQL test database to run the row-lock integration test.",
}, async () => {
  const schemaName = `mentor_request_race_${randomUUID().replaceAll("-", "")}`;
  const requestsTable = `"${schemaName}".mentor_session_requests`;
  const staffApplicationName = `${schemaName.slice(0, 18)}_staff`;
  const mentorApplicationName = `${schemaName.slice(0, 18)}_mentor`;
  const staffClient = await postgresPool.connect();
  const mentorClient = await postgresPool.connect();
  let competingAction: Promise<unknown> | undefined;

  async function waitUntilBlocked(applicationName: string) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const { rows } = await postgresPool.query<{ wait_event_type: string | null }>(
        `SELECT wait_event_type
         FROM pg_stat_activity
         WHERE application_name = $1`,
        [applicationName],
      );
      if (rows.some((row) => row.wait_event_type === "Lock")) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`PostgreSQL did not show ${applicationName} waiting on the request row lock.`);
  }

  async function resetRequest() {
    await postgresPool.query(
      `INSERT INTO ${requestsTable} (
        id, program_id, mentor_staff_id, status, decision, approved_additional_sessions
      ) VALUES (56, 12, 71, 'open', NULL, NULL)
      ON CONFLICT (id) DO UPDATE SET
        program_id = EXCLUDED.program_id,
        mentor_staff_id = EXCLUDED.mentor_staff_id,
        status = EXCLUDED.status,
        decision = EXCLUDED.decision,
        approved_additional_sessions = EXCLUDED.approved_additional_sessions,
        resolved_at = NULL,
        resolved_by_staff_id = NULL`,
    );
  }

  async function getFinalState() {
    const { rows } = await postgresPool.query<{
      status: string;
      decision: string | null;
      approved_additional_sessions: number | null;
      resolved_by_staff_id: number | null;
    }>(
      `SELECT status, decision, approved_additional_sessions, resolved_by_staff_id
       FROM ${requestsTable}
       WHERE id = 56`,
    );
    assert.equal(rows.length, 1);
    return rows[0]!;
  }

  try {
    await postgresPool.query(`CREATE SCHEMA "${schemaName}"`);
    await postgresPool.query(
      `CREATE TABLE ${requestsTable} (
        id integer PRIMARY KEY,
        program_id integer NOT NULL,
        mentor_staff_id integer NOT NULL,
        status text NOT NULL CHECK (status IN ('open', 'resolved')),
        decision text,
        approved_additional_sessions integer,
        resolved_at timestamptz,
        resolved_by_staff_id integer,
        CHECK (
          (decision IS NULL AND approved_additional_sessions IS NULL)
          OR (decision = 'approved' AND approved_additional_sessions BETWEEN 1 AND 1000)
          OR (decision IN ('declined', 'withdrawn') AND approved_additional_sessions IS NULL)
        )
      )`,
    );
    await resetRequest();

    for (const winner of ["staff", "mentor"] as const) {
      await resetRequest();
      await staffClient.query("SELECT set_config('application_name', $1, false)", [staffApplicationName]);
      await mentorClient.query("SELECT set_config('application_name', $1, false)", [mentorApplicationName]);
      await staffClient.query("SET statement_timeout = '5000ms'");
      await mentorClient.query("SET statement_timeout = '5000ms'");

      if (winner === "staff") {
        await staffClient.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        const { rows: lockedRequest } = await staffClient.query(
          `SELECT id FROM ${requestsTable}
           WHERE id = 56 AND status = 'open' AND program_id = 12
           FOR UPDATE`,
        );
        assert.equal(lockedRequest.length, 1);

        competingAction = mentorClient.query(
          `UPDATE ${requestsTable}
           SET status = 'resolved', decision = 'withdrawn',
               approved_additional_sessions = NULL, resolved_at = now(),
               resolved_by_staff_id = NULL
           WHERE id = 56 AND mentor_staff_id = 71
             AND status = 'open' AND program_id = 12
           RETURNING id`,
        );
        await waitUntilBlocked(mentorApplicationName);

        const { rowCount: staffChanges } = await staffClient.query(
          `UPDATE ${requestsTable}
           SET status = 'resolved', decision = 'approved',
               approved_additional_sessions = 3, resolved_at = now(),
               resolved_by_staff_id = 71
           WHERE id = 56 AND status = 'open' AND program_id = 12
           RETURNING id`,
        );
        assert.equal(staffChanges, 1, "the staff review should finalize the still-open request");
        await staffClient.query("COMMIT");

        const { rowCount: mentorChanges } = await competingAction as { rowCount: number | null };
        competingAction = undefined;
        assert.equal(mentorChanges, 0, "withdrawal should lose once staff review resolves the request");
        assert.deepEqual(await getFinalState(), {
          status: "resolved",
          decision: "approved",
          approved_additional_sessions: 3,
          resolved_by_staff_id: 71,
        });
      } else {
        await mentorClient.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        const { rowCount: mentorChanges } = await mentorClient.query(
          `UPDATE ${requestsTable}
           SET status = 'resolved', decision = 'withdrawn',
               approved_additional_sessions = NULL, resolved_at = now(),
               resolved_by_staff_id = NULL
           WHERE id = 56 AND mentor_staff_id = 71
             AND status = 'open' AND program_id = 12
           RETURNING id`,
        );
        assert.equal(mentorChanges, 1);

        await staffClient.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        competingAction = staffClient.query(
          `SELECT id FROM ${requestsTable}
           WHERE id = 56 AND status = 'open' AND program_id = 12
           FOR UPDATE`,
        );
        await waitUntilBlocked(staffApplicationName);
        await mentorClient.query("COMMIT");

        const { rows: stillOpen } = await competingAction as { rows: unknown[] };
        competingAction = undefined;
        assert.deepEqual(stillOpen, [], "staff review should not find a request withdrawn while it waited for the row");
        await staffClient.query("COMMIT");
        assert.deepEqual(await getFinalState(), {
          status: "resolved",
          decision: "withdrawn",
          approved_additional_sessions: null,
          resolved_by_staff_id: null,
        });
      }
    }
  } finally {
    await Promise.allSettled([
      staffClient.query("ROLLBACK"),
      mentorClient.query("ROLLBACK"),
    ]);
    if (competingAction) await competingAction.catch(() => undefined);
    staffClient.release();
    mentorClient.release();
    await postgresPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
});
