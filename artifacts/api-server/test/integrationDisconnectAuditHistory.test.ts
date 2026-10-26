import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let auditTable: typeof import("@workspace/db").integrationDisconnectAuditEventsTable;
let restoreSelect: (() => void) | undefined;
let staffRole = "coordinator";
let selectCalls = 0;

function replaceSelect(replacement: (...args: never[]) => unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", { configurable: true, writable: true, value: replacement });
  return () => {
    if (original) Object.defineProperty(db, "select", original);
    else Reflect.deleteProperty(db, "select");
  };
}

beforeEach(() => {
  staffRole = "coordinator";
  selectCalls = 0;
});

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const database = await import("@workspace/db");
  db = database.db;
  auditTable = database.integrationDisconnectAuditEventsTable;
  const { default: staffRouter } = await import("../src/routes/staff");
  restoreSelect = replaceSelect((() => {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      orderBy: () => query,
      limit: async () => {
        selectCalls += 1;
        assert.equal(table, auditTable);
        return [{
          id: 3,
          integrationType: "program_google_sheets",
          actorStaffId: 8,
          actorEmail: "admin@example.test",
          affectedStaffId: null,
          affectedAccountEmail: null,
          programId: 19,
          programName: "Spring Program",
          createdAt: new Date("2026-10-26T10:00:00.000Z"),
        }];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use((_req, res, next) => {
    res.locals.staff = { id: 8, email: "admin@example.test", role: staffRole };
    next();
  });
  app.use("/api", staffRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function getHistory(): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/staff/integration-disconnect-history`);
}

test("Admins can read the actor, affected program, integration, and timestamp", async () => {
  const response = await getHistory();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: 3,
    integrationType: "program_google_sheets",
    actorStaffId: 8,
    actorEmail: "admin@example.test",
    affectedStaffId: null,
    affectedAccountEmail: null,
    programId: 19,
    programName: "Spring Program",
    createdAt: "2026-10-26T10:00:00.000Z",
  }]);
  assert.equal(selectCalls, 1);
});

test("regular staff cannot read integration disconnect history", async () => {
  staffRole = "staff";
  const response = await getHistory();
  assert.equal(response.status, 403);
  assert.equal(selectCalls, 0);
});

test("deleting the history path cannot change audit records", async () => {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await nativeFetch(
    `http://127.0.0.1:${address.port}/api/staff/integration-disconnect-history`,
    { method: "DELETE" },
  );
  assert.equal(response.status, 400);
  assert.equal(selectCalls, 0);
});
