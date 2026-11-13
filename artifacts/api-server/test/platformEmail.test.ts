import assert from "node:assert/strict";
import test from "node:test";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import type { ProgramEmailBranding } from "../src/lib/email-branding";
import {
  PlatformEmailSendUncertainError,
  platformEmailFailureDiagnostics,
  sendPlatformEmail,
} from "../src/lib/platform-email";
import { OutboundHttpTimeoutError } from "../src/lib/outbound-http";

const testBranding: ProgramEmailBranding = {
  brandName: "Future Founders",
  logoUrl: null,
  primaryColor: "#28665a",
  accentColor: "#d98a46",
};

function fakeConnectors(options?: {
  sent?: boolean;
  profileStatus?: number;
  sendStatus?: number;
  sendError?: Error;
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
      if (options?.sendError) throw options.sendError;
      return new Response(JSON.stringify({ id: "sent-message" }), { status: options?.sendStatus ?? 200 });
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

test("email failure diagnostics preserve safe provider details without logging raw messages", () => {
  assert.deepEqual(
    platformEmailFailureDiagnostics(new Error("Gmail profile lookup returned HTTP 403.")),
    {
      failureKind: "gmail_http_error",
      operation: "profile_lookup",
      providerStatus: 403,
    },
  );

  assert.deepEqual(
    platformEmailFailureDiagnostics(new PlatformEmailSendUncertainError(
      "Gmail delivery outcome is unknown.",
      { httpStatus: 503 },
    )),
    {
      failureKind: "delivery_outcome_unknown",
      operation: "send",
      providerStatus: 503,
    },
  );

  const transportFailure = Object.assign(
    new Error("access-token=private recipient=founder@example.test"),
    { cause: Object.assign(new Error("socket failed"), { code: "ECONNRESET" }) },
  );
  const diagnostics = platformEmailFailureDiagnostics(transportFailure);
  assert.deepEqual(diagnostics, {
    failureKind: "unclassified_email_error",
    errorName: "Error",
    errorCode: "ECONNRESET",
  });
  assert.doesNotMatch(JSON.stringify(diagnostics), /access-token|founder@example\.test|private/);

  assert.deepEqual(
    platformEmailFailureDiagnostics(Object.assign(new Error("connection failed"), { code: "privatecredentialvalue" })),
    { failureKind: "unclassified_email_error", errorName: "Error" },
    "arbitrary connector strings must not be treated as safe diagnostic codes",
  );
});

test("Gmail send failures retain safe HTTP and network diagnostics", async () => {
  const httpFailure = fakeConnectors({ sendStatus: 503 });
  await assert.rejects(
    sendPlatformEmail(email(), httpFailure.connectors, async () => testBranding),
    error => {
      assert.deepEqual(platformEmailFailureDiagnostics(error), {
        failureKind: "delivery_outcome_unknown",
        operation: "send",
        providerStatus: 503,
      });
      return true;
    },
  );

  const networkFailure = fakeConnectors({
    sendError: Object.assign(new Error("sensitive provider response"), { code: "ECONNRESET" }),
  });
  await assert.rejects(
    sendPlatformEmail(email(), networkFailure.connectors, async () => testBranding),
    error => {
      assert.deepEqual(platformEmailFailureDiagnostics(error), {
        failureKind: "delivery_outcome_unknown",
        operation: "send",
        errorCode: "ECONNRESET",
      });
      assert.doesNotMatch(JSON.stringify(platformEmailFailureDiagnostics(error)), /sensitive provider response/);
      return true;
    },
  );
});

test("Gmail profile lookup stops before sending when the connector call times out", async () => {
  const connectors = {
    proxy: async () => new Promise<Response>(() => {}),
  } as unknown as Pick<ReplitConnectors, "proxy">;

  await assert.rejects(
    sendPlatformEmail(
      email(),
      connectors,
      async () => testBranding,
      { profileMs: 15 },
    ),
    error => {
      assert.ok(error instanceof OutboundHttpTimeoutError);
      assert.equal(error.code, "ETIMEDOUT");
      return true;
    },
  );
});

test("Gmail send timeout stays uncertain and a later attempt checks Sent before sending again", async () => {
  let sendCalls = 0;
  let sentLookups = 0;
  let providerAcceptedMessage = false;
  const connectors = {
    async proxy(_connector: string, path: string) {
      if (path.endsWith("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "sender@example.test" }));
      }
      if (path.includes("/messages?")) {
        sentLookups += 1;
        return new Response(JSON.stringify(
          providerAcceptedMessage ? { messages: [{ id: "provider-message" }] } : {},
        ));
      }
      if (path.endsWith("/messages/send")) {
        sendCalls += 1;
        providerAcceptedMessage = true;
        return new Promise<Response>(() => {});
      }
      throw new Error("Unexpected test connector request.");
    },
  } as unknown as Pick<ReplitConnectors, "proxy">;

  await assert.rejects(
    sendPlatformEmail(
      email(),
      connectors,
      async () => testBranding,
      { sendMs: 15, sentLookupMs: 15 },
    ),
    error => {
      assert.ok(error instanceof PlatformEmailSendUncertainError);
      assert.deepEqual(platformEmailFailureDiagnostics(error), {
        failureKind: "delivery_outcome_unknown",
        operation: "send",
        errorCode: "ETIMEDOUT",
      });
      assert.doesNotMatch(error.message, /provider-message|sender@example\.test/);
      return true;
    },
  );
  assert.equal(sendCalls, 1);

  await sendPlatformEmail(
    email(),
    connectors,
    async () => testBranding,
    { sendMs: 15, sentLookupMs: 15 },
  );
  assert.equal(sentLookups, 2);
  assert.equal(sendCalls, 1, "retry must not resend before checking Gmail Sent");
});

test("Gmail production connector requests receive an abort signal", async () => {
  const requestUrls: string[] = [];
  const receivedSignals: (AbortSignal | null)[] = [];
  const connectors = {
    proxy: ReplitConnectors.prototype.proxy,
    getProxyUrl: () => "https://connectors.example.test/api/v2/proxy",
    createProxyFetch: (_connector: string) => async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      requestUrls.push(String(input));
      receivedSignals.push(init?.signal ?? null);
      return new Response(JSON.stringify({ emailAddress: "sender@example.test" }));
    },
  } as unknown as NonNullable<Parameters<typeof sendPlatformEmail>[1]>;

  await sendPlatformEmail(
    email(),
    connectors,
    async () => testBranding,
  );

  assert.equal(
    requestUrls[0],
    "https://connectors.example.test/api/v2/proxy/gmail/v1/users/me/profile",
  );
  assert.ok(requestUrls.some(url => url.endsWith("/gmail/v1/users/me/messages/send")));
  assert.ok(receivedSignals.length > 0);
  assert.ok(receivedSignals.every(signal => signal instanceof AbortSignal));
});
