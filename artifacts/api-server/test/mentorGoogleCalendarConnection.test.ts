import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { isGoogleCalendarBookingUrl } from "../src/lib/googleCalendarBookingUrl";
import { requireRole } from "../src/middlewares/requireRole";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreUpdate: (() => void) | undefined;
let updateValues: Record<string, unknown> = {};
let returnUpdatedMentor = true;
let updateCondition: SQL | undefined;
let updateCalls = 0;
const connectedMentor = {
  id: 71,
  role: "mentor",
  status: "active",
  calendlyBookingUrl: "https://calendly.com/mentor",
  googleCalendarAccountEmail: "mentor@example.test",
};
let requestStaff: typeof connectedMentor | undefined = { ...connectedMentor };

beforeEach(() => {
  requestStaff = { ...connectedMentor };
  updateValues = {};
  updateCondition = undefined;
  updateCalls = 0;
  returnUpdatedMentor = true;
});

function replaceDbUpdate(replacement: (...args: never[]) => unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(db, "update");
  Object.defineProperty(db, "update", {
    configurable: true,
    writable: true,
    value: replacement,
  });
  return () => {
    if (original) Object.defineProperty(db, "update", original);
    else Reflect.deleteProperty(db, "update");
  };
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  const { default: mentorRouter } = await import("../src/routes/mentor");
  restoreUpdate = replaceDbUpdate((() => {
    updateCalls += 1;
    const query = {
      set(values: Record<string, unknown>) {
        updateValues = values;
        return this;
      },
      where(condition: SQL) {
        updateCondition = condition;
        return this;
      },
      returning: async () => returnUpdatedMentor ? [{
        bookingProvider: "calendly",
        calendlyBookingUrl: "https://calendly.com/mentor",
        googleCalendarBookingUrl: null,
        googleCalendarAccountEmail: requestStaff?.googleCalendarAccountEmail ?? null,
        ...updateValues,
      }] : [],
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    if (!requestStaff) {
      res.status(401).json({ error: "Sign in with an approved staff account." });
      return;
    }
    res.locals.staff = requestStaff;
    next();
  });
  app.use("/api/mentor", requireRole("mentor"), mentorRouter);
  globalThis.fetch = (async () => {
    throw new Error("Provider calls are not allowed in these tests.");
  }) as typeof fetch;
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreUpdate?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function disconnect(): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/mentor/google-calendar/connection`, {
    method: "DELETE",
  });
}

async function saveBookingSettings(data: unknown): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/mentor/booking-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

const validScheduleUrls = [
  "https://calendar.app.google/ExampleSchedule123",
  "https://calendar.app.google/ExampleSchedule123?g_st=ac",
  "https://calendar.google.com/calendar/appointments/schedules/ExampleSchedule123",
  "https://calendar.google.com/calendar/u/0/appointments/schedules/ExampleSchedule123",
  "https://calendar.google.com/appointments/schedules/Example-Schedule_123?gv=true",
];

for (const url of validScheduleUrls) {
  test(`saves Google Calendar booking settings for the authenticated mentor: ${url}`, async () => {
    assert.equal(isGoogleCalendarBookingUrl(url), true);
    const response = await saveBookingSettings({
      bookingProvider: "google_calendar",
      googleCalendarBookingUrl: url,
      staffId: 999,
      googleCalendarRefreshTokenEncrypted: "must-not-be-written",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      bookingProvider: "google_calendar",
      calendlyBookingUrl: connectedMentor.calendlyBookingUrl,
      googleCalendarBookingUrl: url,
      googleCalendarConnected: true,
    });
    // Only booking preferences are updated, never OAuth credentials or identity.
    assert.deepEqual(updateValues, {
      bookingProvider: "google_calendar",
      googleCalendarBookingUrl: url,
    });
    assert.equal(updateCalls, 1);
    assert.ok(updateCondition);
    const filter = new PgDialect().sqlToQuery(updateCondition);
    assert.deepEqual(filter.params, [71, "mentor", "active"]);
    assert.match(filter.sql, /"id" = \$1/);
    assert.match(filter.sql, /"role" = \$2/);
    assert.match(filter.sql, /"status" = \$3/);
  });
}

test("rejects malformed or untrusted schedule URLs before updating any mentor", async () => {
  for (const url of [
    "not a URL",
    "http://calendar.app.google/ExampleSchedule123",
    "javascript:alert(1)",
    "https://calendar.app.google.evil.test/ExampleSchedule123",
    "https://calendar.app.google@evil.test/ExampleSchedule123",
    "https://user:password@calendar.app.google/ExampleSchedule123",
    "https://calendar.app.google:8443/ExampleSchedule123",
    "https://calendar.app.google/",
    "https://calendar.app.google/redirect/ExampleSchedule123",
    "https://calendar.google.com/calendar/appointments/schedules/",
    "https://calendar.google.com/calendar/u/0/r",
    "https://evil.test/appointments/schedules/ExampleSchedule123",
  ]) {
    assert.equal(isGoogleCalendarBookingUrl(url), false, url);
    const response = await saveBookingSettings({
      bookingProvider: "google_calendar",
      googleCalendarBookingUrl: url,
    });
    assert.equal(response.status, 400, url);
  }
  assert.equal(updateCalls, 0);
});

test("requires a connected Google account and a schedule link", async () => {
  requestStaff = { ...connectedMentor, googleCalendarAccountEmail: "" };
  const disconnected = await saveBookingSettings({
    bookingProvider: "google_calendar",
    googleCalendarBookingUrl: validScheduleUrls[0],
  });
  assert.equal(disconnected.status, 400);
  assert.match((await disconnected.json()).error, /Connect Google Calendar/);
  requestStaff = { ...connectedMentor };
  const missingUrl = await saveBookingSettings({
    bookingProvider: "google_calendar",
    googleCalendarBookingUrl: null,
  });
  assert.equal(missingUrl.status, 400);
  assert.match((await missingUrl.json()).error, /appointment-schedule link/);
  assert.equal(updateCalls, 0);
});

test("rejects invalid booking input without writing preferences", async () => {
  for (const data of [
    { bookingProvider: "other", googleCalendarBookingUrl: validScheduleUrls[0] },
    { bookingProvider: "google_calendar", googleCalendarBookingUrl: 42 },
    { bookingProvider: "google_calendar" },
  ]) {
    const response = await saveBookingSettings(data);
    assert.equal(response.status, 400);
  }
  assert.equal(updateCalls, 0);
});

test("rejects unauthenticated, non-mentor, and inactive accounts", async () => {
  for (const staff of [
    undefined,
    { ...connectedMentor, role: "staff" },
    { ...connectedMentor, status: "invited" },
  ]) {
    requestStaff = staff;
    const response = await saveBookingSettings({
      bookingProvider: "google_calendar",
      googleCalendarBookingUrl: validScheduleUrls[0],
    });
    assert.equal(response.status, staff ? 403 : 401);
  }
  assert.equal(updateCalls, 0);
});

test("returns 403 if the active mentor no longer exists when saving", async () => {
  returnUpdatedMentor = false;
  const response = await saveBookingSettings({
    bookingProvider: "google_calendar",
    googleCalendarBookingUrl: validScheduleUrls[0],
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Active mentor access is required." });
});

test("disconnect clears Google credentials and schedule link, then uses Calendly", async () => {
  updateValues = {};
  returnUpdatedMentor = true;

  const response = await disconnect();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    bookingProvider: "calendly",
    calendlyBookingUrl: "https://calendly.com/mentor",
    googleCalendarBookingUrl: null,
    googleCalendarConnected: false,
  });
  assert.deepEqual(updateValues, {
    bookingProvider: "calendly",
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    googleCalendarRefreshTokenEncrypted: null,
    googleCalendarAccessTokenEncrypted: null,
    googleCalendarAccessTokenExpiresAt: null,
    googleCalendarSyncToken: null,
  });
  assert.equal("googleCalendarAccountEmail" in updateValues, true);
});

test("returns an access error when the mentor record is no longer active", async () => {
  returnUpdatedMentor = false;
  const response = await disconnect();
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Active mentor access is required." });
  returnUpdatedMentor = true;
});
