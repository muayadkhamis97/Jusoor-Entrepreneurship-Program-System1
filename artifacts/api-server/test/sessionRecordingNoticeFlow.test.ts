import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreTransaction: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;
let restoreSelect: (() => void) | undefined;
const session = {
  id: 71,
  programId: 8,
  title: "Founder finance workshop",
  type: "training",
  scheduledDate: "2026-10-13",
  startTime: "10:00",
  durationMinutes: 60,
  facilitator: "Program team",
  trainerStaffId: null,
  deliveryMode: "online",
  location: null,
  zoomUrl: null,
  zoomMeetingId: null,
  recordingUrl: null as string | null,
  recordingVersion: 0,
  status: "completed",
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
};
let recordingNotices: Array<Record<string, unknown>>;

function replaceDbMethod(
  name: "select" | "transaction" | "update",
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
  const { programsTable, sessionsTable } = await import("@workspace/db");
  const { default: router } = await import("../src/routes/sessions");
  recordingNotices = [];

  restoreSelect = replaceDbMethod("select", (() => {
    let table: unknown;
    const rows = () => table === programsTable
      ? [{ id: session.programId }]
      : table === sessionsTable
        ? [session]
        : [];
    const query = {
      from(value: unknown) { table = value; return query; },
      where() { return query; },
      limit: async () => rows(),
      then: (
        resolve: (value: ReturnType<typeof rows>) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows()).then(resolve, reject),
    };
    return query;
  }) as (...args: never[]) => unknown);
  restoreTransaction = replaceDbMethod("transaction", (async (callback) => {
    const tx = {
      select() {
        let table: unknown;
        const rows = () => table === sessionsTable ? [session] : [];
        const query = {
          from(value: unknown) { table = value; return query; },
          where() { return query; },
          limit() { return query; },
          for: async () => rows(),
          then: (resolve: (value: ReturnType<typeof rows>) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(rows()).then(resolve, reject),
        };
        return query;
      },
      update() {
        let values: Record<string, unknown> = {};
        const query = {
          set(next: Record<string, unknown>) { values = next; return query; },
          where() { return query; },
          returning: async () => {
            Object.assign(session, values);
            return [session];
          },
        };
        return query;
      },
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            return {
              returning: async () => {
                if (table === sessionsTable) {
                  Object.assign(session, values);
                  return [session];
                }
                return [];
              },
              onConflictDoNothing: async () => {
                recordingNotices.push(values);
              },
            };
          },
        };
      },
    };
    return (callback as (transaction: typeof tx) => Promise<unknown>)(tx);
  }) as (...args: never[]) => unknown);
  restoreUpdate = replaceDbMethod("update", (() => {
    const query = {
      set() { return query; },
      where: async () => undefined,
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.staff = {
      id: 1,
      email: "session-recording-test@example.com",
      role: "coordinator",
      status: "active",
    };
    next();
  });
  app.use("/api", router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect?.();
  restoreUpdate?.();
  restoreTransaction?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("session recording edits create one notice per Drive-link version", async () => {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/sessions/${session.id}`;
  const save = async (data: Record<string, unknown>) => fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

  const firstLink = "https://drive.google.com/file/d/recording_one/view";
  const first = await save({ recordingUrl: firstLink });
  assert.equal(first.status, 200);
  assert.equal(recordingNotices.length, 1);
  assert.equal(recordingNotices[0]?.programId, session.programId);
  assert.equal(recordingNotices[0]?.sessionId, session.id);
  assert.equal(recordingNotices[0]?.recordingVersion, 1);

  const repeated = await save({ recordingUrl: firstLink });
  assert.equal(repeated.status, 200);
  assert.equal(recordingNotices.length, 1);

  const unrelated = await save({ title: "Founder finance workshop — updated" });
  assert.equal(unrelated.status, 200);
  assert.equal(recordingNotices.length, 1);

  const replacement = await save({
    recordingUrl: "https://drive.google.com/file/d/recording_two/view",
  });
  assert.equal(replacement.status, 200);
  assert.equal(recordingNotices.length, 2);
  assert.equal(recordingNotices[1]?.recordingVersion, 2);

  const removed = await save({ recordingUrl: null });
  assert.equal(removed.status, 200);
  assert.equal(session.recordingUrl, null);
  assert.equal(recordingNotices.length, 2);
});
