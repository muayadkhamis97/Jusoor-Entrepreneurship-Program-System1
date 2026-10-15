import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreUpdate: (() => void) | undefined;
let updateValues: Record<string, unknown> = {};
let returnUpdatedMentor = true;

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
    const query = {
      set(values: Record<string, unknown>) {
        updateValues = values;
        return this;
      },
      where() {
        return this;
      },
      returning: async () => returnUpdatedMentor ? [{
        bookingProvider: "calendly",
        calendlyBookingUrl: "https://calendly.com/mentor",
        googleCalendarBookingUrl: null,
        googleCalendarAccountEmail: null,
      }] : [],
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use((_req, res, next) => {
    res.locals.staff = { id: 71 };
    next();
  });
  app.use("/api/mentor", mentorRouter);
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
