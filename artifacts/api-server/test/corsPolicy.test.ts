import assert from "node:assert/strict";
import test from "node:test";
import { buildAllowedOrigins, createCorsOptionsDelegate, isOriginAllowed } from "../src/lib/corsPolicy";

const prodEnv = {
  NODE_ENV: "production",
  REPLIT_DOMAINS: "hub.replit.app, hub.example.org",
  CORS_ALLOWED_ORIGINS: "https://portal.example.org/, not a url",
};

function optionsFor(env: Record<string, string | undefined>, url: string, origin?: string) {
  let result: unknown;
  createCorsOptionsDelegate(env)({ url, method: "GET", headers: origin ? { origin } : {} } as never, (_error, options) => {
    result = options;
  });
  return result as { origin: unknown; credentials: boolean };
}

test("allowed origins come from Replit domains and the explicit list, ignoring junk", () => {
  assert.deepEqual(
    [...buildAllowedOrigins(prodEnv)].sort(),
    ["https://hub.example.org", "https://hub.replit.app", "https://portal.example.org"],
  );
});

test("credentialed API access is refused for unknown origins in production", () => {
  assert.equal(isOriginAllowed("https://hub.replit.app", prodEnv), true);
  assert.equal(isOriginAllowed("https://portal.example.org", prodEnv), true);
  assert.equal(isOriginAllowed("https://evil.example.com", prodEnv), false);
  assert.equal(isOriginAllowed("http://localhost:5173", prodEnv), false);
  assert.equal(isOriginAllowed(undefined, prodEnv), false);
  assert.deepEqual(optionsFor(prodEnv, "/api/participant/profile", "https://evil.example.com"), { origin: false, credentials: true });
  assert.deepEqual(optionsFor(prodEnv, "/api/participant/profile", "https://hub.replit.app"), { origin: true, credentials: true });
});

test("localhost is only allowed outside production", () => {
  assert.equal(isOriginAllowed("http://localhost:5173", { NODE_ENV: "development" }), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:3000", { NODE_ENV: "test" }), true);
});

test("the API-key integration API stays readable from any origin but never with credentials", () => {
  assert.deepEqual(optionsFor(prodEnv, "/api/v1/programs?x=1", "https://partner.example.net"), { origin: true, credentials: false });
  assert.deepEqual(optionsFor(prodEnv, "/api/v1", "https://partner.example.net"), { origin: true, credentials: false });
  assert.deepEqual(optionsFor(prodEnv, "/api/v10/x", "https://evil.example.com"), { origin: false, credentials: true });
});
