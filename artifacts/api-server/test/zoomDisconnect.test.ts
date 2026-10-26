import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let staffMembersTable: typeof import("@workspace/db").staffMembersTable;
let zoomConnectionsTable: typeof import("@workspace/db").zoomConnectionsTable;
let restoreTransaction: (() => void) | undefined;
let connection: Record<string, unknown> | null = null;
let deleteCalls = 0;
let auditValues: Record<string, unknown> | undefined;
let providerCalls: Array<{ url: string; init?: RequestInit }> = [];

function replaceDbMethod(
  name: "select" | "insert" | "delete",
  replacement: (...args: never[]) => unknown,
): () => void {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, {
    configurable: true,
    writable: true,
    value: replacement,
  });
  return () => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  };
}

function coordinator() {
  return {
    id: 7,
    clerkUserId: "test-coordinator",
    email: "coordinator@example.test",
    role: "coordinator",
    status: "active",
    invitationEmailStatus: null,
    bookingProvider: "calendly",
    calendlyBookingUrl: null,
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    createdAt: new Date(),
  };
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.SESSION_SECRET = "zoom-disconnect-test-secret";
  process.env.ZOOM_CLIENT_ID = "test-zoom-client";
  process.env.ZOOM_CLIENT_SECRET = "test-zoom-client-secret";
  process.env.JUSOOR_BOOTSTRAP_COORDINATOR_EMAIL = "coordinator@example.test";
  process.env.NODE_ENV = "test";

  const database = await import("@workspace/db");
  db = database.db;
  staffMembersTable = database.staffMembersTable;
  zoomConnectionsTable = database.zoomConnectionsTable;
  const { default: zoomRouter } = await import("../src/routes/zoom");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const auth = Object.assign(
      () => ({ userId: "test-coordinator", tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, {
      auth,
      log: {
        warn: () => undefined,
        error: () => undefined,
        info: () => undefined,
      },
    });
    next();
  });
  app.use("/api/zoom", zoomRouter);
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

async function requestDisconnect(): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/zoom/disconnect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

test("revokes Zoom authorization before removing the local connection", async () => {
  const restoreSelect = replaceDbMethod("select", (() => {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where() {
        return query;
      },
      limit: async () => table === staffMembersTable
        ? [coordinator()]
        : table === zoomConnectionsTable
          ? connection ? [connection] : []
          : [],
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      if (values.provider === "zoom") connection = { ...values, id: 12 };
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: async () => undefined,
      };
    },
  })) as (...args: never[]) => unknown);
  const { integrationDisconnectAuditEventsTable } = await import("@workspace/db");
  const tx = {
    select: () => {
      let table: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          return query;
        },
        where: () => query,
        limit: async () => table === zoomConnectionsTable && connection ? [connection] : [],
      };
      return query;
    },
    delete: (table: unknown) => ({
      where: async () => {
        deleteCalls += 1;
        assert.equal(table, zoomConnectionsTable);
        assert.equal(providerCalls.length, 1);
        connection = null;
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        assert.equal(table, integrationDisconnectAuditEventsTable);
        auditValues = values;
      },
    }),
  };
  const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  });
  const restoreDelete = () => {
    if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
    else Reflect.deleteProperty(db, "transaction");
  };
  restoreTransaction = restoreDelete;
  const { saveZoomConnection } = await import("../src/lib/zoom");
  deleteCalls = 0;
  auditValues = undefined;
  providerCalls = [];
  await saveZoomConnection({
    accessToken: "zoom-access-token",
    refreshToken: "zoom-refresh-token",
    expiresIn: 3600,
  }, 7);
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    providerCalls.push({ url: String(input), init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const response = await requestDisconnect();
    assert.equal(response.status, 204);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0]?.url, "https://zoom.us/oauth/revoke");
    assert.match(String(providerCalls[0]?.init?.body), /zoom-refresh-token/);
    assert.equal(deleteCalls, 1);
    assert.equal(connection, null);
    assert.deepEqual(auditValues, {
      integrationType: "shared_zoom",
      initiatorType: "admin",
      actorStaffId: 7,
      actorEmail: "coordinator@example.test",
      affectedStaffId: null,
      affectedAccountEmail: null,
      programId: null,
      programName: null,
    });
  } finally {
    restoreDelete();
    restoreInsert();
    restoreSelect();
    globalThis.fetch = nativeFetch;
  }
});

test("keeps the local Zoom connection when provider revocation fails", async () => {
  const restoreSelect = replaceDbMethod("select", (() => {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where() {
        return query;
      },
      limit: async () => table === staffMembersTable
        ? [coordinator()]
        : table === zoomConnectionsTable
          ? connection ? [connection] : []
          : [],
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      if (values.provider === "zoom") connection = { ...values, id: 13 };
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: async () => undefined,
      };
    },
  })) as (...args: never[]) => unknown);
  deleteCalls = 0;
  auditValues = undefined;
  const { saveZoomConnection } = await import("../src/lib/zoom");
  deleteCalls = 0;
  await saveZoomConnection({
    accessToken: "zoom-access-token",
    refreshToken: "zoom-refresh-token",
    expiresIn: 3600,
  }, 7);
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;

  try {
    const response = await requestDisconnect();
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /connection was not changed/i);
    assert.equal(deleteCalls, 0);
    assert.ok(connection);
  } finally {
    restoreInsert();
    restoreSelect();
    globalThis.fetch = nativeFetch;
  }
});
