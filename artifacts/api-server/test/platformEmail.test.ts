import assert from "node:assert/strict";
import test from "node:test";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import { sendPlatformEmail } from "../src/lib/platform-email";

function fakeConnectors(options?: {
  sent?: boolean;
  profileStatus?: number;
}) {
  const requests: { path: string; method?: string; body?: unknown }[] = [];
  const connectors = {
    async proxy(_connector: string, path: string, config?: { method?: string; body?: unknown }) {
      requests.push({ path, method: config?.method, body: config?.body });
      if (path.endsWith("/profile")) {
        return new Response(
          JSON.stringify({ emailAddress: "sender@example.test" }),
          { status: options?.profileStatus ?? 200 },
        );
      }
      if (path.includes("/messages?")) {
        return new Response(
          JSON.stringify(options?.sent ? { messages: [{ id: "already-sent" }] } : {}),
        );
      }
      return new Response(JSON.stringify({ id: "sent-message" }));
    },
  } as unknown as Pick<ReplitConnectors, "proxy">;
  return { connectors, requests };
}

function email(overrides: Partial<Parameters<typeof sendPlatformEmail>[0]> = {}) {
  return {
    recipients: ["founder@example.test"],
    subject: "Reminder: Weekly module",
    text: "Complete the weekly module.",
    html: "<p>Complete the weekly module.</p>",
    idempotencyKey: "reminder-42",
    ...overrides,
  };
}

test("Gmail sender rejects empty recipients before calling the connector", async () => {
  const { connectors, requests } = fakeConnectors();
  await assert.rejects(
    sendPlatformEmail(email({ recipients: [] }), connectors),
    /email has no recipients/i,
  );
  assert.equal(requests.length, 0);
});

test("Gmail sender sends an individual UTF-8 MIME email per recipient", async () => {
  const { connectors, requests } = fakeConnectors();
  await sendPlatformEmail(
    email({
      recipients: ["one@example.test", "two@example.test"],
      subject: "تذكير",
      text: "نص التذكير",
      html: "<p>نص التذكير</p>",
    }),
    connectors,
  );

  const sends = requests.filter(request => request.path.endsWith("/messages/send"));
  assert.equal(sends.length, 2);
  const firstRaw = (sends[0]?.body as { raw: string }).raw;
  const decoded = Buffer.from(firstRaw, "base64url").toString("utf8");
  assert.match(decoded, /From: sender@example\.test/);
  assert.match(decoded, /To: one@example\.test/);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
  assert.match(decoded, /multipart\/alternative/);
  assert.match(decoded, /Message-ID: <[a-f0-9]{64}@platform\.invalid>/);
  assert.equal(
    Buffer.from(firstRaw, "base64url").toString("base64url"),
    firstRaw,
  );
});

test("Gmail sender skips a recipient already found in Sent on retry", async () => {
  const { connectors, requests } = fakeConnectors({ sent: true });
  await sendPlatformEmail(email(), connectors);

  assert.equal(
    requests.filter(request => request.path.endsWith("/messages/send")).length,
    0,
  );
  assert.ok(requests.some(request =>
    request.path.includes("rfc822msgid%3A") && request.path.includes("in%3Asent"),
  ));
});

test("Gmail sender stops if the connected mailbox profile cannot be read", async () => {
  const { connectors, requests } = fakeConnectors({ profileStatus: 403 });
  await assert.rejects(
    sendPlatformEmail(email(), connectors),
    /Gmail profile lookup returned HTTP 403/i,
  );
  assert.equal(
    requests.filter(request => request.path.endsWith("/messages/send")).length,
    0,
  );
});
