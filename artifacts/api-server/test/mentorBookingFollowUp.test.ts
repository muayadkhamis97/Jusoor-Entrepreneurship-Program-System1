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
  googleCalendarAccountEmail: string | null;
};

let mentor: MentorRecord;
let updateCalls: number;
let selectCalls: number;

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
    googleCalendarAccountEmail: null,
    ...overrides,
  };
  updateCalls = 0;
  selectCalls = 0;
}

function projectedMentor(): Omit<MentorRecord, "role"> {
  const { role: _role, ...projected } = mentor;
  return { ...projected };
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
    const query = {
      from() {
        return this;
      },
      innerJoin() {
        return this;
      },
      where() {
        return this;
      },
      limit: async () => mentor.role === "mentor" ? [{ ...projectedMentor(), role: mentor.role }] : [],
      orderBy: async () => mentor.role === "mentor" ? [projectedMentor()] : [],
      then(resolve: (rows: Array<{ staffId: number }>) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(mentor.role === "mentor" ? [{ staffId: mentor.staffId }] : [])
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
    res.locals.staff = {
      id: Number(req.header("x-staff-id") ?? 1),
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
  assert.deepEqual(await update.json(), {
    staffId: 41,
    email: "mentor@example.com",
    status: "active",
    bookingProvider: "calendly",
    calendlyConnected: false,
    googleCalendarConnected: false,
    calendlyFollowUpDate: "2026-11-04",
    calendlyFollowUpNote: "Discuss onboarding",
  });

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
  }]);
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

test("denies follow-up updates from non-coordinator accounts before accessing records", async () => {
  resetMentor();
  const response = await updateFollowUp(mentor.staffId, "2026-11-04", "Unauthorized", "staff");
  assert.equal(response.status, 403);
  assert.equal(selectCalls, 0);
  assert.equal(updateCalls, 0);
});
