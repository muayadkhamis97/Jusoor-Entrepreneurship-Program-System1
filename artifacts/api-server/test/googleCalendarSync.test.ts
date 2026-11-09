import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchCalendarPage,
  GoogleCalendarSyncError,
  encryptGoogleCalendarToken,
  findGoogleCalendarBusinessMatch,
  googleCalendarPrivacy,
  recordGoogleCalendarSyncFailureStatus,
  recordGoogleCalendarSyncSuccessStatus,
  refreshGoogleAccessToken,
} from "../src/lib/googleCalendarSync";

const assignedBusinesses = [
  { id: 31, email: "founder@example.com" },
  { id: 42, email: "other@example.com" },
];

function mockImmediateGoogleCalendarTimeout(): {
  getTimeoutMs: () => number | null;
  restore: () => void;
} {
  const originalTimeout = AbortSignal.timeout;
  let timeoutMs: number | null = null;
  AbortSignal.timeout = ((milliseconds: number) => {
    timeoutMs = milliseconds;
    const controller = new AbortController();
    controller.abort(new DOMException("private provider response data", "TimeoutError"));
    return controller.signal;
  }) as typeof AbortSignal.timeout;
  return {
    getTimeoutMs: () => timeoutMs,
    restore: () => { AbortSignal.timeout = originalTimeout; },
  };
}

function mockStalledBodyGoogleCalendarTimeout(): {
  getTimeoutMs: () => number | null;
  restore: () => void;
} {
  const originalTimeout = AbortSignal.timeout;
  let timeoutMs: number | null = null;
  AbortSignal.timeout = ((milliseconds: number) => {
    timeoutMs = milliseconds;
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new DOMException("private provider response details", "TimeoutError"));
    }, 0);
    return controller.signal;
  }) as typeof AbortSignal.timeout;
  return {
    getTimeoutMs: () => timeoutMs,
    restore: () => { AbortSignal.timeout = originalTimeout; },
  };
}

function createStalledResponse(signal: AbortSignal | undefined): Response {
  return {
    ok: true,
    status: 200,
    json: () => new Promise((_resolve, reject) => {
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  } as Response;
}

test("matches a calendar event only to a unique assigned founder hosted by the linked mentor", () => {
  const event = {
    organizer: { email: "mentor@example.com" },
    attendees: [{ email: "founder@example.com" }, { email: "mentor@example.com" }],
  };
  assert.equal(
    findGoogleCalendarBusinessMatch(event, "Mentor@example.com", assignedBusinesses),
    31,
  );
  assert.equal(
    findGoogleCalendarBusinessMatch(
      { ...event, attendees: [...event.attendees, { email: "unknown@example.com" }] },
      "mentor@example.com",
      assignedBusinesses,
    ),
    31,
  );
  assert.equal(findGoogleCalendarBusinessMatch(event, "different@example.com", assignedBusinesses), null);
});

test("does not match unassigned or ambiguous founder email addresses", () => {
  assert.equal(
    findGoogleCalendarBusinessMatch({
      organizer: { email: "mentor@example.com" },
      attendees: [{ email: "unassigned@example.com" }],
    }, "mentor@example.com", assignedBusinesses),
    null,
  );
  assert.equal(
    findGoogleCalendarBusinessMatch({
      organizer: { email: "mentor@example.com" },
      attendees: [{ email: "shared@example.com" }],
    }, "mentor@example.com", [
      { id: 1, email: "shared@example.com" },
      { id: 2, email: "shared@example.com" },
    ]),
    null,
  );
  assert.equal(
    findGoogleCalendarBusinessMatch({
      organizer: { email: "mentor@example.com" },
      attendees: [{ email: "founder@example.com" }, { email: "other@example.com" }],
    }, "mentor@example.com", assignedBusinesses),
    null,
  );
});

test("encrypts OAuth tokens before they are stored", () => {
  process.env.SESSION_SECRET = "google-calendar-test-secret";
  const encrypted = encryptGoogleCalendarToken("private-refresh-token");
  assert.notEqual(encrypted, "private-refresh-token");
  assert.equal(encrypted.split(".").length, 3);
});

test("token refresh uses an abort deadline and hides provider timeout details", async () => {
  const originalFetch = globalThis.fetch;
  const timeout = mockImmediateGoogleCalendarTimeout();
  const originalEnv = {
    sessionSecret: process.env.SESSION_SECRET,
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  };
  process.env.SESSION_SECRET = "google-calendar-test-secret";
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
  let requestSignal: AbortSignal | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    assert.equal(requestSignal.aborted, true, "the request signal should be aborted at its deadline");
    throw requestSignal.reason;
  }) as typeof fetch;

  try {
    await assert.rejects(
      refreshGoogleAccessToken({
        id: 12,
        googleCalendarAccessTokenEncrypted: null,
        googleCalendarAccessTokenExpiresAt: null,
        googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken("test-refresh-token"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GoogleCalendarSyncError);
        assert.equal(error.message, "Google Calendar authorization could not be refreshed.");
        assert.equal(error.message.includes("private provider response data"), false);
        return true;
      },
    );
    assert.ok(requestSignal instanceof AbortSignal, "token refresh must pass an abort signal");
    assert.equal(timeout.getTimeoutMs(), 30_000, "token refresh must have a bounded 30-second deadline");
  } finally {
    globalThis.fetch = originalFetch;
    timeout.restore();
    if (originalEnv.sessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalEnv.sessionSecret;
    if (originalEnv.clientId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalEnv.clientId;
    if (originalEnv.clientSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.clientSecret;
  }
});

test("expired Google authorization is classified for reconnect without exposing provider text", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    sessionSecret: process.env.SESSION_SECRET,
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  };
  process.env.SESSION_SECRET = "google-calendar-test-secret";
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: "invalid_grant",
    error_description: "private provider response details",
  }), { status: 400 })) as typeof fetch;

  try {
    await assert.rejects(
      refreshGoogleAccessToken({
        id: 12,
        googleCalendarAccessTokenEncrypted: null,
        googleCalendarAccessTokenExpiresAt: null,
        googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken("test-refresh-token"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GoogleCalendarSyncError);
        assert.equal(error.requiresReauthorization, true);
        assert.equal(error.message, "Google Calendar authorization could not be refreshed.");
        assert.equal(error.message.includes("private provider response details"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.sessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalEnv.sessionSecret;
    if (originalEnv.clientId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalEnv.clientId;
    if (originalEnv.clientSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.clientSecret;
  }
});

test("Calendar page requests use an abort deadline and hide provider timeout details", async () => {
  const originalFetch = globalThis.fetch;
  const timeout = mockImmediateGoogleCalendarTimeout();
  let requestSignal: AbortSignal | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    assert.equal(requestSignal.aborted, true, "the request signal should be aborted at its deadline");
    throw requestSignal.reason;
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchCalendarPage("test-access-token", null),
      (error: unknown) => {
        assert.ok(error instanceof GoogleCalendarSyncError);
        assert.equal(error.message, "Google Calendar events could not be retrieved.");
        assert.equal(error.message.includes("private provider response data"), false);
        return true;
      },
    );
    assert.ok(requestSignal instanceof AbortSignal, "Calendar page requests must pass an abort signal");
    assert.equal(timeout.getTimeoutMs(), 30_000, "Calendar page requests must have a bounded 30-second deadline");
  } finally {
    globalThis.fetch = originalFetch;
    timeout.restore();
  }
});

test("token refresh aborts a stalled response body and hides provider timeout details", { timeout: 1_000 }, async () => {
  const originalFetch = globalThis.fetch;
  const timeout = mockStalledBodyGoogleCalendarTimeout();
  const originalEnv = {
    sessionSecret: process.env.SESSION_SECRET,
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  };
  process.env.SESSION_SECRET = "google-calendar-test-secret";
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return createStalledResponse(requestSignal);
  }) as typeof fetch;

  try {
    await assert.rejects(
      refreshGoogleAccessToken({
        id: 12,
        googleCalendarAccessTokenEncrypted: null,
        googleCalendarAccessTokenExpiresAt: null,
        googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken("test-refresh-token"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GoogleCalendarSyncError);
        assert.equal(error.message, "Google Calendar authorization could not be refreshed.");
        assert.equal(error.message.includes("private provider response details"), false);
        return true;
      },
    );
    assert.ok(requestSignal instanceof AbortSignal);
    assert.equal(timeout.getTimeoutMs(), 30_000);
    assert.equal(requestSignal.aborted, true, "the token body must be interrupted at the request deadline");
  } finally {
    globalThis.fetch = originalFetch;
    timeout.restore();
    if (originalEnv.sessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalEnv.sessionSecret;
    if (originalEnv.clientId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalEnv.clientId;
    if (originalEnv.clientSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.clientSecret;
  }
});

test("Calendar page aborts a stalled response body and hides provider timeout details", { timeout: 1_000 }, async () => {
  const originalFetch = globalThis.fetch;
  const timeout = mockStalledBodyGoogleCalendarTimeout();
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return createStalledResponse(requestSignal);
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchCalendarPage("test-access-token", null),
      (error: unknown) => {
        assert.ok(error instanceof GoogleCalendarSyncError);
        assert.equal(error.message, "Google Calendar returned an invalid event response.");
        assert.equal(error.message.includes("private provider response details"), false);
        return true;
      },
    );
    assert.ok(requestSignal instanceof AbortSignal);
    assert.equal(timeout.getTimeoutMs(), 30_000);
    assert.equal(requestSignal.aborted, true, "the Calendar body must be interrupted at the request deadline");
  } finally {
    globalThis.fetch = originalFetch;
    timeout.restore();
  }
});

test("requests only event fields needed for booking matching and history", () => {
  for (const requiredField of ["id", "status", "updated", "start(dateTime,timeZone)", "end(dateTime,timeZone)", "attendees(email)", "organizer(email)"]) {
    assert.ok(googleCalendarPrivacy.eventFields.includes(requiredField));
  }
  for (const privateField of ["summary", "description", "location", "conferenceData", "displayName"]) {
    assert.equal(googleCalendarPrivacy.eventFields.includes(privateField), false);
  }
});

test("records safe consecutive-failure state and resets it after a successful sync", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  const { db } = await import("@workspace/db");
  const original = Object.getOwnPropertyDescriptor(db, "update");
  let saved: Record<string, unknown> | undefined;
  Object.defineProperty(db, "update", {
    configurable: true,
    writable: true,
    value: () => {
      const query = {
        set(values: Record<string, unknown>) {
          saved = values;
          return this;
        },
        where() {
          return Promise.resolve();
        },
      };
      return query;
    },
  });

  try {
    await recordGoogleCalendarSyncFailureStatus(
      12,
      new GoogleCalendarSyncError("authorization expired", 400, true),
      { accountEmail: "mentor@example.test", refreshTokenEncrypted: "encrypted-refresh-token" },
    );
    assert.ok(saved?.googleCalendarSyncLastFailureAt instanceof Date);
    assert.ok(saved?.googleCalendarSyncConsecutiveFailures);
    assert.equal(saved?.googleCalendarSyncNeedsReauthorization, true);

    await recordGoogleCalendarSyncFailureStatus(
      12,
      new GoogleCalendarSyncError("temporary service issue"),
      { accountEmail: "mentor@example.test", refreshTokenEncrypted: "encrypted-refresh-token" },
    );
    assert.equal("googleCalendarSyncNeedsReauthorization" in (saved ?? {}), false);

    await recordGoogleCalendarSyncSuccessStatus(12, {
      accountEmail: "mentor@example.test",
      refreshTokenEncrypted: "encrypted-refresh-token",
    });
    assert.ok(saved?.googleCalendarSyncLastSuccessAt instanceof Date);
    assert.equal(saved?.googleCalendarSyncLastFailureAt, null);
    assert.equal(saved?.googleCalendarSyncConsecutiveFailures, 0);
    assert.equal(saved?.googleCalendarSyncNeedsReauthorization, false);
  } finally {
    if (original) Object.defineProperty(db, "update", original);
    else Reflect.deleteProperty(db, "update");
  }
});
