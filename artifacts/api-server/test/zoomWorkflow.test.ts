import assert from "node:assert/strict";
import {
  createCipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { requireRole } from "../src/middlewares/requireRole";

const nativeFetch = globalThis.fetch;
const accessToken = "plaintext-zoom-access-token";
const refreshToken = "plaintext-zoom-refresh-token";
let server: Server;
let db: typeof import("@workspace/db").db;
let staffMembersTable: typeof import("@workspace/db").staffMembersTable;
let sessionsTable: typeof import("@workspace/db").sessionsTable;
let zoomConnectionsTable: typeof import("@workspace/db").zoomConnectionsTable;

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function replaceDbMethod(
  name: "insert" | "select" | "update",
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

function sealOAuthState(
  value: {
    staffId: number;
    state: string;
    codeVerifier: string;
    origin: string;
    redirectUri: string;
    expiresAt: number;
  },
): string {
  const key = createHash("sha256")
    .update("jusoor.zoom.oauth-state.v1\0")
    .update(process.env.SESSION_SECRET ?? "")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function oauthCookie(expiresAt = Date.now() + 60_000): string {
  const state = {
    staffId: 71,
    state: "expected-zoom-state",
    codeVerifier: "test-zoom-code-verifier",
    origin: "http://localhost",
    redirectUri: "http://localhost/api/zoom/callback",
    expiresAt,
  };
  return `jusoor_zoom_oauth=${sealOAuthState(state)}`;
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.SESSION_SECRET = "unit-test-session-secret";
  process.env.ZOOM_CLIENT_ID = "test-zoom-client";
  process.env.ZOOM_CLIENT_SECRET = "test-zoom-client-secret";
  process.env.JUSOOR_BOOTSTRAP_COORDINATOR_EMAIL = "coordinator@example.com";
  process.env.NODE_ENV = "test";

  const database = await import("@workspace/db");
  db = database.db;
  staffMembersTable = database.staffMembersTable;
  sessionsTable = database.sessionsTable;
  zoomConnectionsTable = database.zoomConnectionsTable;

  const { default: router } = await import("../src/routes/zoom");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const auth = Object.assign(
      () => ({ userId: "test-staff-user", tokenType: "session_token" }),
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
  app.use("/api/zoom", router);
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

test("rejects expired and mismatched Zoom OAuth state before contacting Zoom", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return responseJson({});
  }) as typeof fetch;

  const expired = await request(
    "/api/zoom/callback?state=expected-zoom-state&code=authorization-code",
    { headers: { cookie: oauthCookie(Date.now() - 1) }, redirect: "manual" },
  );
  const mismatched = await request(
    "/api/zoom/callback?state=attacker-state&code=authorization-code",
    { headers: { cookie: oauthCookie() }, redirect: "manual" },
  );

  assert.equal(expired.status, 400);
  assert.equal(mismatched.status, 400);
  assert.match(await expired.text(), /expired or could not be verified/);
  assert.equal(fetchCalls, 0);
});

test("exchanges Zoom OAuth tokens and persists only encrypted token values", async () => {
  let persisted: Record<string, unknown> | null = null;
  let staffSelected = false;
  let tokenRequest: RequestInit | undefined;
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
      async limit() {
        if (table === staffMembersTable) {
          staffSelected = true;
          return [{ id: 71 }];
        }
        return [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      persisted = values;
      return { onConflictDoUpdate: async () => undefined };
    },
  })) as (...args: never[]) => unknown);
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    tokenRequest = init;
    return responseJson({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
    });
  }) as typeof fetch;

  try {
    const response = await request(
      "/api/zoom/callback?state=expected-zoom-state&code=private-authorization-code",
      { headers: { cookie: oauthCookie() }, redirect: "manual" },
    );
    const redirect = response.headers.get("location") ?? "";

    assert.equal(response.status, 302);
    assert.equal(redirect, "http://localhost/sessions?zoom=connected");
    assert.equal(staffSelected, true);
    assert.equal(String(tokenRequest?.body).includes("private-authorization-code"), true);
    assert.ok(tokenRequest?.signal instanceof AbortSignal);
    assert.ok(persisted);
    assert.notEqual(persisted.encryptedAccessToken, accessToken);
    assert.notEqual(persisted.encryptedRefreshToken, refreshToken);
    assert.doesNotMatch(JSON.stringify(persisted), /plaintext-zoom-(access|refresh)-token/);
    assert.doesNotMatch(redirect, /private-authorization-code|plaintext-zoom/);
  } finally {
    restoreInsert();
    restoreSelect();
    globalThis.fetch = nativeFetch;
  }
});

test("Zoom OAuth callback redirects safely when token exchange times out", async () => {
  const nativeAbortTimeout = AbortSignal.timeout;
  const originalTimeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: () => nativeAbortTimeout.call(AbortSignal, 5),
  });
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      assert.ok(signal);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as typeof fetch;

  try {
    const response = await request(
      "/api/zoom/callback?state=expected-zoom-state&code=sensitive-zoom-authorization-code",
      { headers: { cookie: oauthCookie() }, redirect: "manual" },
    );
    const redirect = response.headers.get("location") ?? "";
    assert.equal(response.status, 302);
    assert.equal(redirect, "http://localhost/sessions?zoom=error");
    assert.doesNotMatch(redirect, /sensitive-zoom-authorization-code|plaintext-zoom/);
  } finally {
    globalThis.fetch = nativeFetch;
    if (originalTimeoutDescriptor) {
      Object.defineProperty(AbortSignal, "timeout", originalTimeoutDescriptor);
    }
  }
});

test("rotates encrypted refresh tokens and creates then updates Zoom meetings", async () => {
  const { saveZoomConnection, createOrUpdateZoomMeeting } = await import("../src/lib/zoom");
  let connection: Record<string, unknown> | null = null;
  const session = {
    id: 9301,
    title: "Mentor training",
    scheduledDate: "2026-10-12",
    startTime: "10:00",
    durationMinutes: 60,
    deliveryMode: "online",
    status: "scheduled",
    zoomMeetingId: null as string | null,
    zoomUrl: null as string | null,
    recordingUrl: null as string | null,
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      connection = { ...values, id: 101 };
      return { onConflictDoUpdate: async () => undefined };
    },
  })) as (...args: never[]) => unknown);
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
      async limit() {
        return table === zoomConnectionsTable && connection ? [connection] : [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    let values: Record<string, unknown> = {};
    const query = {
      set(next: Record<string, unknown>) {
        values = next;
        if ("encryptedAccessToken" in next && connection) {
          Object.assign(connection, next);
        }
        return query;
      },
      where() {
        return query;
      },
      async returning() {
        Object.assign(session, values);
        return [session];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://zoom.us/oauth/token") {
      const body = String(init?.body);
      return responseJson({
        access_token: `refreshed-access-${calls.filter((call) => call.url === url).length}`,
        refresh_token: `rotated-refresh-${calls.filter((call) => call.url === url).length}`,
        expires_in: 3600,
      });
    }
    if (url === "https://api.zoom.us/v2/users/me/meetings") {
      return responseJson({ id: "meeting/9301", join_url: "https://zoom.us/j/9301" });
    }
    if (url === "https://api.zoom.us/v2/meetings/meeting%2F9301") {
      if (init?.method === "PATCH") return new Response(null, { status: 204 });
      return responseJson({ id: "meeting/9301", join_url: "https://zoom.us/j/updated" });
    }
    throw new Error(`Unexpected Zoom request: ${url}`);
  }) as typeof fetch;

  try {
    await saveZoomConnection(
      { accessToken, refreshToken, expiresIn: 0 },
      71,
    );
    assert.ok(connection);
    assert.notEqual(connection.encryptedAccessToken, accessToken);
    assert.notEqual(connection.encryptedRefreshToken, refreshToken);

    const created = await createOrUpdateZoomMeeting(session as never);
    assert.equal(created.zoomMeetingId, "meeting/9301");
    assert.equal(created.zoomUrl, "https://zoom.us/j/9301");

    const firstRefresh = calls.find((call) => call.url === "https://zoom.us/oauth/token");
    assert.match(String(firstRefresh?.init?.body), /plaintext-zoom-refresh-token/);
    assert.doesNotMatch(JSON.stringify(connection), /refreshed-access-1|rotated-refresh-1/);

    // Expire the access token again to verify the rotated refresh token is used.
    connection.accessTokenExpiresAt = new Date(0);
    const updated = await createOrUpdateZoomMeeting(created as never);
    assert.equal(updated.zoomUrl, "https://zoom.us/j/updated");

    const refreshBodies = calls
      .filter((call) => call.url === "https://zoom.us/oauth/token")
      .map((call) => String(call.init?.body));
    assert.match(refreshBodies[1] ?? "", /rotated-refresh-1/);
    assert.ok(calls.some((call) =>
      call.url === "https://api.zoom.us/v2/meetings/meeting%2F9301" &&
      call.init?.method === "PATCH",
    ));
    assert.ok(calls.some((call) =>
      call.url === "https://api.zoom.us/v2/meetings/meeting%2F9301" &&
      call.init?.method === "GET",
    ));
  } finally {
    restoreUpdate();
    restoreSelect();
    restoreInsert();
    globalThis.fetch = nativeFetch;
  }
});

test("does not create duplicate Zoom meetings when requests overlap for one session", async () => {
  const { saveZoomConnection, createOrUpdateZoomMeeting, ZoomIntegrationError } =
    await import("../src/lib/zoom");
  let connection: Record<string, unknown> | null = null;
  const session = {
    id: 9305,
    title: "Concurrent mentor training",
    scheduledDate: "2026-10-12",
    startTime: "10:00",
    durationMinutes: 60,
    deliveryMode: "online",
    status: "scheduled",
    zoomMeetingId: null as string | null,
    zoomUrl: null as string | null,
    zoomMeetingCreationPendingAt: null as Date | null,
    recordingUrl: null as string | null,
  };
  const calls: Array<{ url: string; method?: string }> = [];
  let resolveCreateStarted!: () => void;
  const createStarted = new Promise<void>((resolve) => {
    resolveCreateStarted = resolve;
  });
  let releaseCreate!: () => void;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      connection = {
        ...values,
        id: 105,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
      return { onConflictDoUpdate: async () => undefined };
    },
  })) as (...args: never[]) => unknown);
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
      async limit() {
        if (table === zoomConnectionsTable && connection) return [connection];
        if (table === sessionsTable) return [{ ...session }];
        return [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    let values: Record<string, unknown> = {};
    const query = {
      set(next: Record<string, unknown>) {
        values = next;
        return query;
      },
      where() {
        return query;
      },
      async returning() {
        if (
          values.zoomMeetingCreationPendingAt instanceof Date &&
          session.zoomMeetingCreationPendingAt !== null
        ) {
          return [];
        }
        Object.assign(session, values);
        return [{ ...session }];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url === "https://api.zoom.us/v2/users/me/meetings" && method === "POST") {
      resolveCreateStarted();
      await createGate;
      return responseJson({
        id: "concurrent-created-once-9305",
        join_url: "https://zoom.us/j/9305",
      });
    }
    if (url === "https://api.zoom.us/v2/meetings/concurrent-created-once-9305") {
      if (method === "PATCH") return new Response(null, { status: 204 });
      return responseJson({
        id: "concurrent-created-once-9305",
        join_url: "https://zoom.us/j/9305",
      });
    }
    throw new Error(`Unexpected Zoom request: ${url}`);
  }) as typeof fetch;

  try {
    await saveZoomConnection({ accessToken, refreshToken, expiresIn: 3600 }, 71);

    const firstRequest = createOrUpdateZoomMeeting({ ...session } as never);
    await createStarted;
    const secondRequest = createOrUpdateZoomMeeting({ ...session } as never);
    releaseCreate();

    const results = await Promise.allSettled([firstRequest, secondRequest]);
    const createCalls = calls.filter((call) =>
      call.url === "https://api.zoom.us/v2/users/me/meetings" &&
      call.method === "POST"
    );
    assert.equal(createCalls.length, 1);

    const successfulResults = results.filter(
      (result): result is PromiseFulfilledResult<typeof session> =>
        result.status === "fulfilled",
    );
    if (successfulResults.length === 2) {
      assert.equal(successfulResults[0].value.zoomMeetingId, "concurrent-created-once-9305");
      assert.equal(
        successfulResults[1].value.zoomMeetingId,
        successfulResults[0].value.zoomMeetingId,
      );
    } else {
      assert.ok(successfulResults.length < 2);
      for (const result of results) {
        if (result.status === "rejected") {
          assert.ok(result.reason instanceof ZoomIntegrationError);
          assert.equal(result.reason.statusCode, 409);
          assert.match(result.reason.message, /Another request may already be creating/);
        }
      }
    }
    assert.equal(session.zoomMeetingId, "concurrent-created-once-9305");
  } finally {
    releaseCreate();
    restoreUpdate();
    restoreSelect();
    restoreInsert();
    globalThis.fetch = nativeFetch;
  }
});

test("reuses a Zoom meeting after session persistence fails and the coordinator retries", async () => {
  const { saveZoomConnection, createOrUpdateZoomMeeting, ZoomIntegrationError } =
    await import("../src/lib/zoom");
  let connection: Record<string, unknown> | null = null;
  let persistenceAttempts = 0;
  const session = {
    id: 9304,
    title: "Mentor training",
    scheduledDate: "2026-10-12",
    startTime: "10:00",
    durationMinutes: 60,
    deliveryMode: "online",
    status: "scheduled",
    zoomMeetingId: null as string | null,
    zoomUrl: null as string | null,
    zoomMeetingCreationPendingAt: null as Date | null,
    recordingUrl: null as string | null,
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      connection = {
        ...values,
        id: 104,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
      return { onConflictDoUpdate: async () => undefined };
    },
  })) as (...args: never[]) => unknown);
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
      async limit() {
        if (table === zoomConnectionsTable && connection) return [connection];
        if (table === sessionsTable) return [session];
        return [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    let values: Record<string, unknown> = {};
    const query = {
      set(next: Record<string, unknown>) {
        values = next;
        return query;
      },
      where() {
        return query;
      },
      async returning() {
        if ("zoomMeetingId" in values) persistenceAttempts += 1;
        if ("zoomMeetingId" in values && persistenceAttempts === 1) {
          throw new Error("simulated local session persistence failure");
        }
        Object.assign(session, values);
        return [session];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://api.zoom.us/v2/users/me/meetings") {
      return responseJson({ id: "created-once-9304", join_url: "https://zoom.us/j/9304" });
    }
    throw new Error(`Unexpected Zoom request: ${url}`);
  }) as typeof fetch;

  try {
    await saveZoomConnection(
      { accessToken, refreshToken, expiresIn: 3600 },
      71,
    );

    await assert.rejects(
      createOrUpdateZoomMeeting(session as never),
      (error: unknown) => {
        assert.ok(error instanceof ZoomIntegrationError);
        assert.equal(error.statusCode, 503);
        assert.match(
          error.message,
          /Retry the Zoom action; the existing meeting will be reused/,
        );
        return true;
      },
    );
    assert.equal(session.zoomMeetingId, null);

    const restartedModuleUrl = new URL("../src/lib/zoom.ts", import.meta.url);
    restartedModuleUrl.searchParams.set("server-instance", "after-restart");
    const restartedServer = await import(restartedModuleUrl.href);
    await assert.rejects(
      restartedServer.createOrUpdateZoomMeeting({ ...session } as never),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(
          (error as Error & { statusCode?: number }).statusCode,
          409,
        );
        assert.match(
          error.message,
          /administrator to check Zoom and reconcile/,
        );
        return true;
      },
    );
    assert.equal(session.zoomMeetingCreationPendingAt instanceof Date, true);
    assert.equal(
      calls.filter((call) => call.url === "https://api.zoom.us/v2/users/me/meetings").length,
      1,
    );

    const retried = await createOrUpdateZoomMeeting(session as never);
    assert.equal(retried.zoomMeetingId, "created-once-9304");
    assert.equal(retried.zoomUrl, "https://zoom.us/j/9304");
    assert.equal(retried.zoomMeetingCreationPendingAt, null);
    assert.equal(persistenceAttempts, 2);
    assert.equal(
      calls.filter((call) => call.url === "https://api.zoom.us/v2/users/me/meetings").length,
      1,
    );
  } finally {
    restoreUpdate();
    restoreSelect();
    restoreInsert();
    globalThis.fetch = nativeFetch;
  }
});

test("reports Zoom meeting permission failures without provider details", async () => {
  const { saveZoomConnection, createOrUpdateZoomMeeting, ZoomIntegrationError } =
    await import("../src/lib/zoom");
  let connection: Record<string, unknown> | null = null;
  const session = {
    id: 9302,
    title: "Mentor training",
    scheduledDate: "2026-10-12",
    startTime: "10:00",
    durationMinutes: 60,
    deliveryMode: "online",
    status: "scheduled",
    zoomMeetingId: "9302",
    zoomUrl: "https://zoom.us/j/9302",
    recordingUrl: null as string | null,
  };
  let zoomResponse: Response = responseJson({ code: 4711, message: "private scope diagnostics" }, 403);
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      connection = {
        ...values,
        id: 102,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
      return { onConflictDoUpdate: async () => undefined };
    },
  })) as (...args: never[]) => unknown);
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
      async limit() {
        return table === zoomConnectionsTable && connection ? [connection] : [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    let values: Record<string, unknown> = {};
    const query = {
      set(next: Record<string, unknown>) {
        values = next;
        return query;
      },
      where() {
        return query;
      },
      async returning() {
        Object.assign(session, values);
        return [session];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async () => zoomResponse) as typeof fetch;

  try {
    await saveZoomConnection(
      { accessToken, refreshToken, expiresIn: 3600 },
      71,
    );
    await assert.rejects(
      createOrUpdateZoomMeeting({
        ...session,
        zoomMeetingId: null,
      } as never),
      (error: unknown) => {
        assert.ok(error instanceof ZoomIntegrationError);
        assert.equal(error.statusCode, 409);
        assert.match(error.message, /missing a permission/);
        assert.doesNotMatch(error.message, /private scope diagnostics|4711/);
        return true;
      },
    );
  } finally {
    restoreUpdate();
    restoreSelect();
    restoreInsert();
    globalThis.fetch = nativeFetch;
  }
});

test("Zoom API body timeout becomes a sanitized 504 integration error", async () => {
  const { saveZoomConnection, getZoomAccountEmail, ZoomIntegrationError } =
    await import("../src/lib/zoom");
  let connection: Record<string, unknown> | null = null;
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      connection = {
        ...values,
        id: 106,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
      return { onConflictDoUpdate: async () => undefined };
    },
  })) as (...args: never[]) => unknown);
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
      async limit() {
        return table === zoomConnectionsTable && connection ? [connection] : [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const nativeAbortTimeout = AbortSignal.timeout;
  const originalTimeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: () => nativeAbortTimeout.call(AbortSignal, 5),
  });
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const signal = init?.signal;
    assert.ok(signal);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;

  try {
    await saveZoomConnection({ accessToken, refreshToken, expiresIn: 3600 }, 71);
    await assert.rejects(getZoomAccountEmail(), (error: unknown) => {
      assert.ok(error instanceof ZoomIntegrationError);
      assert.equal(error.statusCode, 504);
      assert.match(error.message, /took too long/i);
      assert.doesNotMatch(error.message, /provider|token|authorization/i);
      return true;
    });
  } finally {
    restoreSelect();
    restoreInsert();
    globalThis.fetch = nativeFetch;
    if (originalTimeoutDescriptor) {
      Object.defineProperty(AbortSignal, "timeout", originalTimeoutDescriptor);
    }
  }
});

test("Zoom routes are coordinator-only and return sanitized provider failures", async () => {
  let role: "coordinator" | "staff" = "staff";
  let fetchCalls = 0;
  let createCalls = 0;
  let failSessionSave = false;
  let zoomResponse: Response = responseJson({ code: 4711, message: "private provider detail" }, 403);
  let connection: Record<string, unknown> | null = null;
  const session = {
    id: 9303,
    programId: null,
    title: "Mentor training",
    type: "training",
    scheduledDate: "2026-10-12",
    startTime: "10:00",
    durationMinutes: 60,
    facilitator: null,
    trainerStaffId: null,
    deliveryMode: "online",
    location: null,
    status: "scheduled",
    zoomMeetingId: null as string | null,
    zoomUrl: null as string | null,
    zoomMeetingCreationPendingAt: null as Date | null,
    recordingUrl: null,
    createdAt: new Date(),
  };
  const { saveZoomConnection } = await import("../src/lib/zoom");
  const restoreInsert = replaceDbMethod("insert", (() => ({
    values(values: Record<string, unknown>) {
      if (values.provider === "zoom") {
        connection = {
          ...values,
          id: 103,
          accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        };
      }
      return {
        onConflictDoNothing: async () => undefined,
        onConflictDoUpdate: async () => undefined,
      };
    },
  })) as (...args: never[]) => unknown);
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
      innerJoin() {
        return query;
      },
      orderBy: async () => [],
      async limit() {
        if (table === staffMembersTable) {
          return [{
            id: 71,
            email: "coordinator@example.com",
            role,
            status: "active",
            bookingProvider: "calendly",
            calendlyBookingUrl: null,
            googleCalendarAccountEmail: null,
            googleCalendarBookingUrl: null,
            createdAt: new Date(),
          }];
        }
        if (table === sessionsTable) {
          return [session];
        }
        if (table === zoomConnectionsTable && connection) return [connection];
        return [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  const restoreUpdate = replaceDbMethod("update", (() => {
    let values: Record<string, unknown> = {};
    const query = {
      set(next: Record<string, unknown>) {
        values = next;
        return query;
      },
      where() {
        return query;
      },
      async returning() {
        if (failSessionSave && "zoomMeetingId" in values) {
          throw new Error("private database diagnostics");
        }
        Object.assign(session, values);
        return [session];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    fetchCalls += 1;
    if (String(input) === "https://api.zoom.us/v2/users/me/meetings") {
      createCalls += 1;
    }
    return zoomResponse;
  }) as typeof fetch;

  try {
    await saveZoomConnection(
      { accessToken, refreshToken, expiresIn: 3600 },
      71,
    );

    const denied = await request("/api/zoom/sessions/9303/meeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    assert.equal(fetchCalls, 0);

    role = "coordinator";
    const failed = await request("/api/zoom/sessions/9303/meeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await failed.text();
    assert.equal(failed.status, 409);
    assert.match(body, /Zoom is missing a permission/);
    assert.doesNotMatch(body, /private provider detail|4711|plaintext-zoom/);
    assert.equal(fetchCalls, 1);

    createCalls = 0;
    zoomResponse = responseJson({ id: "route-created-once", join_url: "https://zoom.us/j/9303" });
    failSessionSave = true;
    const persistenceFailure = await request("/api/zoom/sessions/9303/meeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const persistenceError = await persistenceFailure.text();
    assert.equal(persistenceFailure.status, 503);
    assert.match(persistenceError, /Retry the Zoom action; the existing meeting will be reused/);
    assert.doesNotMatch(persistenceError, /private database diagnostics|route-created-once/);

    failSessionSave = false;
    const retried = await request("/api/zoom/sessions/9303/meeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(retried.status, 200);
    assert.equal((await retried.json() as { zoomMeetingId: string }).zoomMeetingId, "route-created-once");
    assert.equal(createCalls, 1);
  } finally {
    restoreUpdate();
    restoreSelect();
    restoreInsert();
    globalThis.fetch = nativeFetch;
  }
});

test("role guard rejects non-coordinators and inactive staff", () => {
  const guard = requireRole("coordinator");
  const runGuard = (staff: { role: string; status: string } | undefined) => {
    let nextCalled = false;
    let responseStatus = 200;
    const res = {
      locals: { staff },
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json() {
        return this;
      },
    };
    guard({} as never, res as never, () => {
      nextCalled = true;
    });
    return { nextCalled, responseStatus };
  };

  assert.deepEqual(runGuard({ role: "coordinator", status: "active" }), {
    nextCalled: true,
    responseStatus: 200,
  });
  assert.deepEqual(runGuard({ role: "staff", status: "active" }), {
    nextCalled: false,
    responseStatus: 403,
  });
  assert.deepEqual(runGuard({ role: "coordinator", status: "invited" }), {
    nextCalled: false,
    responseStatus: 403,
  });
  assert.deepEqual(runGuard(undefined), { nextCalled: false, responseStatus: 403 });
});
