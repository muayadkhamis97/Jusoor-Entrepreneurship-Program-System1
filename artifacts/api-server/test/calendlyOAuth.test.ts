import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac } from "node:crypto";
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
const webhookToken = "test-calendly-webhook-token";
const webhookSigningKey = "test-calendly-webhook-signing-key";
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

function replaceDbMethod(
  name: "select" | "selectDistinct" | "update" | "insert",
  replacement: (...args: never[]) => unknown,
) {
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
  app.use(express.json({
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
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

function encryptedWebhookSecret(value: string): string {
  const key = createHash("sha256").update(process.env.SESSION_SECRET!).digest();
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function calendlyWebhookPayload(overrides: {
  event?: "invitee.created" | "invitee.canceled";
  createdAt?: string;
  email?: string;
  inviteeId?: string;
  eventName?: string;
  status?: string;
} = {}): string {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  return JSON.stringify({
    event: overrides.event ?? "invitee.created",
    created_at: overrides.createdAt ?? now.toISOString(),
    payload: {
      uri: `https://api.calendly.com/scheduled_events/event-1/invitees/${overrides.inviteeId ?? "invitee-1"}`,
      email: overrides.email ?? "founder@example.com",
      status: overrides.status,
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/event-1",
        name: overrides.eventName ?? "Mentoring session",
        start_time: startsAt.toISOString(),
        end_time: endsAt.toISOString(),
      },
    },
  });
}

function calendlyWebhookHeaders(
  rawBody: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
  signingKey = webhookSigningKey,
): Record<string, string> {
  const signature = createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return {
    "content-type": "application/json",
    "calendly-webhook-signature": `t=${timestamp},v1=${signature}`,
  };
}

async function postCalendlyWebhook(rawBody: string, headers = calendlyWebhookHeaders(rawBody)): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/mentor/calendly/webhook/${webhookToken}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function hasLastEventAtLessThanGuard(chunks: unknown[]): boolean {
  const column = chunks.find((chunk) => typeof chunk === "object" && chunk !== null && "name" in chunk) as
    { name?: string } | undefined;
  const hasLessThan = chunks.some((chunk) => {
    if (typeof chunk !== "object" || chunk === null || !("value" in chunk)) return false;
    const value = (chunk as { value?: unknown }).value;
    return Array.isArray(value) && value.join("").includes("<");
  });
  return column?.name === "last_event_at" && hasLessThan;
}

function installCalendlyWebhookDatabase(matchedBusinesses: Array<{ id: number }> = [{ id: 19 }]) {
  const savedMeetings = new Map<string, Record<string, unknown>>();
  const conflictUpdates: Array<Record<string, unknown>> = [];
  let insertAttempts = 0;
  const restoreSelect = replaceDbMethod("select", (() => {
    const query = {
      from() { return this; },
      where() { return this; },
      limit: async () => [{
        id: 71,
        webhookSecretEncrypted: encryptedWebhookSecret(webhookSigningKey),
      }],
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreSelectDistinct = replaceDbMethod("selectDistinct", (() => {
    const query = {
      from() { return this; },
      innerJoin() { return this; },
      where: async () => matchedBusinesses,
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      insertAttempts += 1;
      this.valuesToInsert = values;
      return this;
    },
    valuesToInsert: {} as Record<string, unknown>,
    onConflictDoUpdate(options: Record<string, unknown>) {
      conflictUpdates.push(options);
      const values = this.valuesToInsert;
      const inviteeUri = String(values.inviteeUri);
      const existing = savedMeetings.get(inviteeUri);
      const condition = options.setWhere as { queryChunks?: Array<unknown> } | undefined;
      const chunks = condition?.queryChunks ?? [];
      const strictLastEventAtGuard = hasLastEventAtLessThanGuard(chunks);
      let returned: Array<{ id: number }> = [];
      if (!existing) {
        savedMeetings.set(inviteeUri, { ...values, id: savedMeetings.size + 1 });
        returned = [{ id: savedMeetings.size }];
      } else if (
        strictLastEventAtGuard &&
        (existing.lastEventAt as Date).getTime() < (values.lastEventAt as Date).getTime()
      ) {
        savedMeetings.set(inviteeUri, { ...existing, ...values });
        returned = [{ id: existing.id as number }];
      }
      return { returning: async () => returned };
    },
  })) as (...args: never[]) => unknown);

  return {
    savedMeetings,
    conflictUpdates,
    get insertAttempts() { return insertAttempts; },
    restore() {
      restoreInsert();
      restoreSelectDistinct();
      restoreSelect();
    },
  };
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
  let selectCall = 0;
  const restoreSelect = replaceDbMethod("select", (() => {
    selectCall += 1;
    const currentCall = selectCall;
    const query = {
      from() { return this; },
      innerJoin() { return this; },
      where() { return currentCall === 1 ? this : Promise.resolve([]); },
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
    if (url.startsWith("https://api.calendly.com/scheduled_events?")) {
      return responseJson({ collection: [] });
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
    assert.equal(fetchCalls.length, 5);
    assert.match(String(fetchCalls[0]?.init?.body), new RegExp(clientCode));
    assert.deepEqual(Object.keys(persistedValues[0] ?? {}).sort(), [
      "bookingProvider",
      "calendlyBookingUrl",
      "calendlyWebhookSecretEncrypted",
      "calendlyWebhookSubscriptionUri",
      "calendlyWebhookTokenEncrypted",
      "calendlyWebhookTokenHash",
    ]);
    assert.equal(persistedValues[0]?.bookingProvider, "calendly");
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

test("imports paginated active and canceled invitees only for assigned businesses", async () => {
  const fetchCalls: string[] = [];
  const imported: Array<Record<string, unknown>> = [];
  const conflictUpdates: Array<Record<string, unknown>> = [];
  const mentor = {
    id: 71,
    webhookTokenEncrypted: null,
    webhookSecretEncrypted: null,
    webhookSubscriptionUri: null,
  };
  let selectCall = 0;
  const restoreSelect = replaceDbMethod("select", (() => {
    selectCall += 1;
    const currentCall = selectCall;
    const query = {
      from() { return this; },
      innerJoin() { return this; },
      where() {
        return currentCall === 1
          ? this
          : Promise.resolve([{ id: 19, email: "founder@example.com" }]);
      },
      limit: async () => [mentor],
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => ({
    set() { return this; },
    where() { return this; },
    returning: async () => [{ id: mentor.id }],
  })) as (...args: never[]) => unknown);
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(value: Record<string, unknown>) {
      imported.push(value);
      return this;
    },
    onConflictDoUpdate(options: Record<string, unknown>) {
      conflictUpdates.push(options);
      return { returning: async () => [{ id: imported.length }] };
    },
  })) as (...args: never[]) => unknown);
  const eventActive = "https://api.calendly.com/scheduled_events/active-one";
  const eventCanceled = "https://api.calendly.com/scheduled_events/canceled-one";
  const invitee = (event: string, id: string, status: string, email: string) => ({
    uri: `${event}/invitees/${id}`,
    email,
    status,
    timezone: "Asia/Beirut",
    created_at: "2024-02-03T10:00:00.000000Z",
    updated_at: "2024-02-03T11:00:00.000000Z",
    rescheduled: status === "canceled",
  });
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    fetchCalls.push(url);
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
      return responseJson({ resource: { uri: "https://api.calendly.com/webhook_subscriptions/one" } });
    }
    if (url.startsWith("https://api.calendly.com/scheduled_events?")) {
      const parsed = new URL(url);
      const status = parsed.searchParams.get("status");
      if (status === "active" && !parsed.searchParams.has("page_token")) {
        return responseJson({
          collection: [{
            uri: eventActive,
            name: "Mentor check-in",
            start_time: "2024-02-03T11:00:00.000000Z",
            end_time: "2024-02-03T11:30:00.000000Z",
            created_at: "2024-02-03T10:00:00.000000Z",
          }],
          pagination: {
            next_page: "https://api.calendly.com/scheduled_events?user=https%3A%2F%2Fapi.calendly.com%2Fusers%2Fmentor-one&status=active&page_token=next",
          },
        });
      }
      if (status === "active") return responseJson({ collection: [] });
      if (status === "canceled") {
        return responseJson({
          collection: [{
            uri: eventCanceled,
            name: "Canceled session",
            start_time: "2024-02-04T11:00:00.000000Z",
            end_time: "2024-02-04T11:30:00.000000Z",
            updated_at: "2024-02-04T09:00:00.000000Z",
          }],
        });
      }
    }
    if (url === `${eventActive}/invitees?count=100`) {
      return responseJson({
        collection: [invitee(eventActive, "active-invitee", "active", "FOUNDER@example.com")],
        pagination: {
          next_page: `${eventActive}/invitees?page_token=next`,
        },
      });
    }
    if (url === `${eventActive}/invitees?page_token=next&count=100`) {
      return responseJson({
        collection: [invitee(eventActive, "active-invitee-two", "active", "founder@example.com")],
      });
    }
    if (url === `${eventCanceled}/invitees?count=100`) {
      return responseJson({
        collection: [
          invitee(eventCanceled, "canceled-invitee", "canceled", "founder@example.com"),
          invitee(eventCanceled, "unassigned", "active", "other@example.com"),
        ],
      });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await callbackRequest(
      validState(),
      `state=expected-state-value&code=${clientCode}`,
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "http://localhost/mentor?calendly=connected");
    assert.equal(imported.length, 3);
    assert.deepEqual(imported.map((meeting) => meeting.status), ["confirmed", "confirmed", "rescheduled"]);
    assert.deepEqual(imported.map((meeting) => meeting.businessId), [19, 19, 19]);
    assert.deepEqual(imported.map((meeting) => meeting.mentorStaffId), [71, 71, 71]);
    assert.deepEqual(imported.map((meeting) => meeting.inviteeUri), [
      `${eventActive}/invitees/active-invitee`,
      `${eventActive}/invitees/active-invitee-two`,
      `${eventCanceled}/invitees/canceled-invitee`,
    ]);
    assert.equal(fetchCalls.filter((url) => url.includes("page_token=next")).length, 2);
    assert.equal(fetchCalls.filter((url) => url.includes("/invitees")).length, 3);
    assert.equal(conflictUpdates.length, 3);
    assert.ok(conflictUpdates.every((options) => "target" in options && "setWhere" in options));
    assert.ok(fetchCalls.filter((url) => url.includes("scheduled_events?") || url.includes("/invitees"))
      .every((url) => new URL(url).searchParams.get("count") === "100"));
  } finally {
    restoreInsert();
    restoreUpdate();
    restoreSelect();
    globalThis.fetch = nativeFetch;
  }
});

test("rejects invalid Calendly signatures and stale timestamps without changing stored meetings", async () => {
  const database = installCalendlyWebhookDatabase();
  const createdAt = new Date(Date.now() - 30_000).toISOString();
  const originalPayload = calendlyWebhookPayload({ createdAt, eventName: "Original session" });

  try {
    const accepted = await postCalendlyWebhook(originalPayload);
    assert.equal(accepted.status, 200);
    const originalMeeting = database.savedMeetings.get(
      "https://api.calendly.com/scheduled_events/event-1/invitees/invitee-1",
    );
    assert.equal(originalMeeting?.eventName, "Original session");
    assert.equal(originalMeeting?.status, "confirmed");

    const forgedPayload = calendlyWebhookPayload({
      event: "invitee.canceled",
      createdAt: new Date(Date.now() - 10_000).toISOString(),
      eventName: "Forged update",
    });
    const forged = await postCalendlyWebhook(
      forgedPayload,
      calendlyWebhookHeaders(forgedPayload, undefined, "attacker-known-key"),
    );
    assert.equal(forged.status, 401);
    assert.match(await forged.text(), /Invalid Calendly webhook signature/);

    const stalePayload = calendlyWebhookPayload({
      event: "invitee.canceled",
      createdAt: new Date(Date.now() - 5_000).toISOString(),
      eventName: "Stale update",
    });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 4 * 60);
    const stale = await postCalendlyWebhook(
      stalePayload,
      calendlyWebhookHeaders(stalePayload, staleTimestamp),
    );
    assert.equal(stale.status, 401);
    assert.match(await stale.text(), /Invalid Calendly webhook signature/);
    assert.equal(database.insertAttempts, 1);
    assert.deepEqual(
      database.savedMeetings.get("https://api.calendly.com/scheduled_events/event-1/invitees/invitee-1"),
      originalMeeting,
    );
  } finally {
    database.restore();
  }
});

test("does not attach a Calendly event to a founder outside the mentor's assignments", async () => {
  const database = installCalendlyWebhookDatabase([]);
  try {
    const response = await postCalendlyWebhook(calendlyWebhookPayload({
      email: "unassigned-founder@example.com",
    }));
    assert.equal(response.status, 200);
    assert.equal(database.insertAttempts, 0);
    assert.equal(database.savedMeetings.size, 0);
  } finally {
    database.restore();
  }
});

test("duplicate and out-of-order Calendly events cannot replace newer meeting state", async () => {
  const database = installCalendlyWebhookDatabase();
  const newestEventAt = new Date(Date.now() - 30_000);
  const inviteeUri = "https://api.calendly.com/scheduled_events/event-1/invitees/invitee-1";
  try {
    const newest = await postCalendlyWebhook(calendlyWebhookPayload({
      createdAt: newestEventAt.toISOString(),
      eventName: "Newest confirmed session",
    }));
    assert.equal(newest.status, 200);

    const duplicateWithChangedState = await postCalendlyWebhook(calendlyWebhookPayload({
      event: "invitee.canceled",
      createdAt: newestEventAt.toISOString(),
      eventName: "Duplicate cancellation",
    }));
    assert.equal(duplicateWithChangedState.status, 200);

    const older = await postCalendlyWebhook(calendlyWebhookPayload({
      createdAt: new Date(newestEventAt.getTime() - 1_000).toISOString(),
      eventName: "Out-of-order session",
    }));
    assert.equal(older.status, 200);

    assert.equal(database.insertAttempts, 3);
    assert.equal(database.conflictUpdates.length, 3);
    assert.ok(database.conflictUpdates.every((options) =>
      hasLastEventAtLessThanGuard(
        (options.setWhere as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [],
      ),
    ));
    const savedMeeting = database.savedMeetings.get(inviteeUri);
    assert.equal(savedMeeting?.eventName, "Newest confirmed session");
    assert.equal(savedMeeting?.status, "confirmed");
    assert.equal((savedMeeting?.lastEventAt as Date).getTime(), newestEventAt.getTime());
  } finally {
    database.restore();
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
      bookingProvider: "calendly",
      calendlyBookingUrl: "https://calendly.com/mentor-a",
      googleCalendarBookingUrl: "https://calendar.google.com/calendar/appointments/schedules/mentor-a",
    },
    {
      id: 2,
      businessId: 202,
      type: "mentor",
      provider: "Mentor B",
      topic: "Growth",
      scheduledDate: null,
      status: "open",
      bookingProvider: "calendly",
      calendlyBookingUrl: "https://calendly.com/mentor-b",
      googleCalendarBookingUrl: "https://calendar.google.com/calendar/appointments/schedules/mentor-b",
    },
    {
      id: 3,
      businessId: 202,
      type: "trainer",
      provider: "Trainer",
      topic: "Workshop",
      scheduledDate: null,
      status: "open",
      bookingProvider: "google_calendar",
      calendlyBookingUrl: "https://calendly.com/not-a-mentor",
      googleCalendarBookingUrl: "https://calendar.google.com/calendar/appointments/schedules/not-a-mentor",
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

test("uses the selected provider's public link only for its assigned mentoring support", () => {
  const support = [
    {
      id: 1,
      businessId: 101,
      type: "mentor",
      provider: "Mentor A",
      topic: "Planning",
      scheduledDate: null,
      status: "open",
      bookingProvider: "google_calendar",
      calendlyBookingUrl: "https://calendly.com/mentor-a",
      googleCalendarBookingUrl: "https://calendar.google.com/calendar/appointments/schedules/mentor-a",
    },
    {
      id: 2,
      businessId: 101,
      type: "subject_expert",
      provider: "Expert",
      topic: "Finance",
      scheduledDate: null,
      status: "open",
      bookingProvider: "google_calendar",
      calendlyBookingUrl: "https://calendly.com/not-a-mentor",
      googleCalendarBookingUrl: "https://calendar.google.com/calendar/appointments/schedules/not-a-mentor",
    },
  ];

  const result = getParticipantSupportForBusiness(support, 101);
  assert.deepEqual(result.map((entry) => entry.mentorBookingUrl), [
    "https://calendar.google.com/calendar/appointments/schedules/mentor-a",
    null,
  ]);
  assert.equal("googleCalendarBookingUrl" in result[0]!, false);
});
