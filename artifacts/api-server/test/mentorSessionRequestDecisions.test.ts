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
  const { staffMentorMeetingReportsRouter } = await import("../src/routes/mentor");
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => makeProgramScopeQuery(),
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
