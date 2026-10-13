import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { after, before, test } from "node:test";

const nativeFetch = globalThis.fetch;
let server: Server;
let role: "coordinator" | "staff" = "staff";

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";

  const [{ default: analyticsRouter }, { default: grantsRouter }, { default: pitchesRouter }] = await Promise.all([
    import("../src/routes/analytics"),
    import("../src/routes/grants"),
    import("../src/routes/pitches"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, {
      staff: { id: 1, email: "analytics-test@example.com", role, status: "active" },
    });
    next();
  });
  app.use("/api", analyticsRouter);
  app.use("/api", grantsRouter);
  app.use("/api", pitchesRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path: string, init?: RequestInit): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, init);
}

test("analytics, grant ledger, and impact routes reject non-coordinators", async () => {
  role = "staff";
  const responses = await Promise.all([
    request("/api/analytics"),
    request("/api/analytics/attendance/1"),
    request("/api/analytics/kpis?programId=1"),
    request("/api/grants"),
    request("/api/grants/1/receipts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    request("/api/pitches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessId: 1,
        eventType: "demo_day",
        eventDate: "2026-10-13",
        grantDecision: "awarded",
        grantAmount: 1000,
      }),
    }),
    request("/api/pitches/1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantAmount: 1000 }),
    }),
    request("/api/analytics/kpis/1/values", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: [] }),
    }),
  ]);
  assert.deepEqual(responses.map(({ status }) => status), [403, 403, 403, 403, 403, 403, 403, 403]);
});

test("analytics routes validate date and identifier inputs before database access", async () => {
  role = "coordinator";
  const impossibleDate = await request("/api/analytics?from=2026-02-31&to=2026-03-01");
  const invalidSession = await request("/api/analytics/attendance/not-a-session");
  const invalidProgram = await request("/api/analytics/kpis?programId=not-a-program");
  const invalidGrant = await request("/api/grants/not-a-pitch/receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "received", amount: 100, receivedOn: "2026-03-01" }),
  });
  assert.equal(impossibleDate.status, 400);
  assert.equal(invalidSession.status, 400);
  assert.equal(invalidProgram.status, 400);
  assert.equal(invalidGrant.status, 400);
});
