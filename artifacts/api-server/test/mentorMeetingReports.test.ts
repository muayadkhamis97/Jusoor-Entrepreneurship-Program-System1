import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { requireRole } from "../src/middlewares/requireRole";

let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreInsert: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;
let selectedRows: unknown[][] = [];
let selectCall = 0;
let inserted: Record<string, unknown> | undefined;
let insertFailure: unknown;
let requestStaff: Record<string, unknown> = {};
let businessRowLocks = 0;

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
    for: (mode) => {
      assert.equal(mode, "update");
      businessRowLocks += 1;
      return query;
    },
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
          returning: async () => {
            if (insertFailure) throw insertFailure;
            return [{
              id: 302,
              ...values,
              submittedAt: new Date("2026-10-19T10:00:00.000Z"),
            }];
          },
      };
    },
  })) as (...args: never[]) => unknown);
  const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: (...args: unknown[]) => (db.select as (...args: never[]) => unknown)(...args as never[]),
      insert: (...args: unknown[]) => (db.insert as (...args: never[]) => unknown)(...args as never[]),
    }),
  });
  restoreTransaction = () => {
    if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
    else Reflect.deleteProperty(db, "transaction");
  };

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
  restoreTransaction?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  requestStaff = { ...mentor };
  selectedRows = [];
  selectCall = 0;
  inserted = undefined;
  insertFailure = undefined;
  businessRowLocks = 0;
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
    [{ id: 8 }],
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
  assert.equal(report.meetingProvider, "manual");
  assert.equal(report.meetingId, null);
  assert.equal(inserted?.calendlyMeetingId, null);
  assert.equal(inserted?.googleCalendarMeetingId, null);
  assert.equal(businessRowLocks, 1);
});

test("links a completed Calendly occurrence to one report", async () => {
  withAllowedEngagement();
  selectedRows = [
    ...selectedRows.slice(0, 2),
    [{ id: 77, startsAt: new Date("2026-10-19T10:00:00.000Z"), timezone: "UTC" }],
    ...selectedRows.slice(2),
  ];
  const response = await postReport(42, { meetingProvider: "calendly", meetingId: 77 });
  assert.equal(response.status, 201);
  const report = await response.json() as Record<string, unknown>;
  assert.equal(report.meetingProvider, "calendly");
  assert.equal(report.meetingId, 77);
  assert.equal(inserted?.calendlyMeetingId, 77);
  assert.equal(inserted?.googleCalendarMeetingId, null);
});

test("returns a conflict when two submissions race to report the same occurrence", async () => {
  withAllowedEngagement();
  selectedRows = [
    ...selectedRows.slice(0, 2),
    [{ id: 77, startsAt: new Date("2026-10-19T10:00:00.000Z"), timezone: "UTC" }],
    ...selectedRows.slice(2),
  ];
  insertFailure = Object.assign(new Error("duplicate report"), { code: "23505" });
  const response = await postReport(42, { meetingProvider: "calendly", meetingId: 77 });
  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /already been submitted/);
});

test("rejects reports for canceled or rescheduled occurrences", async () => {
  withAllowedEngagement();
  selectedRows = [
    ...selectedRows.slice(0, 2),
    [],
    ...selectedRows.slice(2),
  ];
  const response = await postReport(42, { meetingProvider: "calendly", meetingId: 77 });
  assert.equal(response.status, 409);
  assert.equal(inserted, undefined);
});

test("lists ended confirmed meeting occurrences with and without their own report", async () => {
  selectedRows = [
    [{ id: 7 }],
    [{ id: 42, businessId: 8, businessName: "North Star", programId: 7 }],
    [{ clerkUserId: "clerk-coach", displayName: "Coach One" }],
    [{ applicationId: 100, name: "Founder One" }],
    [{
      id: 303,
      calendlyMeetingId: null,
      googleCalendarMeetingId: 202,
      coachName: "Coach One",
      coachEmail: mentor.email,
      businessName: "North Star",
      meetingDate: "2026-10-18",
      attendees: ["Founder One"],
      sessionSummary: "Session topics",
      smartGrowActions: "Next steps",
      achievementsAndOpportunities: "New opportunity",
      teamRecommendations: null,
      submittedAt: new Date("2026-10-18T12:00:00.000Z"),
    }],
    [{
      id: 101,
      eventName: "Coaching check-in",
      startsAt: new Date("2026-10-18T10:00:00.000Z"),
      endsAt: new Date("2026-10-18T11:00:00.000Z"),
      timezone: "Asia/Amman",
    }],
    [{
      id: 202,
      startsAt: new Date("2026-10-17T10:00:00.000Z"),
      endsAt: new Date("2026-10-17T11:00:00.000Z"),
      timezone: "UTC",
    }],
  ];
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/mentor/support/42/meeting-reports`);
  assert.equal(response.status, 200);
  const result = await response.json() as {
    reports: Array<{ meetingProvider: string; meetingId: number | null }>;
    completedMeetings: Array<{ meetingProvider: string; meetingId: number; reportId: number | null }>;
  };
  assert.deepEqual(result.reports.map(({ meetingProvider, meetingId }) => ({ meetingProvider, meetingId })), [
    { meetingProvider: "google_calendar", meetingId: 202 },
  ]);
  assert.deepEqual(result.completedMeetings.map(({ meetingProvider, meetingId, reportId }) => ({
    meetingProvider, meetingId, reportId,
  })), [
    { meetingProvider: "calendly", meetingId: 101, reportId: null },
    { meetingProvider: "google_calendar", meetingId: 202, reportId: 303 },
  ]);
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
