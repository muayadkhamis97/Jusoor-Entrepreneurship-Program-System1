import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { requireRole } from "../src/middlewares/requireRole";

let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreInsert: (() => void) | undefined;
let selectedRows: unknown[][] = [];
let selectCall = 0;
let inserted: Record<string, unknown> | undefined;
let requestStaff: Record<string, unknown> = {};

const mentor = {
  id: 71,
  email: "coach@example.test",
  role: "mentor",
  status: "active",
  programIds: [7],
};

function makeQuery(rows: unknown[]) {
  const query: Record<string, (...args: unknown[]) => unknown> = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: (limit) => Promise.resolve(rows.slice(0, Number(limit))),
  };
  query.then = (resolve, reject) => Promise.resolve(rows).then(resolve as never, reject as never);
  return query;
}

function replaceDbMethod(key: "select" | "insert", replacement: (...args: never[]) => unknown) {
  const original = Object.getOwnPropertyDescriptor(db, key);
  Object.defineProperty(db, key, { configurable: true, writable: true, value: replacement });
  return () => {
    if (original) Object.defineProperty(db, key, original);
    else Reflect.deleteProperty(db, key);
  };
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  const { default: mentorRouter } = await import("../src/routes/mentor");
  restoreSelect = replaceDbMethod("select", (() => {
    const rows = selectedRows[selectCall] ?? [];
    selectCall += 1;
    return makeQuery(rows);
  }) as (...args: never[]) => unknown);
  restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      inserted = values;
      return {
        returning: async () => [{
          id: 302,
          ...values,
          submittedAt: new Date("2026-10-19T10:00:00.000Z"),
        }],
      };
    },
  })) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.staff = requestStaff;
    next();
  });
  app.use("/api/mentor", requireRole("mentor"), mentorRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect?.();
  restoreInsert?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  requestStaff = { ...mentor };
  selectedRows = [];
  selectCall = 0;
  inserted = undefined;
});

async function postReport(supportId = 42, payload: Record<string, unknown> = {}) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return fetch(`http://127.0.0.1:${address.port}/api/mentor/support/${supportId}/meeting-reports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      meetingDate: "2026-10-19",
      attendeeApplicationIds: [100],
      sessionSummary: "Topics and coaching highlights",
      smartGrowActions: "Agree on two customer interviews",
      achievementsAndOpportunities: "The team identified a new sales channel.",
      teamRecommendations: null,
      ...payload,
    }),
  });
}

function withAllowedEngagement(roster: unknown[] = [{ applicationId: 100, name: "Founder One" }]) {
  selectCall = 0;
  selectedRows = [
    [{ id: 7 }],
    [{ id: 42, businessId: 8, businessName: "North Star", programId: 7 }],
    roster,
    [{ clerkUserId: "clerk-coach", displayName: "Coach One" }],
  ];
}

test("submits a report with server-derived coach and business details and accepted attendees", async () => {
  withAllowedEngagement();
  const response = await postReport(42, {
    coachName: "Spoofed",
    coachEmail: "attacker@example.test",
    businessName: "Different business",
  });
  assert.equal(response.status, 201);
  const report = await response.json() as Record<string, unknown>;
  assert.equal(report.coachName, "Coach One");
  assert.equal(report.coachEmail, mentor.email);
  assert.equal(report.businessName, "North Star");
  assert.deepEqual(report.attendees, ["Founder One"]);
  assert.equal(inserted?.coachName, "Coach One");
  assert.equal(inserted?.businessName, "North Star");
  assert.equal(inserted?.sessionSummary, "Topics and coaching highlights");
});

test("rejects attendees who are not on the accepted business roster", async () => {
  withAllowedEngagement();
  const response = await postReport(42, { attendeeApplicationIds: [999] });
  assert.equal(response.status, 400);
  assert.equal(inserted, undefined);
});

test("does not allow a mentor to submit reports for another mentor's engagement", async () => {
  selectedRows = [[{ id: 7 }], []];
  const response = await postReport();
  assert.equal(response.status, 404);
  assert.equal(inserted, undefined);
});

test("rejects invalid calendar dates and whitespace-only required answers", async () => {
  withAllowedEngagement();
  const invalidDate = await postReport(42, { meetingDate: "2026-02-31" });
  assert.equal(invalidDate.status, 400);
  assert.equal(inserted, undefined);

  withAllowedEngagement();
  const emptyAnswer = await postReport(42, { smartGrowActions: "   " });
  assert.equal(emptyAnswer.status, 400);
  assert.equal(inserted, undefined);
});
