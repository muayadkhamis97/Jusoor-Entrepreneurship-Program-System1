import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { db, programsTable, businessesTable } = await import("@workspace/db");
const { default: operationsRouter } = await import("../src/routes");
const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
const dialect = new PgDialect();
const scopes: { table: unknown; params: unknown[] }[] = [];
let reads = 0;
let server: Server;
let origin: string;

before(async () => {
  Object.defineProperty(db, "select", {
    configurable: true,
    value: (selection?: Record<string, unknown>) => {
      let table: unknown;
      let grouped = false;
      const query: any = {
        from(value: unknown) { table = value; reads += 1; return query; },
        where(condition: any) {
          if (condition) scopes.push({ table, params: dialect.sqlToQuery(condition).params });
          return query;
        },
        leftJoin() { return query; },
        innerJoin() { return query; },
        orderBy() { return query; },
        groupBy() { grouped = true; return query; },
        limit() { return query; },
        then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
          const rows = selection?.value && !grouped
            ? [{ value: 0 }]
            : table === programsTable && selection?.id ? [{ id: 11 }, { id: 22 }] : [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return query;
    },
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const role = req.get("x-test-role");
    if (!role) { res.status(401).json({ error: "Sign in required." }); return; }
    res.locals.staff = { id: 1, role, programIds: [11], email: "staff@example.test" };
    next();
  });
  // Mount the real shared router in its production order, not individual route modules.
  app.use("/api", operationsRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (originalSelect) Object.defineProperty(db, "select", originalSelect);
  else Reflect.deleteProperty(db, "select");
});

function request(path: string, role?: string, method = "GET") {
  return fetch(`${origin}/api${path}`, { method, headers: role ? { "x-test-role": role } : {} });
}

test("shared operations router allows staff Overview and preserves assigned-program query scopes", async () => {
  scopes.length = 0;
  const response = await request("/dashboard", "staff");
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.programs, 0);
  assert.deepEqual(dashboard.upcomingSessions, []);
  assert.deepEqual(dashboard.recentBusinesses, []);
  const businessScopes = scopes.filter(scope => scope.table === businessesTable);
  assert.ok(businessScopes.length > 0);
  for (const scope of businessScopes) {
    assert.ok(scope.params.includes(11));
    assert.ok(!scope.params.includes(22), "unassigned program must not enter dashboard scope");
  }
});

test("staff can reach non-Admin lists after the communications and analytics router mounts", async () => {
  for (const path of ["/programs", "/businesses", "/sessions", "/support", "/pitches", "/communications"]) {
    const response = await request(path, "staff");
    assert.equal(response.status, 200, path);
    await response.json();
  }
});

test("staff remain forbidden from Admin-only analytics including child mutations", async () => {
  const beforeReads = reads;
  for (const [path, method] of [
    ["/analytics", "GET"], ["/analytics/kpis", "POST"],
    ["/analytics/attendance/1", "PUT"], ["/analytics/report-layouts", "GET"],
  ]) {
    const response = await request(path, "staff", method);
    assert.equal(response.status, 403, `${method} ${path}`);
  }
  assert.equal(reads, beforeReads, "Admin-only denials must happen before data is read");
});

test("Admin retains Overview and access to protected router namespaces", async () => {
  for (const path of ["/dashboard", "/communications"]) {
    const response = await request(path, "coordinator");
    assert.equal(response.status, 200, path);
    await response.json();
  }
  // This endpoint requires programId: reaching its validator proves Admin passed the guard.
  assert.equal((await request("/analytics/kpis", "coordinator")).status, 400);
});

test("specialists and unauthenticated callers cannot access operations Overview", async () => {
  const beforeReads = reads;
  for (const role of ["trainer", "mentor", "judge"]) {
    assert.equal((await request("/dashboard", role)).status, 403);
  }
  assert.equal((await request("/dashboard")).status, 401);
  assert.equal(reads, beforeReads);
});
