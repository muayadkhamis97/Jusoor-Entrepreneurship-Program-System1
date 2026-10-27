import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import pinoHttp from "pino-http";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { db, programsTable, programGoogleSheetsConnectionsTable } =
  await import("@workspace/db");
const { default: googleSheetsRouter } = await import("../src/routes/googleSheets");
const initialCategories = { businessTeam: true, operations: true, mentoringGrants: true, chats: true };
let server: Server;
let origin: string;
let staffRole = "staff";
let assignedProgramIds = [19];
let categories = { ...initialCategories };
let connectionExists = true;
let transactionCalls = 0;
let lastSavedColumns: Record<string, unknown> | undefined;
let restoreSelect: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;

const program = { id: 19, name: "Spring Program" };
const connection = () => ({
  programId: 19,
  spreadsheetId: "spreadsheet_123456789",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/spreadsheet_123456789/edit",
  spreadsheetTitle: "Spring Program — Program records",
  exportBusinessTeam: categories.businessTeam,
  exportOperations: categories.operations,
  exportMentoringGrants: categories.mentoringGrants,
  exportChats: categories.chats,
  connectedAt: new Date("2026-10-27T10:00:00Z"),
  lastSyncedAt: null,
  lastError: null,
});

function createQuery(table: unknown, joined = false, selection?: Record<string, unknown>) {
  const query: any = {
    from(value: unknown) { return createQuery(value, joined, selection); },
    leftJoin() { return createQuery(table, true, selection); },
    where() { return query; },
    orderBy() { return query; },
    groupBy() { return query; },
    for() { return query; },
    limit(limit: number) { query.maxRows = limit; return query; },
    then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
      let rows: unknown[] = [];
      if (table === programsTable && joined) {
        rows = [{
          ...program,
          ...connection(),
          ...(connectionExists ? {} : {
            spreadsheetId: null,
            spreadsheetUrl: null,
            spreadsheetTitle: null,
            connectedAt: null,
            lastSyncedAt: null,
            lastError: null,
            exportBusinessTeam: null,
            exportOperations: null,
            exportMentoringGrants: null,
            exportChats: null,
          }),
        }];
      } else if (table === programsTable && selection?.id) {
        rows = [program];
      } else if (table === programGoogleSheetsConnectionsTable) {
        rows = connectionExists ? [connection()] : [];
      }
      return Promise.resolve(rows.slice(0, query.maxRows)).then(resolve, reject);
    },
  };
  return query;
}

before(async () => {
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: (selection?: Record<string, unknown>) => createQuery(undefined, false, selection),
  });
  restoreSelect = () => {
    if (originalSelect) Object.defineProperty(db, "select", originalSelect);
    else Reflect.deleteProperty(db, "select");
  };

  const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: any) => Promise<unknown>) => {
      transactionCalls += 1;
      const tx = {
        execute: async () => undefined,
        select: () => createQuery(undefined),
        update: () => ({
          set(values: Record<string, unknown>) {
            lastSavedColumns = values;
            categories = {
              businessTeam: values.exportBusinessTeam as boolean,
              operations: values.exportOperations as boolean,
              mentoringGrants: values.exportMentoringGrants as boolean,
              chats: values.exportChats as boolean,
            };
            return { where: async () => undefined };
          },
        }),
        insert: () => ({
          values: () => ({ onConflictDoNothing: async () => undefined }),
        }),
      };
      return callback(tx);
    },
  });
  restoreTransaction = () => {
    if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
    else Reflect.deleteProperty(db, "transaction");
  };

  const app = express();
  app.use(express.json());
  app.use(pinoHttp());
  app.use((req, res, next) => {
    res.locals.staff = {
      id: 7,
      email: "staff@example.test",
      role: staffRole,
      programIds: assignedProgramIds,
    };
    next();
  });
  app.use("/api/staff/google-sheets", googleSheetsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  staffRole = "staff";
  assignedProgramIds = [19];
  categories = { ...initialCategories };
  connectionExists = true;
  transactionCalls = 0;
  lastSavedColumns = undefined;
});

after(async () => {
  restoreSelect?.();
  restoreTransaction?.();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function request(path: string, method = "GET", body?: unknown) {
  return fetch(`${origin}/api/staff/google-sheets${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("assigned program staff can save and reload independent export choices", async () => {
  const selected = { businessTeam: false, operations: true, mentoringGrants: false, chats: true };
  const saved = await request("/19/categories", "PATCH", { exportCategories: selected });

  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).exportCategories, selected);
  assert.deepEqual(lastSavedColumns && {
    exportBusinessTeam: lastSavedColumns.exportBusinessTeam,
    exportOperations: lastSavedColumns.exportOperations,
    exportMentoringGrants: lastSavedColumns.exportMentoringGrants,
    exportChats: lastSavedColumns.exportChats,
  }, {
    exportBusinessTeam: false,
    exportOperations: true,
    exportMentoringGrants: false,
    exportChats: true,
  });

  const reloaded = await request("/");
  assert.equal(reloaded.status, 200);
  assert.deepEqual((await reloaded.json())[0].exportCategories, selected);
});

test("Admins can update any active program's categories", async () => {
  staffRole = "coordinator";
  assignedProgramIds = [];
  const response = await request("/19/categories", "PATCH", {
    exportCategories: { businessTeam: true, operations: false, mentoringGrants: true, chats: false },
  });
  assert.equal(response.status, 200);
});

test("unassigned staff cannot read or persist another program's export choices", async () => {
  assignedProgramIds = [22];
  const response = await request("/19/categories", "PATCH", {
    exportCategories: { businessTeam: false, operations: false, mentoringGrants: false, chats: false },
  });
  assert.equal(response.status, 404);
  assert.equal(transactionCalls, 0);
  assert.equal(lastSavedColumns, undefined);
});

test("new or unconnected programs default to the currently selected four categories", async () => {
  connectionExists = false;
  const response = await request("/");
  assert.equal(response.status, 200);
  const [status] = await response.json();
  assert.deepEqual(status.exportCategories, initialCategories);
});

test("category updates reject missing or extra values without saving", async () => {
  const response = await request("/19/categories", "PATCH", {
    exportCategories: { businessTeam: true, operations: true, mentoringGrants: true },
  });
  assert.equal(response.status, 400);
  assert.equal(transactionCalls, 0);
});
