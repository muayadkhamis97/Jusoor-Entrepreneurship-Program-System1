import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { getParticipantSupportForBusiness } from "../src/lib/participantBookingAccess";
import {
  isCalendlyOAuthStateValid,
  sealCalendlyOAuthState,
  type CalendlyOAuthState,
} from "../src/lib/calendlyOAuthState";
import { requireRole } from "../src/middlewares/requireRole";

const nativeFetch = globalThis.fetch;
const clientCode = "sensitive-authorization-code";
const accessToken = "sensitive-calendly-access-token";
const logEntries: unknown[] = [];
let calendlyRouter: express.Router;
let server: Server;
let db: typeof import("@workspace/db").db;

function validState(overrides: Partial<CalendlyOAuthState> = {}): CalendlyOAuthState {
  return {
    staffId: 71,
    state: "expected-state-value",
    codeVerifier: "test-code-verifier",
    origin: "http://localhost",
    redirectUri: "http://localhost/api/mentor/calendly/callback",
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function replaceDbMethod(name: "select" | "update", replacement: (...args: never[]) => unknown) {
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
  process.env.SESSION_SECRET = "unit-test-session-secret";
  process.env.CALENDLY_CLIENT_ID = "test-client";
  process.env.CALENDLY_CLIENT_SECRET = "test-client-secret";
  process.env.NODE_ENV = "test";

  db = (await import("@workspace/db")).db;
  const { default: router } = await import("../src/routes/calendlyOAuth");
  calendlyRouter = router as express.Router;
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      log: {
        warn: (...args: unknown[]) => logEntries.push(args),
        error: (...args: unknown[]) => logEntries.push(args),
        info: (...args: unknown[]) => logEntries.push(args),
      },
    });
    next();
  });
  app.use("/api/mentor/calendly", calendlyRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function callbackRequest(
  state: CalendlyOAuthState,
  query: string,
): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const cookie = sealCalendlyOAuthState(state);
  return nativeFetch(`http://127.0.0.1:${address.port}/api/mentor/calendly/callback?${query}`, {
    redirect: "manual",
    headers: { cookie: `jusoor_calendly_oauth=${cookie}` },
  });
}

test("rejects expired and mismatched OAuth state before contacting Calendly", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return responseJson({});
  }) as typeof fetch;

  const expired = await callbackRequest(
    validState({ expiresAt: Date.now() - 1 }),
    "state=expected-state-value&code=sensitive-authorization-code",
  );
  assert.equal(expired.status, 400);
  assert.match(await expired.text(), /expired or could not be verified/);

  const mismatched = await callbackRequest(
    validState(),
    "state=attacker-supplied-state&code=sensitive-authorization-code",
  );
  assert.equal(mismatched.status, 400);
  assert.equal(fetchCalls, 0);
  assert.equal(isCalendlyOAuthStateValid(validState(), "wrong-state"), false);
});

test("handles a Calendly provider error without echoing provider details", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return responseJson({});
  }) as typeof fetch;
  logEntries.length = 0;

  const response = await callbackRequest(
    validState(),
    "state=expected-state-value&error=access_denied&error_description=private-provider-detail",
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://localhost/mentor?calendly=cancelled");
  assert.equal(fetchCalls, 0);
  assert.doesNotMatch(response.headers.get("location") ?? "", /access_denied|private-provider-detail/);
  assert.deepEqual(logEntries, []);
});

test("does not expose OAuth codes or provider response secrets when token exchange fails", async () => {
  globalThis.fetch = (async () => responseJson({
    error: "invalid_grant",
    access_token: accessToken,
  }, 400)) as typeof fetch;
  logEntries.length = 0;

  const response = await callbackRequest(
    validState(),
    `state=expected-state-value&code=${clientCode}`,
  );
  const redirect = response.headers.get("location") ?? "";

  assert.equal(response.status, 302);
  assert.equal(redirect, "http://localhost/mentor?calendly=error");
  assert.doesNotMatch(redirect, new RegExp(`${clientCode}|${accessToken}|invalid_grant`));
  assert.doesNotMatch(JSON.stringify(logEntries), new RegExp(`${clientCode}|${accessToken}|invalid_grant`));
});

test("exchanges a code, saves only mentor connection data, and keeps credentials out of responses and logs", async () => {
  const persistedValues: Record<string, unknown>[] = [];
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const mentor = {
    id: 71,
    webhookTokenEncrypted: null,
    webhookSecretEncrypted: null,
    webhookSubscriptionUri: null,
  };
  const restoreSelect = replaceDbMethod("select", (() => {
    const query = {
      from() { return this; },
      where() { return this; },
      limit: async () => [mentor],
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    const query = {
      set(values: Record<string, unknown>) {
        persistedValues.push(values);
        return this;
      },
      where() { return this; },
      returning: async () => [{ id: mentor.id }],
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    if (url === "https://auth.calendly.com/oauth/token") {
      return responseJson({ access_token: accessToken });
    }
    if (url === "https://api.calendly.com/users/me") {
      return responseJson({
        resource: {
          scheduling_url: "https://calendly.com/mentor-one",
          uri: "https://api.calendly.com/users/mentor-one",
          current_organization: "https://api.calendly.com/organizations/one",
        },
      });
    }
    if (url === "https://api.calendly.com/webhook_subscriptions") {
      return responseJson({
        resource: { uri: "https://api.calendly.com/webhook_subscriptions/one" },
      });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  }) as typeof fetch;
  logEntries.length = 0;

  try {
    const response = await callbackRequest(
      validState(),
      `state=expected-state-value&code=${clientCode}`,
    );
    const redirect = response.headers.get("location") ?? "";

    assert.equal(response.status, 302);
    assert.equal(redirect, "http://localhost/mentor?calendly=connected");
    assert.equal(fetchCalls.length, 3);
    assert.match(String(fetchCalls[0]?.init?.body), new RegExp(clientCode));
    assert.deepEqual(Object.keys(persistedValues[0] ?? {}).sort(), [
      "calendlyBookingUrl",
      "calendlyWebhookSecretEncrypted",
      "calendlyWebhookSubscriptionUri",
      "calendlyWebhookTokenEncrypted",
      "calendlyWebhookTokenHash",
    ]);
    assert.equal(persistedValues[0]?.calendlyBookingUrl, "https://calendly.com/mentor-one");
    assert.doesNotMatch(JSON.stringify(persistedValues), new RegExp(accessToken));
    assert.doesNotMatch(redirect, new RegExp(`${clientCode}|${accessToken}`));
    assert.doesNotMatch(JSON.stringify(logEntries), new RegExp(`${clientCode}|${accessToken}`));
  } finally {
    restoreUpdate();
    restoreSelect();
    globalThis.fetch = nativeFetch;
  }
});

test("role access rejects invited mentors and permits only active mentors", async () => {
  async function runGuard(status: "invited" | "active", role = "mentor") {
    let nextCalled = false;
    let responseStatus = 200;
    const res = {
      locals: { staff: { id: 5, role, status } },
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json() { return this; },
    };
    requireRole("mentor")({} as never, res as never, () => { nextCalled = true; });
    return { nextCalled, responseStatus };
  }

  assert.deepEqual(await runGuard("invited"), { nextCalled: false, responseStatus: 403 });
  assert.deepEqual(await runGuard("active"), { nextCalled: true, responseStatus: 200 });
  assert.deepEqual(await runGuard("active", "staff"), { nextCalled: false, responseStatus: 403 });
});

test("returns only the booking link for the participant's own assigned mentor", () => {
  const support = [
    {
      id: 1,
      businessId: 101,
      type: "mentor",
      provider: "Mentor A",
      topic: "Planning",
      scheduledDate: null,
      status: "open",
      calendlyBookingUrl: "https://calendly.com/mentor-a",
    },
    {
      id: 2,
      businessId: 202,
      type: "mentor",
      provider: "Mentor B",
      topic: "Growth",
      scheduledDate: null,
      status: "open",
      calendlyBookingUrl: "https://calendly.com/mentor-b",
    },
    {
      id: 3,
      businessId: 202,
      type: "trainer",
      provider: "Trainer",
      topic: "Workshop",
      scheduledDate: null,
      status: "open",
      calendlyBookingUrl: "https://calendly.com/not-a-mentor",
    },
  ];

  const founderA = getParticipantSupportForBusiness(support, 101);
  const founderB = getParticipantSupportForBusiness(support, 202);

  assert.deepEqual(founderA.map((entry) => entry.mentorBookingUrl), ["https://calendly.com/mentor-a"]);
  assert.deepEqual(founderB.map((entry) => entry.mentorBookingUrl), [
    "https://calendly.com/mentor-b",
    null,
  ]);
  assert.equal("calendlyBookingUrl" in founderB[0]!, false);
});
