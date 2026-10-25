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
let restoreUpdate: (() => void) | undefined;
let staffRole = "coordinator";
let selectedMentor: { id: number; role: string } | null = { id: 27, role: "mentor" };
let updateValues: Record<string, unknown> = {};
let updateCondition: SQL | undefined;
let updateCalls = 0;

function replaceDbMethod(name: "select" | "update", replacement: (...args: never[]) => unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, { configurable: true, writable: true, value: replacement });
  return () => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  };
}

beforeEach(() => {
  staffRole = "coordinator";
  selectedMentor = { id: 27, role: "mentor" };
  updateValues = {};
  updateCondition = undefined;
  updateCalls = 0;
});

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
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
  restoreUpdate = replaceDbMethod("update", (() => ({
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
  })) as (...args: never[]) => unknown);

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
  restoreUpdate?.();
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
});

test("non-coordinators cannot disconnect another staff member's calendar", async () => {
  staffRole = "staff";
  const response = await disconnectMentorCalendar();

  assert.equal(response.status, 403);
  assert.equal(updateCalls, 0);
});
