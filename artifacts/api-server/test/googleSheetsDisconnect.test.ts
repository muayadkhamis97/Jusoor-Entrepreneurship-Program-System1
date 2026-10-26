import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import pinoHttp from "pino-http";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreTransaction: (() => void) | undefined;
let staffRole = "coordinator";
let connectionExists = true;
let deletedTable: unknown;
let auditValues: Record<string, unknown> | undefined;
let pendingAuditValues: Record<string, unknown> | undefined;
let auditInsertFails = false;
let transactionCalls = 0;
let connectionTable: unknown;
let programTable: unknown;

function replaceTransaction(replacement: (...args: never[]) => unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(db, "transaction");
  Object.defineProperty(db, "transaction", { configurable: true, writable: true, value: replacement });
  return () => {
    if (original) Object.defineProperty(db, "transaction", original);
    else Reflect.deleteProperty(db, "transaction");
  };
}

beforeEach(() => {
  staffRole = "coordinator";
  connectionExists = true;
  deletedTable = undefined;
  auditValues = undefined;
  pendingAuditValues = undefined;
  auditInsertFails = false;
  transactionCalls = 0;
});

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  const { programGoogleSheetsConnectionsTable, programsTable } = await import("@workspace/db");
  connectionTable = programGoogleSheetsConnectionsTable;
  programTable = programsTable;
  const { default: googleSheetsRouter } = await import("../src/routes/googleSheets");
  const tx = {
    execute: async () => undefined,
    select: () => {
      let table: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          return query;
        },
        where: () => query,
        limit: async () => table === connectionTable
          ? connectionExists ? [{ programId: 19 }] : []
          : table === programTable ? [{ name: "Spring Program" }] : [],
      };
      return query;
    },
    delete: (table: unknown) => {
      deletedTable = table;
      return {
        where: async () => {
          connectionExists = false;
        },
      };
    },
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        if (auditInsertFails) throw new Error("Audit insert failed");
        pendingAuditValues = values;
      },
    }),
  };
  restoreTransaction = replaceTransaction((async (callback: (transaction: typeof tx) => Promise<unknown>) => {
    transactionCalls += 1;
    const beforeTransaction = connectionExists;
    try {
      const result = await callback(tx);
      auditValues = pendingAuditValues;
      return result;
    } catch (error) {
      connectionExists = beforeTransaction;
      pendingAuditValues = undefined;
      throw error;
    }
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(pinoHttp());
  app.use((_req, res, next) => {
    res.locals.staff = { id: 1, email: "admin@example.test", role: staffRole };
    next();
  });
  app.use("/api/staff/google-sheets", googleSheetsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

});

after(async () => {
  restoreTransaction?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function disconnectWorkbook(): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/staff/google-sheets/19`, { method: "DELETE" });
}

test("coordinator unlinks the workbook mapping while preserving the external workbook", async () => {
  const response = await disconnectWorkbook();

  assert.equal(response.status, 204);
  assert.equal(deletedTable, connectionTable);
  assert.equal(transactionCalls, 1);
  assert.deepEqual(auditValues, {
    integrationType: "program_google_sheets",
    initiatorType: "admin",
    actorStaffId: 1,
    actorEmail: "admin@example.test",
    affectedStaffId: null,
    affectedAccountEmail: null,
    programId: 19,
    programName: "Spring Program",
  });
});

test("program staff cannot disconnect a shared Google Sheets workbook", async () => {
  staffRole = "staff";
  const response = await disconnectWorkbook();

  assert.equal(response.status, 403);
  assert.equal(transactionCalls, 0);
  assert.equal(deletedTable, undefined);
});

test("disconnect reports a missing workbook without deleting anything", async () => {
  connectionExists = false;
  const response = await disconnectWorkbook();

  assert.equal(response.status, 404);
  assert.equal(transactionCalls, 1);
  assert.equal(deletedTable, undefined);
  assert.equal(auditValues, undefined);
});

test("keeps the workbook connection when its audit insert fails", async () => {
  auditInsertFails = true;

  const response = await disconnectWorkbook();

  assert.equal(response.status, 503);
  assert.equal(connectionExists, true);
  assert.equal(deletedTable, connectionTable);
  assert.equal(auditValues, undefined);
});
