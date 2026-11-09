import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;

type MentorRecord = {
  staffId: number;
  email: string;
  role: "mentor" | "staff";
  status: "invited" | "active";
  bookingProvider: "calendly" | "google_calendar";
  calendlyBookingUrl: string | null;
  calendlyFollowUpDate: string | null;
  calendlyFollowUpNote: string | null;
  calendlyFollowUpUpdatedByStaffId: number | null;
  calendlyFollowUpUpdatedAt: Date | null;
  googleCalendarAccountEmail: string | null;
  googleCalendarSyncLastSuccessAt: Date | null;
  googleCalendarSyncLastFailureAt: Date | null;
  googleCalendarSyncConsecutiveFailures: number;
  googleCalendarSyncNeedsReauthorization: boolean;
};

let mentor: MentorRecord;
let updateCalls: number;
let selectCalls: number;
let requestSelectCalls: number;

function resetMentor(overrides: Partial<MentorRecord> = {}): void {
  mentor = {
    staffId: 41,
    email: "mentor@example.com",
    role: "mentor",
    status: "active",
    bookingProvider: "calendly",
    calendlyBookingUrl: null,
    calendlyFollowUpDate: null,
    calendlyFollowUpNote: null,
    calendlyFollowUpUpdatedByStaffId: null,
    calendlyFollowUpUpdatedAt: null,
    googleCalendarAccountEmail: null,
    googleCalendarSyncLastSuccessAt: null,
    googleCalendarSyncLastFailureAt: null,
    googleCalendarSyncConsecutiveFailures: 0,
    googleCalendarSyncNeedsReauthorization: false,
    ...overrides,
  };
  updateCalls = 0;
  selectCalls = 0;
  requestSelectCalls = 0;
}

function projectedMentor(): Omit<MentorRecord, "role"> & { calendlyFollowUpUpdatedByEmail: string | null } {
  const { role: _role, ...projected } = mentor;
  return {
    ...projected,
    calendlyFollowUpUpdatedByEmail: mentor.calendlyFollowUpUpdatedByStaffId === null
      ? null
      : `coordinator-${mentor.calendlyFollowUpUpdatedByStaffId}@example.com`,
  };
}

function replaceDbMethod(
  name: "select" | "update",
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

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  const { default: router } = await import("../src/routes/staff");
  resetMentor();

  restoreSelect = replaceDbMethod("select", (() => {
    selectCalls += 1;
    const call = ++requestSelectCalls;
    const query = {
      from() {
        return this;
      },
      innerJoin() {
        return this;
      },
      leftJoin() {
        return this;
      },
      where() {
        return this;
      },
      limit: async () => mentor.role === "mentor" ? [{ ...projectedMentor(), role: mentor.role }] : [],
      orderBy: async () => mentor.role === "mentor" ? [projectedMentor()] : [],
      then(resolve: (rows: Array<Record<string, unknown>>) => unknown, reject?: (error: unknown) => unknown) {
        const rows = call === 1 && mentor.role === "mentor"
          ? [{ staffId: mentor.staffId }]
          : call === 2 && mentor.role === "mentor"
            ? [{ staffId: mentor.staffId, programId: 9, programName: "Spring cohort" }]
            : [];
        return Promise.resolve(rows)
          .then(resolve, reject);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  restoreUpdate = replaceDbMethod("update", (() => {
    updateCalls += 1;
    const query = {
      set(values: Partial<MentorRecord>) {
        if (mentor.role === "mentor" && mentor.calendlyBookingUrl === null) {
          Object.assign(mentor, values);
        }
        return this;
      },
      where() {
        return this;
      },
      returning: async () => (
        mentor.role === "mentor" && mentor.calendlyBookingUrl === null
          ? [projectedMentor()]
          : []
      ),
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    requestSelectCalls = 0;
    const id = Number(req.header("x-staff-id") ?? 1);
    res.locals.staff = {
      id,
      email: `coordinator-${id}@example.com`,
      role: req.header("x-staff-role") ?? "coordinator",
    };
    next();
  });
  app.use("/api", router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreUpdate?.();
  restoreSelect?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path: string, init?: RequestInit): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, init);
}

async function updateFollowUp(
  id: number,
  calendlyFollowUpDate: string | null,
  calendlyFollowUpNote: string | null,
  role = "coordinator",
  coordinatorId = 1,
): Promise<Response> {
  return request(`/api/staff/${id}/mentor-booking-follow-up`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-staff-role": role,
      "x-staff-id": String(coordinatorId),
    },
    body: JSON.stringify({ calendlyFollowUpDate, calendlyFollowUpNote }),
  });
}

test("persists follow-up details and returns them from a fresh mentor status request", async () => {
  resetMentor();

  const update = await updateFollowUp(mentor.staffId, "2026-11-04", "Discuss onboarding");
  assert.equal(update.status, 200);
  const updateResult = await update.json() as Record<string, unknown>;
  assert.deepEqual({ ...updateResult, calendlyFollowUpUpdatedAt: "timestamp" }, {
    staffId: 41,
    email: "mentor@example.com",
    status: "active",
    bookingProvider: "calendly",
    calendlyConnected: false,
    googleCalendarConnected: false,
    calendlyFollowUpDate: "2026-11-04",
    calendlyFollowUpNote: "Discuss onboarding",
    calendlyFollowUpUpdatedByEmail: "coordinator-1@example.com",
    calendlyFollowUpUpdatedAt: "timestamp",
    googleCalendarSyncLastSuccessAt: null,
    googleCalendarSyncLastFailureAt: null,
    googleCalendarSyncConsecutiveFailures: 0,
    googleCalendarSyncNeedsReauthorization: false,
  });
  assert.ok(Number.isFinite(Date.parse(String(updateResult.calendlyFollowUpUpdatedAt))));

  const freshStatus = await request("/api/staff/mentor-booking-status", {
    headers: { "x-staff-role": "coordinator", "x-staff-id": "2" },
  });
  assert.equal(freshStatus.status, 200);
  assert.deepEqual(await freshStatus.json(), [{
    staffId: 41,
    email: "mentor@example.com",
    status: "active",
    bookingProvider: "calendly",
    calendlyConnected: false,
    googleCalendarConnected: false,
    calendlyFollowUpDate: "2026-11-04",
    calendlyFollowUpNote: "Discuss onboarding",
    calendlyFollowUpUpdatedByEmail: "coordinator-1@example.com",
    calendlyFollowUpUpdatedAt: updateResult.calendlyFollowUpUpdatedAt,
    googleCalendarSyncLastSuccessAt: null,
    googleCalendarSyncLastFailureAt: null,
    googleCalendarSyncConsecutiveFailures: 0,
    googleCalendarSyncNeedsReauthorization: false,
    programs: [{ programId: 9, programName: "Spring cohort" }],
  }]);

  const secondUpdate = await updateFollowUp(mentor.staffId, "2026-11-05", "Revised follow-up", "coordinator", 2);
  assert.equal(secondUpdate.status, 200);
  const secondUpdateResult = await secondUpdate.json() as {
    calendlyFollowUpUpdatedByEmail: string;
    calendlyFollowUpUpdatedAt: string;
  };
  assert.equal(secondUpdateResult.calendlyFollowUpUpdatedByEmail, "coordinator-2@example.com");
  assert.ok(Date.parse(secondUpdateResult.calendlyFollowUpUpdatedAt) >= Date.parse(String(updateResult.calendlyFollowUpUpdatedAt)));
});

test("clears both follow-up fields", async () => {
  resetMentor({
    calendlyFollowUpDate: "2026-11-04",
    calendlyFollowUpNote: "Discuss onboarding",
  });

  const update = await updateFollowUp(mentor.staffId, null, null);
  assert.equal(update.status, 200);
  const freshStatus = await request("/api/staff/mentor-booking-status");
  assert.equal(freshStatus.status, 200);
  const [result] = await freshStatus.json() as Array<{
    calendlyFollowUpDate: string | null;
    calendlyFollowUpNote: string | null;
  }>;
  assert.equal(result?.calendlyFollowUpDate, null);
  assert.equal(result?.calendlyFollowUpNote, null);
  assert.equal(result?.calendlyFollowUpUpdatedByEmail, "coordinator-1@example.com");
  assert.ok(result?.calendlyFollowUpUpdatedAt);
});

test("rejects impossible calendar dates without changing saved follow-up details", async () => {
  resetMentor({
    calendlyFollowUpDate: "2026-11-04",
    calendlyFollowUpNote: "Existing note",
  });

  const response = await updateFollowUp(mentor.staffId, "2026-02-30", "Replacement note");
  assert.equal(response.status, 400);
  assert.equal(updateCalls, 0);
  assert.equal(mentor.calendlyFollowUpDate, "2026-11-04");
  assert.equal(mentor.calendlyFollowUpNote, "Existing note");
});

test("refuses updates for Calendly-connected mentors and non-mentor accounts", async () => {
  resetMentor({ calendlyBookingUrl: "https://calendly.com/mentor" });
  const connectedResponse = await updateFollowUp(mentor.staffId, "2026-11-04", "Do not overwrite");
  assert.equal(connectedResponse.status, 400);
  assert.equal(updateCalls, 0);

  resetMentor({ role: "staff" });
  const nonMentorResponse = await updateFollowUp(mentor.staffId, "2026-11-04", "Wrong account");
  assert.equal(nonMentorResponse.status, 404);
  assert.equal(updateCalls, 0);
});

test("Google-connected mentors need no follow-up even without Calendly or a schedule URL", async () => {
  resetMentor({
    bookingProvider: "google_calendar",
    googleCalendarAccountEmail: "private-google@example.test",
    calendlyFollowUpDate: "2026-10-01",
    calendlyFollowUpNote: "Old follow-up retained",
  });
  const response = await updateFollowUp(mentor.staffId, "2026-11-04", "Do not overwrite");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /booking account is connected/);
  assert.equal(updateCalls, 0);
  assert.equal(mentor.calendlyFollowUpNote, "Old follow-up retained");

  const status = await request("/api/staff/mentor-booking-status", {
    headers: { "x-staff-role": "coordinator", "x-staff-id": "2" },
  });
  assert.equal(status.status, 200);
  const [result] = await status.json();
  assert.equal(result.googleCalendarConnected, true);
  assert.equal(result.calendlyConnected, false);
  assert.equal("googleCalendarAccountEmail" in result, false);
  assert.equal(result.calendlyFollowUpNote, "Old follow-up retained");
});

test("coordinator status exposes safe repeated-failure and reconnect guidance within program scope", async () => {
  resetMentor({
    bookingProvider: "google_calendar",
    googleCalendarAccountEmail: "private-google@example.test",
    googleCalendarSyncLastSuccessAt: new Date("2026-11-08T10:00:00.000Z"),
    googleCalendarSyncLastFailureAt: new Date("2026-11-09T10:00:00.000Z"),
    googleCalendarSyncConsecutiveFailures: 4,
    googleCalendarSyncNeedsReauthorization: true,
  });

  const response = await request("/api/staff/mentor-booking-status");
  assert.equal(response.status, 200);
  const [result] = await response.json();
  assert.equal(result.googleCalendarSyncConsecutiveFailures, 4);
  assert.equal(result.googleCalendarSyncNeedsReauthorization, true);
  assert.equal(result.googleCalendarSyncLastSuccessAt, "2026-11-08T10:00:00.000Z");
  assert.equal(result.googleCalendarSyncLastFailureAt, "2026-11-09T10:00:00.000Z");
  assert.deepEqual(result.programs, [{ programId: 9, programName: "Spring cohort" }]);
  assert.equal("googleCalendarAccountEmail" in result, false);
  assert.equal("googleCalendarRefreshTokenEncrypted" in result, false);
  assert.equal("providerError" in result, false);
});

test("denies follow-up updates from non-coordinator accounts before accessing records", async () => {
  resetMentor();
  const response = await updateFollowUp(mentor.staffId, "2026-11-04", "Unauthorized", "staff");
  assert.equal(response.status, 403);
  assert.equal(selectCalls, 0);
  assert.equal(updateCalls, 0);
});

test("does not expose booking-status attribution to non-coordinator accounts", async () => {
  resetMentor({
    calendlyFollowUpDate: "2026-11-04",
    calendlyFollowUpNote: "Private coordinator follow-up",
    calendlyFollowUpUpdatedByStaffId: 1,
    calendlyFollowUpUpdatedAt: new Date("2026-10-15T12:00:00.000Z"),
  });
  const response = await request("/api/staff/mentor-booking-status", {
    headers: { "x-staff-role": "staff", "x-staff-id": "3" },
  });
  assert.equal(response.status, 403);
  assert.equal(selectCalls, 0);
});
