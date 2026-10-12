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
let verifyZoomWebhookSignature: typeof import("../src/lib/zoom").verifyZoomWebhookSignature;
let createZoomWebhookValidationResponse: typeof import("../src/lib/zoom").createZoomWebhookValidationResponse;

function replaceDbMethod(
  name: "select",
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
  const zoom = await import("../src/lib/zoom");
  verifyZoomWebhookSignature = zoom.verifyZoomWebhookSignature;
  createZoomWebhookValidationResponse = zoom.createZoomWebhookValidationResponse;
  const { default: router } = await import("../src/routes/zoom");

  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      log: {
        error: () => undefined,
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

test("acknowledges signed recording-ready events without calling Zoom recording APIs", async () => {
  const restoreSelect = replaceDbMethod("select", (() => {
    let selectedTable: unknown;
    const query = {
      from(table: unknown) {
        selectedTable = table;
        return query;
      },
      where() {
        return query;
      },
      async limit() {
        assert.equal(selectedTable, sessionsTable);
        return [];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);
  let zoomApiCalls = 0;
  globalThis.fetch = (async () => {
    zoomApiCalls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const body = JSON.stringify({
      event: "recording.completed",
      event_ts: 1_797_000_000_000,
      payload: {
        object: {
          id: 123456789,
          uuid: "meeting-uuid",
          recording_files: [
            { download_url: "https://zoom.example/private-recording" },
          ],
        },
      },
    });
    const firstResponse = await postWebhook(body);
    const replayResponse = await postWebhook(body);

    assert.equal(firstResponse.status, 200);
    assert.equal(replayResponse.status, 200);
    assert.equal(zoomApiCalls, 0);
  } finally {
    globalThis.fetch = nativeFetch;
    restoreSelect();
  }
});

test("does not expose the manual Zoom recording sync endpoint", async () => {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await nativeFetch(
    `http://127.0.0.1:${address.port}/api/zoom/sessions/9301/recording`,
    { method: "POST" },
  );
  assert.equal(response.status, 404);
});
