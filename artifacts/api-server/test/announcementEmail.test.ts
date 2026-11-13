import assert from "node:assert/strict";
import test from "node:test";
import type { ReplitConnectors } from "@replit/connectors-sdk";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
const { announcementEmailContent, normalizedAnnouncementRecipients, summarizeAnnouncementEmail } = await import("../src/lib/announcement-email");
const {
  createGmailEmailTransport,
  sendPlatformEmail,
  PlatformEmailSendUncertainError,
} = await import("../src/lib/platform-email");

test("announcement recipients are normalized and deduplicated across accepted applications", () => {
  assert.deepEqual(normalizedAnnouncementRecipients([
    { email: "Founder@example.test " }, { email: "founder@EXAMPLE.test" }, { email: "other@example.test" },
  ]), ["founder@example.test", "other@example.test"]);
});

test("announcement emails escape user content and retain one stable key across retries", () => {
  const message = announcementEmailContent({ id: 14, title: "Important\r\nUpdate", body: "<script>bad()</script>\n& details" }, "one@example.test");
  assert.equal(message.idempotencyKey, "jusoor-announcement-14");
  assert.equal(message.subject, "Important Update");
  assert.match(message.html, /&lt;script&gt;/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.text, /<script>bad\(\)<\/script>/);
  assert.deepEqual(message.recipients, ["one@example.test"]);
});

test("delivery summaries distinguish zero recipients, safe failures and ambiguous or interrupted sends", () => {
  assert.equal(summarizeAnnouncementEmail(false, []).state, "queued");
  assert.equal(summarizeAnnouncementEmail(true, []).state, "complete");
  const result = summarizeAnnouncementEmail(true, [
    { status: "sent", attemptedAt: null }, { status: "failed", attemptedAt: null },
    { status: "uncertain", attemptedAt: null }, { status: "sending", attemptedAt: new Date(0) },
    { status: "skipped", attemptedAt: null },
  ], 20 * 60_000);
  assert.deepEqual(result, { state: "needs_attention", sent: 1, failed: 1, invalidRecipients: 0, uncertain: 2, skipped: 1, pending: 0, canRetry: true });
  assert.equal(summarizeAnnouncementEmail(true, [{ status: "uncertain", attemptedAt: null }]).canRetry, false);
});

test("Gmail transport distinguishes quota, reconnect, invalid recipient, and ambiguous send outcomes", async () => {
  const branding = async () => ({
    brandName: "Test",
    logoUrl: null,
    primaryColor: "#28665a",
    accentColor: "#d98a46",
  });
  const message = {
    recipients: ["one@example.test"],
    subject: "Test",
    text: "Test",
    html: "<p>Test</p>",
    idempotencyKey: "typed-result",
  };
  const connectorFor = (sendResponse: () => Promise<Response> | Response, profileStatus = 200) => ({
    async proxy(_name: string, path: string) {
      if (path.endsWith("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "sender@example.test" }), { status: profileStatus });
      }
      if (path.includes("/messages?")) return new Response("{}");
      return sendResponse();
    },
  });

  const quota = createGmailEmailTransport(
    connectorFor(() => new Response(JSON.stringify({
      error: { errors: [{ reason: "dailyLimitExceeded" }] },
    }), { status: 403 })),
    branding,
  );
  const quotaResult = await quota.send(message);
  assert.equal(quotaResult.kind, "quota");
  if (quotaResult.kind === "quota") assert.equal(quotaResult.retryAfterMs, 24 * 60 * 60_000);

  const disconnected = createGmailEmailTransport(connectorFor(
    () => new Response("{}"),
    401,
  ), branding);
  assert.equal((await disconnected.checkConnection()).kind, "needs_reconnect");
  assert.equal((await disconnected.send(message)).kind, "needs_reconnect");

  const invalidRecipient = createGmailEmailTransport(
    connectorFor(() => new Response(JSON.stringify({
      error: { errors: [{ reason: "invalidArgument" }] },
    }), { status: 400 })),
    branding,
  );
  assert.equal((await invalidRecipient.send(message)).kind, "invalid_recipient");

  const ambiguous = createGmailEmailTransport(
    connectorFor(() => { throw new TypeError("connection dropped"); }),
    branding,
  );
  assert.equal((await ambiguous.send(message)).kind, "ambiguous");
});

for (const failure of ["network", 503, 408, 429, 403] as const) {
  test(`Gmail ${failure} failure is classified before deciding whether retry is safe`, async () => {
    const connector = {
      async proxy(_name: string, path: string) {
        if (path.endsWith("/profile")) return new Response(JSON.stringify({ emailAddress: "sender@example.test" }));
        if (path.includes("/messages?")) return new Response("{}");
        if (failure === "network") throw new Error("Connection lost");
        return new Response("{}", { status: failure });
      },
    } as unknown as Pick<ReplitConnectors, "proxy">;
    await assert.rejects(sendPlatformEmail({
      recipients: ["one@example.test"], subject: "Test", text: "Test", html: "<p>Test</p>", idempotencyKey: "one",
    }, connector, async () => ({ brandName: "Test", logoUrl: null, primaryColor: "#28665a", accentColor: "#d98a46" })),
    error => {
      assert.equal(error instanceof PlatformEmailSendUncertainError, failure === "network" || failure === 503 || failure === 408);
      return true;
    });
  });
}
