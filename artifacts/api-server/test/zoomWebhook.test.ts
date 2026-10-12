import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

const secretToken = "test-zoom-webhook-secret";
const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let sessionsTable: typeof import("@workspace/db").sessionsTable;
let zoomConnectionsTable: typeof import("@workspace/db").zoomConnectionsTable;
let saveZoomConnection: typeof import("../src/lib/zoom").saveZoomConnection;
let verifyZoomWebhookSignature: typeof import("../src/lib/zoom").verifyZoomWebhookSignature;
let createZoomWebhookValidationResponse: typeof import("../src/lib/zoom").createZoomWebhookValidationResponse;
const logEntries: unknown[] = [];

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.SESSION_SECRET = "unit-test-session-secret";
  process.env.ZOOM_CLIENT_ID = "test-zoom-client";
  process.env.ZOOM_CLIENT_SECRET = "test-zoom-client-secret";
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = secretToken;
  process.env.NODE_ENV = "test";

  const database = await import("@workspace/db");
  db = database.db;
  sessionsTable = database.sessionsTable;
  zoomConnectionsTable = database.zoomConnectionsTable;

  const zoom = await import("../src/lib/zoom");
  saveZoomConnection = zoom.saveZoomConnection;
  verifyZoomWebhookSignature = zoom.verifyZoomWebhookSignature;
  createZoomWebhookValidationResponse = zoom.createZoomWebhookValidationResponse;
  const { default: router } = await import("../src/routes/zoom");

  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      log: {
        error: (...args: unknown[]) => logEntries.push(args),
      },
    });
    next();
  });
  app.use(express.json({
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
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

function signedHeaders(rawBody: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = createHmac("sha256", secretToken)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");
  return {
    "content-type": "application/json",
    "x-zm-request-timestamp": timestamp,
    "x-zm-signature": `v0=${signature}`,
  };
}

async function postWebhook(body: string, headers = signedHeaders(body)): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}/api/zoom/webhook`, {
    method: "POST",
    headers,
    body,
  });
}

test("validates Zoom signatures and rejects tampered or expired requests", () => {
  const rawBody = '{"event":"recording.completed"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signedHeaders(rawBody, timestamp)["x-zm-signature"];

  assert.equal(
    verifyZoomWebhookSignature(Buffer.from(rawBody), timestamp, signature),
    true,
  );
  assert.equal(
    verifyZoomWebhookSignature(Buffer.from(`${rawBody} `), timestamp, signature),
    false,
  );
  assert.equal(
    verifyZoomWebhookSignature(
      Buffer.from(rawBody),
      String(Math.floor(Date.now() / 1000) - 301),
      signature,
    ),
    false,
  );
  assert.equal(
    verifyZoomWebhookSignature(Buffer.from(rawBody), timestamp, "v0=invalid"),
    false,
  );
});

test("answers Zoom URL validation only for a correctly signed request", async () => {
  const body = JSON.stringify({
    event: "endpoint.url_validation",
    payload: { plainToken: "zoom-challenge-token" },
  });
  const response = await postWebhook(body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), createZoomWebhookValidationResponse("zoom-challenge-token"));

  const invalidResponse = await postWebhook(body, {
    ...signedHeaders(body),
    "x-zm-signature": "v0=" + "0".repeat(64),
  });
  assert.equal(invalidResponse.status, 401);
});

test("acknowledges valid Zoom events that do not require recording sync", async () => {
  const body = JSON.stringify({ event: "meeting.started", payload: {} });
  const response = await postWebhook(body);
  assert.equal(response.status, 200);
});

test("syncs completed recordings to the matching session and safely accepts a replay", async () => {
  const session = {
    id: 9301,
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
    zoomUrl: "https://zoom.us/j/123456789",
    zoomMeetingId: "123456789",
    recordingUrl: null,
    status: "scheduled",
    createdAt: new Date(),
  };
  let connectionValues: Record<string, unknown> | null = null;
  const savedUpdates: Array<{ sessionId: number; recordingUrl: unknown }> = [];
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  const originalInsert = Object.getOwnPropertyDescriptor(db, "insert");
  const originalUpdate = Object.getOwnPropertyDescriptor(db, "update");

  Object.defineProperty(db, "insert", {
    configurable: true,
    writable: true,
    value: () => ({
      values: (values: Record<string, unknown>) => {
        connectionValues = values;
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  });
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      let source: unknown;
      const query = {
        from(table: unknown) {
          source = table;
          return query;
        },
        where() {
          return query;
        },
        async limit() {
          if (source === sessionsTable) return [session];
          if (source === zoomConnectionsTable && connectionValues) {
            return [{
              ...connectionValues,
              id: 101,
              accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
            }];
          }
          return [];
        },
      };
      return query;
    },
  });
  Object.defineProperty(db, "update", {
    configurable: true,
    writable: true,
    value: () => {
      let values: Record<string, unknown> = {};
      const query = {
        set(nextValues: Record<string, unknown>) {
          values = nextValues;
          return query;
        },
        where() {
          return query;
        },
        async returning() {
          Object.assign(session, values);
          savedUpdates.push({ sessionId: session.id, recordingUrl: values.recordingUrl });
          return [session];
        },
      };
      return query;
    },
  });

  try {
    await saveZoomConnection(
      { accessToken: "test-access-token", refreshToken: "test-refresh-token", expiresIn: 3600 },
      71,
    );
    globalThis.fetch = (async () => new Response(JSON.stringify({
      share_url: "https://us02web.zoom.us/rec/share/processed-recording",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    const body = JSON.stringify({
      event: "recording.completed",
      payload: { object: { id: 123456789 } },
    });
    const firstResponse = await postWebhook(body);
    const replayResponse = await postWebhook(body);

    assert.equal(firstResponse.status, 200, JSON.stringify(logEntries));
    assert.equal(replayResponse.status, 200);
    assert.equal(
      session.recordingUrl,
      "https://us02web.zoom.us/rec/share/processed-recording",
    );
    assert.deepEqual(savedUpdates, [
      { sessionId: 9301, recordingUrl: "https://us02web.zoom.us/rec/share/processed-recording" },
      { sessionId: 9301, recordingUrl: "https://us02web.zoom.us/rec/share/processed-recording" },
    ]);
  } finally {
    globalThis.fetch = nativeFetch;
    if (originalSelect) Object.defineProperty(db, "select", originalSelect);
    else Reflect.deleteProperty(db, "select");
    if (originalInsert) Object.defineProperty(db, "insert", originalInsert);
    else Reflect.deleteProperty(db, "insert");
    if (originalUpdate) Object.defineProperty(db, "update", originalUpdate);
    else Reflect.deleteProperty(db, "update");
  }
});
