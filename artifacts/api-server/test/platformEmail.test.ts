import assert from "node:assert/strict";
import test from "node:test";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import type { ProgramEmailBranding } from "../src/lib/email-branding";
import { sendPlatformEmail } from "../src/lib/platform-email";

const testBranding: ProgramEmailBranding = {
  brandName: "Future Founders",
  logoUrl: null,
  primaryColor: "#28665a",
  accentColor: "#d98a46",
};

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
    sendPlatformEmail(email({ recipients: [] }), connectors, async () => testBranding),
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
    async () => testBranding,
  );

  const sends = requests.filter(request => request.path.endsWith("/messages/send"));
  assert.equal(sends.length, 2);
  const firstRaw = (sends[0]?.body as { raw: string }).raw;
  const decoded = Buffer.from(firstRaw, "base64url").toString("utf8");
  const encodedBrand = Buffer.from(testBranding.brandName, "utf8").toString("base64");
  assert.ok(decoded.includes(
    `From: =?UTF-8?B?${encodedBrand}?= <sender@example.test>`,
  ));
  assert.match(decoded, /To: one@example\.test/);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
  assert.match(decoded, /multipart\/alternative/);
  assert.match(decoded, /Message-ID: <[a-f0-9]{64}@platform\.invalid>/);
  assert.equal(
    Buffer.from(firstRaw, "base64url").toString("base64url"),
    firstRaw,
  );
});

test("Gmail From display name follows the configured brand and safely encodes Unicode", async () => {
  const { connectors, requests } = fakeConnectors();
  const brandName = "North & Main أعمال";
  await sendPlatformEmail(
    email(),
    connectors,
    async () => ({ ...testBranding, brandName }),
  );

  const send = requests.find(request => request.path.endsWith("/messages/send"));
  const raw = (send?.body as { raw: string }).raw;
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const encodedBrand = Buffer.from(brandName, "utf8").toString("base64");
  const fromHeaders = decoded
    .split("\r\n")
    .filter(header => header.startsWith("From:"));

  assert.deepEqual(fromHeaders, [
    `From: =?UTF-8?B?${encodedBrand}?= <sender@example.test>`,
  ]);
});

test("Gmail sender skips a recipient already found in Sent on retry", async () => {
  const { connectors, requests } = fakeConnectors({ sent: true });
  await sendPlatformEmail(email(), connectors, async () => testBranding);

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
    sendPlatformEmail(email(), connectors, async () => testBranding),
    /Gmail profile lookup returned HTTP 403/i,
  );
  assert.equal(
    requests.filter(request => request.path.endsWith("/messages/send")).length,
    0,
  );
});
