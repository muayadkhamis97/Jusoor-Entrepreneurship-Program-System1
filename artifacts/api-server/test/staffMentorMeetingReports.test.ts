import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import { requireOperationsStaff } from "../src/middlewares/staffAccess";

let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreSelectDistinct: (() => void) | undefined;
let selectedRows: unknown[][] = [];
let selectedDistinctRows: unknown[][] = [];
let selectCalls = 0;
let selectDistinctCalls = 0;
let requestStaff: Record<string, unknown> = {};
let whereConditions: unknown[] = [];

const assignedStaff = {
  id: 71,
  email: "staff@example.test",
  role: "staff",
  status: "active",
  programIds: [12],
};

function makeQuery(rows: unknown[]) {
  const query: Record<string, (...args: unknown[]) => unknown> = {
    from: () => query,
    innerJoin: () => query,
    where: (condition) => {
      whereConditions.push(condition);
      return query;
    },
    orderBy: () => query,
  };
  query.then = (resolve, reject) => Promise.resolve(rows).then(resolve as never, reject as never);
  return query;
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const database = await import("@workspace/db");
  db = database.db;
  const { staffMentorMeetingReportsRouter } = await import("../src/routes/mentor");
  const original = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      const rows = selectedRows[selectCalls] ?? [];
      selectCalls += 1;
      return makeQuery(rows);
    },
  });
  restoreSelect = () => {
    if (original) Object.defineProperty(db, "select", original);
    else Reflect.deleteProperty(db, "select");
  };
  const originalDistinct = Object.getOwnPropertyDescriptor(db, "selectDistinct");
  Object.defineProperty(db, "selectDistinct", {
    configurable: true,
    writable: true,
    value: () => {
      const rows = selectedDistinctRows[selectDistinctCalls] ?? [];
      selectDistinctCalls += 1;
      return makeQuery(rows);
    },
  });
  restoreSelectDistinct = () => {
    if (originalDistinct) Object.defineProperty(db, "selectDistinct", originalDistinct);
    else Reflect.deleteProperty(db, "selectDistinct");
  };

  const app = express();
  app.use((_req, res, next) => {
    res.locals.staff = requestStaff;
    next();
  });
  app.use("/api/staff", requireOperationsStaff, staffMentorMeetingReportsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect?.();
  restoreSelectDistinct?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  requestStaff = { ...assignedStaff };
  selectedRows = [[{ id: 12 }, { id: 23 }]];
  selectedDistinctRows = [[]];
  selectCalls = 0;
  selectDistinctCalls = 0;
  whereConditions = [];
});

async function getReports(programId: number, businessId?: number, filters: Record<string, string> = {}) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const query = new URLSearchParams({ programId: String(programId) });
  if (businessId !== undefined) query.set("businessId", String(businessId));
  for (const [key, value] of Object.entries(filters)) query.set(key, value);
  return fetch(`http://127.0.0.1:${address.port}/api/staff/mentor-meeting-reports?${query}`);
}

async function getCoachChoices(programId: number, businessId?: number) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const query = new URLSearchParams({ programId: String(programId) });
  if (businessId !== undefined) query.set("businessId", String(businessId));
  return fetch(`http://127.0.0.1:${address.port}/api/staff/mentor-meeting-report-coaches?${query}`);
}

test("program staff can review reports with historical coach, business and attendee snapshots", async () => {
  selectedRows = [
    [{ id: 12 }, { id: 23 }],
    [{
      id: 303,
      calendlyMeetingId: null,
      googleCalendarMeetingId: 202,
      coachName: "Coach Snapshot",
      coachEmail: "coach@example.test",
      businessName: "Business Snapshot",
      meetingDate: "2026-10-18",
      attendees: ["Attendee Snapshot"],
      sessionSummary: "Session topics and highlights",
      smartGrowActions: "Complete two customer interviews",
      achievementsAndOpportunities: "New partnership opportunity",
      teamRecommendations: "Offer an export workshop",
      submittedAt: new Date("2026-10-18T12:00:00.000Z"),
      programId: 12,
      programName: "Program Twelve",
      businessId: 120,
    }],
  ];
  const response = await getReports(12, 120);
  assert.equal(response.status, 200);
  const [report] = await response.json() as Array<Record<string, unknown>>;
  assert.equal(report.coachName, "Coach Snapshot");
  assert.equal(report.coachEmail, "coach@example.test");
  assert.equal(report.businessName, "Business Snapshot");
  assert.deepEqual(report.attendees, ["Attendee Snapshot"]);
  assert.equal(report.programName, "Program Twelve");
  assert.equal(report.meetingProvider, "google_calendar");
  assert.equal(report.meetingId, 202);
});

test("staff report filters include coach and inclusive meeting-date bounds in the scoped query", async () => {
  selectedRows = [[{ id: 12 }, { id: 23 }], []];
  const response = await getReports(12, 120, {
    coachEmail: "coach@example.test",
    meetingDateFrom: "2026-10-01",
    meetingDateTo: "2026-10-31",
  });
  assert.equal(response.status, 200);
  assert.equal(selectCalls, 2);
  const reportQuery = new PgDialect().sqlToQuery(whereConditions.at(-1) as never);
  assert.ok(reportQuery.params.includes("coach@example.test"));
  assert.ok(reportQuery.params.includes("2026-10-01"));
  assert.ok(reportQuery.params.includes("2026-10-31"));
  assert.ok(reportQuery.sql.includes("jusoor_mentor_meeting_reports"));
});

test("staff report filters reject invalid and reversed date ranges before loading reports", async () => {
  const invalidDate = await getReports(12, undefined, { meetingDateFrom: "2026-02-30" });
  assert.equal(invalidDate.status, 400);
  assert.equal(selectCalls, 1, "invalid date filters must stop before querying report records");

  selectCalls = 0;
  whereConditions = [];
  const reversedRange = await getReports(12, undefined, {
    meetingDateFrom: "2026-10-20",
    meetingDateTo: "2026-10-10",
  });
  assert.equal(reversedRange.status, 400);
  assert.equal(selectCalls, 1, "reversed date filters must stop before querying report records");
});

test("coach choices are distinct and limited to the viewer's authorized program", async () => {
  selectedRows = [[{ id: 12 }, { id: 23 }]];
  selectedDistinctRows = [[
    { coachName: "Coach One", coachEmail: "one@example.test" },
    { coachName: "Coach Two", coachEmail: "two@example.test" },
  ]];
  const response = await getCoachChoices(12, 120);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), selectedDistinctRows[0]);
  assert.equal(selectCalls, 1, "only the viewer's active program scope should be loaded");
  assert.equal(selectDistinctCalls, 1);

  selectCalls = 0;
  selectDistinctCalls = 0;
  const denied = await getCoachChoices(23);
  assert.equal(denied.status, 404);
  assert.equal(selectCalls, 1);
  assert.equal(selectDistinctCalls, 0, "coach choices must not be queried after program scope denial");
});

test("program staff cannot query reports from a program outside their assignment", async () => {
  const response = await getReports(23);
  assert.equal(response.status, 404);
  assert.equal(selectCalls, 1, "report records must not be queried after program scope denial");
});

test("specialist accounts cannot use the program-staff report view", async () => {
  requestStaff = { ...assignedStaff, role: "mentor" };
  const response = await getReports(12);
  assert.equal(response.status, 403);
  assert.equal(selectCalls, 0);
});
