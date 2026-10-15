import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { analyticsReportLayoutsTable, db, programsTable } = await import("@workspace/db");
const { default: analyticsRouter } = await import("../src/routes/analytics");

type Layout = {
  id: number;
  programId: number;
  name: string;
  title: string;
  sections: { summary: boolean; stages: boolean; attendance: boolean; engagement: boolean; impact: boolean };
  createdByStaffId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

let role: "coordinator" | "staff" = "coordinator";
let server: Server;
let selectCount = 0;
let routeLayoutSelectCount = 0;
const layouts: Layout[] = [{
  id: 1,
  programId: 4,
  name: "Quarterly report",
  title: "Quarterly progress",
  sections: { summary: true, stages: false, attendance: true, engagement: false, impact: true },
  createdByStaffId: 3,
  createdAt: new Date("2026-10-15T10:00:00.000Z"),
  updatedAt: new Date("2026-10-15T10:00:00.000Z"),
}];
const restoreMethods: Array<() => void> = [];

function setDbMethod(name: "select" | "insert" | "update" | "delete", replacement: unknown) {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, { configurable: true, writable: true, value: replacement });
  restoreMethods.push(() => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  });
}

before(async () => {
  setDbMethod("select", (() => {
    selectCount += 1;
    let table: unknown;
    const query: any = {
      from(nextTable: unknown) { table = nextTable; return query; },
      where() { return query; },
      orderBy() { return query; },
      limit() { return Promise.resolve(rows()); },
      then(resolve: (items: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(rows()).then(resolve, reject);
      },
    };
    function rows(): unknown[] {
      if (table === programsTable) return [{ id: 4 }];
      if (table !== analyticsReportLayoutsTable) return [];
      routeLayoutSelectCount += 1;
      if (requestMethod === "GET") return layouts.filter(({ programId }) => programId === 4);
      if (requestMethod === "PATCH" && routeLayoutSelectCount === 1) {
        return layouts.filter(({ id, programId }) => id === 1 && programId === 4);
      }
      return [];
    }
    return query;
  }) as never);
  setDbMethod("insert", (() => {
    const query: any = {
      values(value: Omit<Layout, "id" | "createdAt" | "updatedAt">) {
        const now = new Date("2026-10-15T12:00:00.000Z");
        query.inserted = {
          ...value,
          id: 2,
          createdAt: now,
          updatedAt: now,
        };
        return query;
      },
      async returning() {
        layouts.push(query.inserted);
        return [query.inserted];
      },
    };
    return query;
  }) as never);
  setDbMethod("update", (() => {
    const query: any = {
      set(value: Partial<Layout>) { query.patch = value; return query; },
      where() { return query; },
      async returning() {
        const existing = layouts.find(({ id, programId }) => id === 1 && programId === 4);
        if (!existing) return [];
        Object.assign(existing, query.patch, { updatedAt: new Date("2026-10-15T12:30:00.000Z") });
        return [existing];
      },
    };
    return query;
  }) as never);
  setDbMethod("delete", (() => {
    const query: any = {
      where() { return query; },
      async returning() {
        if (requestPath !== "/api/analytics/programs/4/report-layouts/1") return [];
        const index = layouts.findIndex(({ id, programId }) => id === 1 && programId === 4);
        if (index < 0) return [];
        return layouts.splice(index, 1).map(({ id }) => ({ id }));
      },
    };
    return query;
  }) as never);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    requestMethod = req.method;
    requestPath = req.path;
    routeLayoutSelectCount = 0;
    Object.assign(res.locals, { staff: { id: 7, email: "coordinator@example.com", role, status: "active" } });
    next();
  });
  app.use("/api", analyticsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

let requestMethod = "";
let requestPath = "";

after(async () => {
  for (const restore of restoreMethods.reverse()) restore();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path: string, method = "GET", body?: unknown): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const input = {
  name: "Monthly update",
  title: "Monthly founder progress",
  sections: { summary: true, stages: true, attendance: false, engagement: true, impact: false },
};

test("report layouts are coordinator-only and invalid inputs stop before database access", async () => {
  role = "staff";
  selectCount = 0;
  const denied = await request("/api/analytics/report-layouts?programId=4");
  assert.equal(denied.status, 403);
  assert.equal(selectCount, 0);

  role = "coordinator";
  const invalidQuery = await request("/api/analytics/report-layouts?programId=bad");
  const invalidBody = await request("/api/analytics/report-layouts", "POST", { programId: 4, name: "", title: "", sections: {} });
  assert.equal(invalidQuery.status, 400);
  assert.equal(invalidBody.status, 400);
});

test("coordinators can list, save, edit, and remove a program-scoped layout", async () => {
  role = "coordinator";
  const listed = await request("/api/analytics/report-layouts?programId=4");
  assert.equal(listed.status, 200);
  assert.equal((await listed.json() as Layout[])[0].name, "Quarterly report");

  const created = await request("/api/analytics/report-layouts", "POST", { ...input, programId: 4, name: "  Monthly update  " });
  assert.equal(created.status, 201);
  const createdLayout = await created.json() as Layout;
  assert.equal(createdLayout.name, "Monthly update");
  assert.equal(createdLayout.createdByStaffId, 7);

  const updated = await request("/api/analytics/programs/4/report-layouts/1", "PATCH", {
    ...input,
    name: "Quarterly review",
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json() as Layout).title, input.title);

  const wrongProgram = await request("/api/analytics/programs/5/report-layouts/1", "DELETE");
  assert.equal(wrongProgram.status, 404);
  const removed = await request("/api/analytics/programs/4/report-layouts/1", "DELETE");
  assert.equal(removed.status, 204);
});
