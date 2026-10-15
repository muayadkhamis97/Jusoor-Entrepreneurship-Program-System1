import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import {
  isGoogleCalendarOAuthStateValid,
  sealGoogleCalendarOAuthState,
  type GoogleCalendarOAuthState,
} from "../src/lib/googleCalendarOAuthState";
import { googleCalendarPrivacy } from "../src/lib/googleCalendarSync";

const nativeFetch = globalThis.fetch;
const authCode = "sensitive-google-authorization-code";
const accessToken = "sensitive-google-access-token";
const logEntries: unknown[] = [];
let googleCalendarRouter: express.Router;
let server: Server;
let db: typeof import("@workspace/db").db;

function validState(overrides: Partial<GoogleCalendarOAuthState> = {}): GoogleCalendarOAuthState {
  return {
    staffId: 71,
    state: "expected-google-state",
    codeVerifier: "test-google-code-verifier",
    origin: "http://localhost",
    redirectUri: "http://localhost/api/mentor/google-calendar/callback",
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function replaceDbMethod(name: "select" | "update", replacement: (...args: never[]) => unknown) {
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
  process.env.SESSION_SECRET = "unit-test-session-secret";
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-google-client-secret";
  process.env.NODE_ENV = "test";

  db = (await import("@workspace/db")).db;
  const { default: router } = await import("../src/routes/googleCalendarOAuth");
  googleCalendarRouter = router as express.Router;
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      log: {
        warn: (...args: unknown[]) => logEntries.push(args),
        error: (...args: unknown[]) => logEntries.push(args),
        info: (...args: unknown[]) => logEntries.push(args),
      },
    });
    next();
  });
  app.use("/api/mentor/google-calendar", googleCalendarRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function callbackRequest(state: GoogleCalendarOAuthState, query: string): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const cookie = sealGoogleCalendarOAuthState(state);
  return nativeFetch(`http://127.0.0.1:${address.port}/api/mentor/google-calendar/callback?${query}`, {
    redirect: "manual",
    headers: { cookie: `jusoor_google_calendar_oauth=${cookie}` },
  });
}

test("rejects expired and mismatched Google OAuth state before making provider requests", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return responseJson({});
  }) as typeof fetch;

  const expired = await callbackRequest(
    validState({ expiresAt: Date.now() - 1 }),
    "state=expected-google-state&code=sensitive-google-authorization-code",
  );
  assert.equal(expired.status, 400);

  const mismatched = await callbackRequest(
    validState(),
    "state=attacker-supplied-state&code=sensitive-google-authorization-code",
  );
  assert.equal(mismatched.status, 400);
  assert.equal(fetchCalls, 0);
  assert.equal(isGoogleCalendarOAuthStateValid(validState(), "wrong-state"), false);
});

test("verifies the mentor's Google account and stores only encrypted Google tokens", async () => {
  const persistedValues: Record<string, unknown>[] = [];
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const restoreSelect = replaceDbMethod("select", (() => {
    const query = {
      from() { return this; },
      where() { return this; },
      limit: async () => [{ id: 71 }],
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    const query = {
      set(values: Record<string, unknown>) {
        persistedValues.push(values);
        return this;
      },
      where() { return this; },
      returning: async () => [{ id: 71 }],
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return responseJson({
        access_token: accessToken,
        refresh_token: "sensitive-google-refresh-token",
        expires_in: 3600,
      });
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return responseJson({
        sub: "google-account-id",
        email: "Mentor@example.com",
        email_verified: true,
      });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  }) as typeof fetch;
  logEntries.length = 0;

  try {
    const response = await callbackRequest(
      validState(),
      `state=expected-google-state&code=${authCode}`,
    );
    const redirect = response.headers.get("location") ?? "";
    assert.equal(response.status, 302);
    assert.equal(redirect, "http://localhost/mentor?googleCalendar=connected");
    assert.equal(persistedValues.length, 1);
    assert.equal(persistedValues[0]?.bookingProvider, "google_calendar");
    assert.equal(persistedValues[0]?.googleCalendarAccountEmail, "mentor@example.com");
    assert.equal(persistedValues[0]?.googleCalendarSyncToken, null);
    assert.equal(typeof persistedValues[0]?.googleCalendarRefreshTokenEncrypted, "string");
    assert.equal(typeof persistedValues[0]?.googleCalendarAccessTokenEncrypted, "string");
    assert.notEqual(persistedValues[0]?.googleCalendarRefreshTokenEncrypted, "sensitive-google-refresh-token");
    assert.notEqual(persistedValues[0]?.googleCalendarAccessTokenEncrypted, accessToken);
    assert.equal(fetchCalls.length, 2);
    assert.match(String(fetchCalls[0]?.init?.body), new RegExp(authCode));
    assert.doesNotMatch(JSON.stringify(persistedValues), new RegExp(`${authCode}|${accessToken}|sensitive-google-refresh-token`));
    assert.doesNotMatch(redirect, new RegExp(`${authCode}|${accessToken}|sensitive-google-refresh-token`));
    assert.doesNotMatch(JSON.stringify(logEntries), new RegExp(`${authCode}|${accessToken}|sensitive-google-refresh-token`));
  } finally {
    restoreUpdate();
    restoreSelect();
    globalThis.fetch = nativeFetch;
  }
});

test("requests the narrow read-only scope for events on the mentor's own Google calendars", () => {
  assert.equal(
    googleCalendarPrivacy.scope,
    "https://www.googleapis.com/auth/calendar.events.owned.readonly",
  );
});
