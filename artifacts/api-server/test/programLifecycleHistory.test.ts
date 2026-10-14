import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { db, programLifecycleEventsTable, programsTable } = await import("@workspace/db");
const { default: programsRouter } = await import("../src/routes/programs");

type Row = Record<string, unknown>;
let lifecycleEvents: Row[] = [
  {
    id: 12,
    action: "restored",
    createdAt: new Date("2026-05-02T11:30:00.000Z"),
    actorEmail: "coordinator@example.com",
  },
  {
    id: 8,
    action: "archived",
    createdAt: new Date("2026-04-01T09:15:00.000Z"),
    actorEmail: null,
  },
];

let role: "coordinator" | "staff" = "coordinator";
let programExists = true;
let selectCount = 0;
let server: Server;
let restoreSelect: () => void;
const nativeFetch = globalThis.fetch;

before(async () => {
  const original = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      selectCount += 1;
      let table: unknown;
      const query: any = {
        from(nextTable: unknown) {
          table = nextTable;
          return query;
        },
        leftJoin() { return query; },
        where() { return query; },
        orderBy() { return query; },
        limit() {
          return Promise.resolve(table === programsTable && programExists ? [{ id: 7 }] : []);
        },
        then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          const rows = table === programLifecycleEventsTable ? lifecycleEvents : [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return query;
    },
  });
  restoreSelect = () => {
    if (original) Object.defineProperty(db, "select", original);
    else Reflect.deleteProperty(db, "select");
  };

  const app = express();
  app.use((_req, res, next) => {
    Object.assign(res.locals, { staff: { id: 1, email: "coordinator@example.com", role } });
    next();
  });
  app.use("/api", programsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

async function request(path: string): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`);
}

test("only coordinators can read program lifecycle-event details", async () => {
  role = "staff";
  selectCount = 0;

  const response = await request("/api/programs/7/lifecycle-events");

  assert.equal(response.status, 403);
  assert.equal(selectCount, 0);
});

test("coordinators receive archive and restore events with timestamps and nullable actor email", async () => {
  role = "coordinator";
  programExists = true;
  const response = await request("/api/programs/7/lifecycle-events");
  const body = await response.json() as Array<{
    id: number;
    action: string;
    createdAt: string;
    actorEmail: string | null;
  }>;

  assert.equal(response.status, 200);
  assert.deepEqual(body, [
    {
      id: 12,
      action: "restored",
      createdAt: "2026-05-02T11:30:00.000Z",
      actorEmail: "coordinator@example.com",
    },
    {
      id: 8,
      action: "archived",
      createdAt: "2026-04-01T09:15:00.000Z",
      actorEmail: null,
    },
  ]);
});

test("lifecycle history returns not found for a missing program", async () => {
  role = "coordinator";
  programExists = false;

  const response = await request("/api/programs/404/lifecycle-events");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Program not found" });
});

test("coordinators receive an empty array when a program has no lifecycle history", async () => {
  role = "coordinator";
  programExists = true;
  lifecycleEvents = [];

  const response = await request("/api/programs/7/lifecycle-events");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});
