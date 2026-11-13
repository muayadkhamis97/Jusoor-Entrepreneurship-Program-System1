import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
const { runEmailHealth } = await import("../src/lib/email-health");
const { createEmailHealthRouter } = await import("../src/routes/emailHealth");
const { createGmailEmailTransport } = await import("../src/lib/platform-email");
const { announcementEmailBackoffMs } = await import("../src/lib/announcement-email");

const branding = async () => ({
  brandName: "Test", logoUrl: null, primaryColor: "#28665a", accentColor: "#d98a46",
});
function fakeConnector(options: { lookupStatus?: number; rewrite?: boolean; sendError?: boolean } = {}) {
  const calls: string[] = [];
  let customMessageId = "";
  return {
    calls,
    async proxy(_name: string, path: string, init?: { body?: unknown }) {
      calls.push(path);
      if (path.endsWith("/profile")) return Response.json({ emailAddress: "sender@example.test" });
      if (path.includes("/messages?")) {
        return options.lookupStatus
          ? Response.json({ error: { status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }], message: "private-token recipient@example.test" } }, { status: options.lookupStatus })
          : Response.json({});
      }
      if (path.endsWith("/messages/send")) {
        if (options.sendError) throw new TypeError("private body or token");
        const mime = Buffer.from((init?.body as { raw: string }).raw, "base64url").toString("utf8");
        customMessageId = /^Message-ID: (.+)$/mi.exec(mime)?.[1]?.trim() ?? "";
        return Response.json({ id: "gmail123" });
      }
      return Response.json({ payload: { headers: [{ name: "Message-ID", value: options.rewrite ? "<changed@gmail.test>" : customMessageId }] } });
    },
  };
}

test("read-only Gmail health runs profile and bounded lookup without sending", async () => {
  const connector = fakeConnector();
  const report = await runEmailHealth({ requestId: randomUUID(), sendTest: false }, undefined, connector);
  assert.deepEqual(report.steps.map(step => [step.step, step.status]), [["profile", "ok"], ["lookup", "ok"], ["send", "skipped"]]);
  assert.match(connector.calls[1], /maxResults=1/);
  assert.ok(!connector.calls.some(path => path.endsWith("/send")));
  assert.equal(report.messageIdPreserved, null);
});

test("lookup 403 reports the exact safe reason and blocks sending and connection recovery", async () => {
  const connector = fakeConnector({ lookupStatus: 403 });
  const report = await runEmailHealth({ requestId: randomUUID(), sendTest: true }, "admin@example.test", connector, branding);
  assert.deepEqual(report.steps[1], {
    step: "lookup", status: "failed", httpStatus: 403, reason: "insufficientPermissions",
    failureKind: "gmail_needs_reconnect",
  });
  assert.equal(report.steps[2].status, "skipped");
  assert.ok(!connector.calls.some(path => path.endsWith("/send")));
  assert.doesNotMatch(JSON.stringify(report), /private-token|recipient@example|admin@example|sender@example/);
  assert.equal((await createGmailEmailTransport(connector, branding).checkConnection()).kind, "needs_reconnect");
});

for (const rewrite of [false, true]) {
  test(`optional health send reads Message-ID metadata and detects rewrite=${rewrite}`, async () => {
    const connector = fakeConnector({ rewrite });
    const report = await runEmailHealth({ requestId: randomUUID(), sendTest: true }, "admin@example.test", connector, branding);
    assert.equal(report.steps.find(step => step.step === "send")?.status, "ok");
    assert.equal(report.steps.find(step => step.step === "metadata")?.status, "ok");
    assert.equal(report.messageIdPreserved, !rewrite);
    assert.equal(connector.calls.filter(path => path.endsWith("/send")).length, 1);
    assert.match(connector.calls.at(-1)!, /format=metadata&metadataHeaders=Message-ID/);
  });
}

test("an ambiguous health send is reported without a second send", async () => {
  const connector = fakeConnector({ sendError: true });
  const report = await runEmailHealth({ requestId: randomUUID(), sendTest: true }, "admin@example.test", connector, branding);
  assert.equal(report.steps.find(step => step.step === "send")?.failureKind, "delivery_outcome_unknown");
  assert.equal(connector.calls.filter(path => path.endsWith("/send")).length, 1);
  assert.ok(!report.steps.some(step => step.step === "metadata"));
  assert.doesNotMatch(JSON.stringify(report), /private body|token/);
});

test("announcement backoff grows from five to fifteen minutes and then stays capped at one hour", () => {
  assert.deepEqual([0, 1, 2, 3, 20].map(announcementEmailBackoffMs), [300_000, 900_000, 3_600_000, 3_600_000, 3_600_000]);
});

test("health endpoint rejects non-Admins and only sends to the server-verified own email", async t => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.get("x-test-role")) res.locals.staff = { id: 7, role: req.get("x-test-role") };
    next();
  });
  let healthCalls = 0;
  let actualEmail: string | undefined;
  app.use(createEmailHealthRouter(async (_input, email) => {
    healthCalls++;
    actualEmail = email;
    return { steps: [], messageIdPreserved: null };
  }, async req => req.get("x-test-verified") ? "verified-admin@example.test" : undefined));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = (server.address() as { port: number }).port;
  const post = (role?: string, sendTest = false, verified = false, extra = {}) => fetch(`http://127.0.0.1:${port}/staff/email-health`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(role ? { "x-test-role": role } : {}), ...(verified ? { "x-test-verified": "true" } : {}) },
    body: JSON.stringify({ sendTest, requestId: randomUUID(), ...extra }),
  });
  for (const role of [undefined, "staff", "mentor", "judge", "trainer"]) assert.equal((await post(role)).status, 403);
  assert.equal(healthCalls, 0);
  assert.equal((await post("coordinator", true)).status, 403);
  assert.equal(healthCalls, 0);
  assert.equal((await post("coordinator")).status, 200);
  assert.equal(actualEmail, undefined);
  assert.equal((await post("coordinator", true, true, { recipient: "attacker@example.test" })).status, 200);
  assert.equal(actualEmail, "verified-admin@example.test");
});
