import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { readFile } from "node:fs/promises";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { db, staffAssignmentAuditEventsTable } = await import("@workspace/db");
const { default: staffRouter } = await import("../src/routes/staff");

let role: "coordinator" | "staff" | "participant" = "coordinator";
let selectCount = 0;
let whereCount = 0;
let querySteps: string[] = [];
let whereSql = "";
let whereParams: unknown[] = [];
let server: Server;
let restoreSelect: () => void;
const nativeFetch = globalThis.fetch;
const auditRows = [{
  id: 9,
  assignmentType: "staff_roles" as const,
  programId: 4,
  programName: "Spring founders",
  actorStaffId: 2,
  actorEmail: "admin@example.com",
  affectedStaffId: 8,
  affectedAccountEmail: "mentor@example.com",
  applicationId: null,
  affectedApplicationName: null,
  previousValue: { roles: ["mentor"] },
  newValue: { roles: ["trainer", "mentor"] },
  createdAt: new Date("2026-10-14T10:12:00.000Z"),
}];

before(async () => {
  const original = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      selectCount += 1;
      let table: unknown;
      const query = {
        from(nextTable: unknown) { table = nextTable; return query; },
        where(condition: Parameters<PgDialect["sqlToQuery"]>[0]) {
          whereCount += 1;
          querySteps.push("where");
          if (condition) {
            const compiled = new PgDialect().sqlToQuery(condition);
            whereSql = compiled.sql;
            whereParams = compiled.params;
          }
          return query;
        },
        orderBy() { querySteps.push("orderBy"); return query; },
        limit(limit: number) {
          assert.equal(limit, 250);
          querySteps.push("limit");
          return Promise.resolve(table === staffAssignmentAuditEventsTable ? auditRows : []);
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
    Object.assign(res.locals, { staff: { id: 2, email: "admin@example.com", role } });
    next();
  });
  app.use("/api", staffRouter);
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

test("assignment history is not readable by program staff or participants", async () => {
  for (const deniedRole of ["staff", "participant"] as const) {
    role = deniedRole;
    selectCount = 0;
    const response = await request("/api/staff/assignment-history");
    assert.equal(response.status, 403);
    assert.equal(selectCount, 0);
  }
});

test("admins receive assignment history with the actor, affected account, values, and timestamp", async () => {
  role = "coordinator";
  const response = await request("/api/staff/assignment-history");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    ...auditRows[0],
    createdAt: "2026-10-14T10:12:00.000Z",
  }]);
});

test("assignment history filters are applied before limiting results", async () => {
  role = "coordinator";
  whereCount = 0;
  querySteps = [];
  const response = await request(
    "/api/staff/assignment-history?programId=4&subject=mentor%40example.com&assignmentType=staff_roles",
  );
  assert.equal(response.status, 200);
  assert.equal(whereCount, 1);
  assert.deepEqual(querySteps, ["where", "orderBy", "limit"]);
  assert.match(whereSql, /"program_id" =/);
  assert.match(whereSql, /"assignment_type" =/);
  assert.match(whereSql, /"affected_account_email" ilike/);
  assert.match(whereSql, /"application_id"::text ILIKE/);
  assert.match(whereSql, /"previous_value"->>'businessName' ILIKE/);
  assert.match(whereSql, /"new_value"->>'businessName' ILIKE/);
  assert.deepEqual(whereParams, [
    4,
    "staff_roles",
    "%mentor@example.com%",
    "%mentor@example.com%",
    "%mentor@example.com%",
    "%mentor@example.com%",
    "%mentor@example.com%",
  ]);
});

test("invalid assignment history filters are rejected before querying", async () => {
  role = "coordinator";
  selectCount = 0;
  const response = await request("/api/staff/assignment-history?programId=0&assignmentType=unknown");
  assert.equal(response.status, 400);
  assert.equal(selectCount, 0);
});

test("the audit migration adds a new table without modifying existing records or schema", async () => {
  const migration = await readFile(new URL("../../../lib/db/migrations/20261014_staff_assignment_audit_events.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS jusoor_staff_assignment_audit_events/);
  assert.match(migration, /previous_value jsonb NOT NULL/);
  assert.match(migration, /new_value jsonb NOT NULL/);
  const executableStatements = migration
    .split(";")
    .map(statement => statement.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
  assert.equal(
    executableStatements.some(statement => /^(?:ALTER\b|UPDATE\b|DELETE\s+FROM\b|DROP\b|INSERT\s+INTO\b|TRUNCATE\b)/i.test(statement)),
    false,
  );
});
