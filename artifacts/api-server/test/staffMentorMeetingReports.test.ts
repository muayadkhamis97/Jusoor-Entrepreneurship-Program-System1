import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { requireOperationsStaff } from "../src/middlewares/staffAccess";

let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let selectedRows: unknown[][] = [];
let selectCalls = 0;
let requestStaff: Record<string, unknown> = {};

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
    where: () => query,
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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  requestStaff = { ...assignedStaff };
  selectedRows = [[{ id: 12 }, { id: 23 }]];
  selectCalls = 0;
});

async function getReports(programId: number, businessId?: number) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const query = new URLSearchParams({ programId: String(programId) });
  if (businessId !== undefined) query.set("businessId", String(businessId));
  return fetch(`http://127.0.0.1:${address.port}/api/staff/mentor-meeting-reports?${query}`);
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
