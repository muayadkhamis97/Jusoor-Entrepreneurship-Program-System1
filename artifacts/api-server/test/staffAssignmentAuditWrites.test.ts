import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  applicationsTable,
  businessesTable,
  db,
  participantBusinessMembershipsTable,
  programsTable,
  staffAssignmentAuditEventsTable,
  staffMembersTable,
} = await import("@workspace/db");
const { default: staffRouter } = await import("../src/routes/staff");

const inserts: Array<{ table: unknown; values: unknown }> = [];
const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
let server: Server;
const nativeFetch = globalThis.fetch;

function rowsFor(table: unknown): Array<Record<string, unknown>> {
  if (table === programsTable) return [{ id: 4, name: "Spring founders" }];
  if (table === staffMembersTable) return [{ id: 8, email: "mentor@example.com", role: "staff" }];
  if (table === applicationsTable) return [{ id: 91, businessId: null, founderName: "Founder name" }];
  if (table === businessesTable) return [{ id: 12, businessName: "Shared business" }];
  return [];
}

function makeQuery() {
  let table: unknown;
  const query = {
    from(nextTable: unknown) { table = nextTable; return query; },
    where() { return query; },
    orderBy() { return query; },
    limit() { return Promise.resolve(rowsFor(table)); },
    for() { return Promise.resolve(rowsFor(table)); },
    then(resolve: (rows: Array<Record<string, unknown>>) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(rowsFor(table)).then(resolve, reject);
    },
  };
  return query;
}

before(async () => {
  inserts.length = 0;
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => makeQuery(),
  });
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: any) => Promise<unknown>) => callback({
      select: () => makeQuery(),
      delete: () => ({ where: async () => undefined }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          inserts.push({ table, values });
          const result = Promise.resolve([]);
          Object.assign(result, { onConflictDoNothing: async () => [] });
          return result;
        },
      }),
    }),
  });

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.staff = { id: 2, email: "admin@example.com", role: "coordinator", programIds: [] };
    next();
  });
  app.use("/api", staffRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  if (originalSelect) Object.defineProperty(db, "select", originalSelect);
  else Reflect.deleteProperty(db, "select");
  if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
  else Reflect.deleteProperty(db, "transaction");
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

async function request(path: string, body: unknown): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("changing specialist roles writes the audit event in the assignment transaction", async () => {
  const response = await request("/api/programs/4/staff/8/roles", { roles: ["mentor", "trainer"] });
  assert.equal(response.status, 200);
  const audit = inserts.find(({ table }) => table === staffAssignmentAuditEventsTable);
  assert.deepEqual(audit?.values, {
    assignmentType: "staff_roles",
    programId: 4,
    programName: "Spring founders",
    actorStaffId: 2,
    actorEmail: "admin@example.com",
    affectedStaffId: 8,
    affectedAccountEmail: "mentor@example.com",
    applicationId: null,
    affectedApplicationName: null,
    previousValue: { roles: [] },
    newValue: { roles: ["mentor", "trainer"] },
  });
});

test("assigning a participant to a business writes application and business values in the same transaction", async () => {
  inserts.length = 0;
  const response = await request("/api/programs/4/participant-business-membership", {
    applicationId: 91,
    businessId: 12,
  });
  assert.equal(response.status, 200);
  const audit = inserts.find(({ table }) => table === staffAssignmentAuditEventsTable);
  assert.deepEqual(audit?.values, {
    assignmentType: "business_team",
    programId: 4,
    programName: "Spring founders",
    actorStaffId: 2,
    actorEmail: "admin@example.com",
    affectedStaffId: null,
    affectedAccountEmail: null,
    applicationId: 91,
    affectedApplicationName: "Founder name",
    previousValue: { businessId: null, businessName: null },
    newValue: { businessId: 12, businessName: "Shared business" },
  });
  assert.ok(inserts.some(({ table }) => table === participantBusinessMembershipsTable));
});
