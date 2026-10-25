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
let transactionCalls = 0;
let connectionTable: unknown;

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
  transactionCalls = 0;
});

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  const { programGoogleSheetsConnectionsTable } = await import("@workspace/db");
  connectionTable = programGoogleSheetsConnectionsTable;
  const { default: googleSheetsRouter } = await import("../src/routes/googleSheets");
  const tx = {
    execute: async () => undefined,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => connectionExists ? [{ programId: 19 }] : [],
        }),
      }),
    }),
    delete: (table: unknown) => {
      deletedTable = table;
      return { where: async () => undefined };
    },
  };
  restoreTransaction = replaceTransaction((async (callback: (transaction: typeof tx) => Promise<unknown>) => {
    transactionCalls += 1;
    return callback(tx);
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
});
