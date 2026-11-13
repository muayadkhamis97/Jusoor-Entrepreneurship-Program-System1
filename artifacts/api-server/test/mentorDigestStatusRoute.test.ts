import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;
let selectedRows: Array<Record<string, unknown>> = [];
let selectCalls = 0;
let updateCalls = 0;
let whereCalls = 0;
let makeMessageId: (key: string, recipient: string) => string;

function replaceDbMethod(
  name: "select" | "update",
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

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  db = (await import("@workspace/db")).db;
  makeMessageId = (await import("../src/lib/platform-email")).stableMessageId;
  const { default: router } = await import("../src/routes/staff");
  restoreSelect = replaceDbMethod("select", (() => {
    selectCalls += 1;
    const query = {
      from() { return this; },
      innerJoin() { return this; },
      where() {
        whereCalls += 1;
        return this;
      },
      limit: async () => selectedRows,
    };
    return query;
  }) as (...args: never[]) => unknown);
  restoreUpdate = replaceDbMethod("update", (() => {
    updateCalls += 1;
    throw new Error("Digest status reads must not update delivery records.");
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const id = Number(req.header("x-staff-id") ?? 1);
    res.locals.staff = {
      id,
      email: `coordinator-${id}@example.test`,
      role: req.header("x-staff-role") ?? "coordinator",
    };
    next();
  });
  app.use("/api", router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreUpdate?.();
  restoreSelect?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

async function request(path: string, role = "coordinator", init: RequestInit = {}): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const headers = new Headers(init.headers);
  headers.set("x-staff-role", role);
  headers.set("x-staff-id", "27");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, {
    ...init,
    headers,
  });
}

test("reads failed and uncertain digest states without exposing errors or sending email", async () => {
  for (const status of ["failed", "uncertain"]) {
    selectCalls = 0;
    updateCalls = 0;
    whereCalls = 0;
    selectedRows = [{
      calendarDate: "2026-11-12",
      status,
      attempts: 2,
      lastAttemptAt: new Date("2026-11-12T08:00:00.000Z"),
      sentAt: null,
      recipientEmail: "coordinator-27@example.test",
      lastError: "Internal provider detail must not be returned",
    }];

    const response = await request("/api/staff/mentor-follow-up-digest-status?calendarDate=2026-11-12");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), [{
      calendarDate: "2026-11-12",
      status,
      attempts: 2,
      lastAttemptAt: "2026-11-12T08:00:00.000Z",
      sentAt: null,
      messageId: `<${makeMessageId("jusoor-mentor-follow-up-digest-27-2026-11-12", "coordinator-27@example.test")}>`,
    }]);
    assert.equal(selectCalls, 1);
    assert.equal(whereCalls, 1);
    assert.equal(updateCalls, 0);
  }
});

test("requires a valid date and coordinator access before reading digest records", async () => {
  selectCalls = 0;
  const invalidDate = await request("/api/staff/mentor-follow-up-digest-status?calendarDate=2026-02-30");
  assert.equal(invalidDate.status, 400);
  const nonCoordinator = await request(
    "/api/staff/mentor-follow-up-digest-status?calendarDate=2026-11-12",
    "staff",
  );
  assert.equal(nonCoordinator.status, 403);
  assert.equal(selectCalls, 0);
});

test("requires Gmail Sent verification before attempting to reconcile a digest", async () => {
  selectCalls = 0;
  updateCalls = 0;
  const response = await request(
    "/api/staff/mentor-follow-up-digest-status/2026-11-12/reconcile",
    "coordinator",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deliveryFound: false }) },
  );
  assert.equal(response.status, 400);
  assert.equal(selectCalls, 0);
  assert.equal(updateCalls, 0);
  const denied = await request(
    "/api/staff/mentor-follow-up-digest-status/2026-11-12/reconcile",
    "staff",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gmailChecked: true, deliveryFound: false }) },
  );
  assert.equal(denied.status, 403);
  assert.equal(selectCalls, 0);
});

test("returns an empty list when no digest delivery exists for the selected date", async () => {
  selectedRows = [];
  const response = await request("/api/staff/mentor-follow-up-digest-status?calendarDate=2026-11-13");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});
