import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import pinoHttp from "pino-http";
import type { SQL } from "drizzle-orm";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;
let staffRole = "coordinator";
let selectedMentor: {
  id: number;
  email: string;
  role: string;
  googleCalendarRefreshTokenEncrypted: string | null;
  googleCalendarAccessTokenEncrypted: string | null;
} | null = {
  id: 27,
  email: "mentor@example.test",
  role: "mentor",
  googleCalendarRefreshTokenEncrypted: null,
  googleCalendarAccessTokenEncrypted: null,
};
let updateValues: Record<string, unknown> = {};
let updateCondition: SQL | undefined;
let updateCalls = 0;
let auditValues: Record<string, unknown> | undefined;
let encryptGoogleCalendarToken: (token: string) => string;
let providerCalls: Array<{ url: string; init?: RequestInit }> = [];

function replaceDbMethod(name: "select" | "transaction", replacement: (...args: never[]) => unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, { configurable: true, writable: true, value: replacement });
  return () => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  };
}

beforeEach(() => {
  staffRole = "coordinator";
  selectedMentor = {
    id: 27,
    email: "mentor@example.test",
    role: "mentor",
    googleCalendarRefreshTokenEncrypted: null,
    googleCalendarAccessTokenEncrypted: null,
  };
  updateValues = {};
  updateCondition = undefined;
  updateCalls = 0;
  auditValues = undefined;
  providerCalls = [];
});

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  ({ encryptGoogleCalendarToken } = await import("../src/lib/googleCalendarSync"));
  const { default: staffRouter } = await import("../src/routes/staff");

  restoreSelect = replaceDbMethod("select", (() => ({
    from() {
      return {
        where() {
          return {
            limit: async () => selectedMentor ? [selectedMentor] : [],
          };
        },
      };
    },
  })) as (...args: never[]) => unknown);
  const tx = {
    update: () => ({
      set(values: Record<string, unknown>) {
        updateValues = values;
        return this;
      },
      where(condition: SQL) {
        updateCondition = condition;
        return this;
      },
      returning: async () => {
        updateCalls += 1;
        return [{ id: selectedMentor?.id ?? 27 }];
      },
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        auditValues = values;
      },
    }),
  };
  restoreTransaction = replaceDbMethod("transaction", (async (callback: (transaction: typeof tx) => Promise<unknown>) =>
    callback(tx)) as (...args: never[]) => unknown);

  const app = express();
  app.use(pinoHttp());
  app.use((_req, res, next) => {
    res.locals.staff = { id: 1, email: "admin@example.test", role: staffRole };
    next();
  });
  app.use("/api", staffRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect?.();
  restoreTransaction?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function disconnectMentorCalendar(): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/staff/27/google-calendar-connection`, {
    method: "DELETE",
  });
}

test("coordinator can disconnect a mentor calendar without changing the mentor's other provider data", async () => {
  const response = await disconnectMentorCalendar();

  assert.equal(response.status, 204);
  assert.deepEqual(updateValues, {
    bookingProvider: "calendly",
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    googleCalendarRefreshTokenEncrypted: null,
    googleCalendarAccessTokenEncrypted: null,
    googleCalendarAccessTokenExpiresAt: null,
    googleCalendarSyncToken: null,
  });
  assert.ok(updateCondition);
  assert.equal(updateCalls, 1);
  assert.deepEqual(auditValues, {
    integrationType: "mentor_google_calendar",
    actorStaffId: 1,
    actorEmail: "admin@example.test",
    affectedStaffId: 27,
    affectedAccountEmail: "mentor@example.test",
    programId: null,
    programName: null,
  });
});

test("non-coordinators cannot disconnect another staff member's calendar", async () => {
  staffRole = "staff";
  const response = await disconnectMentorCalendar();

  assert.equal(response.status, 403);
  assert.equal(updateCalls, 0);
});

test("revokes the mentor's Google grant before clearing the saved connection", async () => {
  selectedMentor = {
    id: 27,
    email: "mentor@example.test",
    role: "mentor",
    googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken("mentor-refresh-token"),
    googleCalendarAccessTokenEncrypted: null,
  };
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    providerCalls.push({ url: String(input), init });
    assert.equal(updateCalls, 0);
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  const response = await disconnectMentorCalendar();
  assert.equal(response.status, 204);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0]?.url, "https://oauth2.googleapis.com/revoke");
  assert.match(String(providerCalls[0]?.init?.body), /mentor-refresh-token/);
  assert.equal(updateCalls, 1);
  assert.equal(auditValues?.integrationType, "mentor_google_calendar");
});

test("keeps the mentor's saved connection when Google cannot revoke its grant", async () => {
  selectedMentor = {
    id: 27,
    email: "mentor@example.test",
    role: "mentor",
    googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken("mentor-refresh-token"),
    googleCalendarAccessTokenEncrypted: null,
  };
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;

  const response = await disconnectMentorCalendar();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /connection was not changed/i);
  assert.equal(updateCalls, 0);
  assert.equal(auditValues, undefined);
});
