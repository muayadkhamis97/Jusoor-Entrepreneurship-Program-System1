import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
const { db, programsTable, programAnnouncementsTable, businessesTable, sessionsTable, applicationsTable } = await import("@workspace/db");
const { default: router } = await import("../src/routes/communications");
const originals = ["select", "insert", "delete"].map(key => [key, Object.getOwnPropertyDescriptor(db, key)] as const);
const dialect = new PgDialect();
const now = new Date("2026-01-01T00:00:00Z");
const programs = [
  { id: 11, name: "Assigned", archivedAt: null },
  { id: 22, name: "Other", archivedAt: null },
  { id: 33, name: "Archived", archivedAt: now },
];
const announcements = [11, 22, null, 33].map((programId, index) => ({
  id: 41 + index, programId, businessId: null, sessionId: programId === null ? null : 71 + index,
  recordingVersion: 2, currentRecordingVersion: 2, recordingUrl: "https://drive.google.com/file/d/recording/view",
  programName: programs.find(p => p.id === programId)?.name ?? null, businessName: null,
  kind: "update", title: "Program update", body: "A private update", scheduledFor: now, createdAt: now,
}));
const writes: Record<string, unknown>[] = [];
const scopes: { table: unknown; sql: string; params: unknown[] }[] = [];
let participantReads = 0;
let missingBusinessColumn = false;
let server: Server;
let origin: string;

// Evaluate only the predicates emitted by these routes, so out-of-scope rows
// cannot accidentally pass a mocked query. All writes stay in memory.
function matches(row: Record<string, any>, condition: any): boolean {
  if (!condition) return true;
  const query = dialect.sqlToQuery(condition);
  if (/\bfalse\b/.test(query.sql)) return false;
  const id = query.sql.match(/"id" = \$(\d+)/);
  if (id && row.id !== query.params[Number(id[1]) - 1]) return false;
  if (/archived_at" is null/.test(query.sql) && row.archivedAt !== null) return false;
  const programScope = query.sql.match(/"program_id" in \(([^)]+)\)/);
  if (programScope) {
    const ids = [...programScope[1].matchAll(/\$(\d+)/g)].map(match => query.params[Number(match[1]) - 1]);
    if (!ids.includes(row.programId)) return false;
  }
  return true;
}

before(async () => {
  Object.defineProperty(db, "select", { configurable: true, value: (selection?: Record<string, unknown>) => {
    let table: unknown;
    let condition: any;
    const query: any = {
      from(value: unknown) { table = value; if (table === applicationsTable) participantReads++; return query; },
      where(value: any) {
        condition = value;
        const compiled = value ? dialect.sqlToQuery(value) : { sql: "", params: [] };
        scopes.push({ table, ...compiled });
        return query;
      },
      leftJoin() { return query; }, orderBy() { return query; }, limit() { return query; },
      then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        if (missingBusinessColumn && table === programAnnouncementsTable && selection?.businessId) {
          return Promise.reject({ code: "42703", message: 'column "business_id" does not exist' }).then(resolve, reject);
        }
        const rows = table === programsTable ? programs
          : table === programAnnouncementsTable ? announcements
          : table === businessesTable ? [{ id: 91, programId: 11, businessName: "Assigned business" }, { id: 92, programId: 22, businessName: "Other business" }]
          : table === sessionsTable ? announcements.filter(a => a.sessionId).map(a => ({ id: a.sessionId, programId: a.programId, title: "Workshop", recordingVersion: 2, recordingUrl: a.recordingUrl }))
          : [];
        return Promise.resolve(rows.filter(row => matches(row, condition))).then(resolve, reject);
      },
    };
    return query;
  } });
  Object.defineProperty(db, "insert", { configurable: true, value: () => ({
    values(value: Record<string, unknown>) {
      writes.push(value);
      return { returning: async () => [{ id: 100, createdAt: now, ...value }] };
    },
  }) });
  Object.defineProperty(db, "delete", { configurable: true, value: () => ({
    where(condition: any) {
      scopes.push({ table: programAnnouncementsTable, ...dialect.sqlToQuery(condition) });
      return { returning: async () => announcements.filter(row => matches(row, condition)).map(({ id }) => ({ id })) };
    },
  }) });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const role = req.get("x-test-role");
    if (!role) { res.status(401).json({ error: "Sign in required." }); return; }
    res.locals.staff = { id: 7, role, programIds: req.get("x-empty-scope") ? [] : [11, 33] };
    next();
  });
  app.use("/api", router);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(db, key, descriptor);
    else Reflect.deleteProperty(db, key);
  }
});

function request(path = "", method = "GET", role: string | null = "staff", body?: unknown, empty = false) {
  return fetch(`${origin}/api/communications${path}`, {
    method, headers: { ...(role ? { "x-test-role": role } : {}), ...(empty ? { "x-empty-scope": "true" } : {}), "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const input = { kind: "update", title: "Program update", body: "Details for the program team." };

test("staff history is limited to assigned active programs, including schema-compatibility fallback", async () => {
  for (const fallback of [false, true]) {
    missingBusinessColumn = fallback;
    const response = await request();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map((row: any) => row.id), [41]);
  }
  missingBusinessColumn = false;
  const empty = await request("", "GET", "staff", undefined, true);
  assert.deepEqual(await empty.json(), []);
});

test("staff can publish and schedule program and business-team announcements with their own staff identity", async () => {
  for (const extra of [{}, { businessId: 91 }, { scheduledFor: "2099-01-01T00:00:00Z" }]) {
    const response = await request("", "POST", "staff", { ...input, programId: 11, ...extra });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.programId, 11);
    assert.equal(result.status, "scheduledFor" in extra ? "scheduled" : "published");
    assert.equal(writes.at(-1)?.createdByStaffId, 7);
  }
});

test("staff cannot broadcast globally, target another or archived program, or target a business in another program", async () => {
  const before = writes.length;
  for (const programId of [null, 22, 33]) {
    assert.equal((await request("", "POST", "staff", { ...input, programId })).status, 403);
  }
  assert.equal((await request("", "POST", "staff", { ...input, programId: 11, businessId: 92 })).status, 400);
  assert.equal((await request("", "POST", "staff", { ...input, programId: 11 }, true)).status, 403);
  assert.equal(writes.length, before);
});

test("receipt and delete endpoints enforce the same active assigned-program boundary", async () => {
  for (const id of [42, 43, 44]) {
    const before = participantReads;
    assert.equal((await request(`/${id}/read-receipts`)).status, 404);
    assert.equal(participantReads, before, "no participant data read outside assigned programs");
    assert.equal((await request(`/${id}`, "DELETE")).status, 404);
  }
  assert.equal((await request("/41/read-receipts")).status, 200);
  assert.equal((await request("/41", "DELETE")).status, 200);
  const scope = scopes.at(-1)!;
  assert.match(scope.sql, /"program_id" in/);
  assert.ok(scope.params.includes(11));
  assert.ok(!scope.params.includes(22));
  assert.ok(!scope.params.includes(33));
});

test("Admin retains global announcements; specialists and unauthenticated callers are rejected", async () => {
  const adminList = await request("", "GET", "coordinator");
  assert.equal((await adminList.json()).length, 4);
  assert.equal((await request("", "POST", "coordinator", { ...input, programId: null })).status, 201);
  assert.equal((await request("/42", "DELETE", "coordinator")).status, 200);
  for (const role of ["trainer", "mentor", "judge", null]) {
    for (const [path, method] of [["", "GET"], ["", "POST"], ["/41", "DELETE"], ["/41/read-receipts", "GET"]]) {
      assert.equal((await request(path, method, role, method === "POST" ? input : undefined)).status, role ? 403 : 401);
    }
  }
});
