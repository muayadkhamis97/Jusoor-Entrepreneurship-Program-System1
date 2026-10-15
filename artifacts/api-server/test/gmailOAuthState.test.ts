import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  isGmailOAuthStateValid,
  openGmailOAuthState,
  openGmailRefreshToken,
  sealGmailOAuthState,
  sealGmailRefreshToken,
  type GmailOAuthState,
} from "../src/lib/gmailOAuthState";

const originalSecret = process.env.SESSION_SECRET;

before(() => {
  process.env.SESSION_SECRET = "unit-test-session-secret-that-is-not-used-outside-this-process";
});

after(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

function state(overrides: Partial<GmailOAuthState> = {}): GmailOAuthState {
  return {
    staffId: 17,
    state: "oauth-state-value",
    codeVerifier: "pkce-verifier-value",
    origin: "https://app.example.test",
    redirectUri: "https://app.example.test/api/email-sender/google/callback",
    returnPath: "/workspace/api-integrations",
    expiresAt: 2_000,
    ...overrides,
  };
}

test("Gmail OAuth state is encrypted and round-trips without exposing its values", () => {
  const value = state();
  const sealed = sealGmailOAuthState(value);
  assert.equal(sealed.includes(value.state), false);
  assert.equal(sealed.includes(value.codeVerifier), false);
  assert.deepEqual(openGmailOAuthState(sealed), value);
});

test("Gmail OAuth state validation rejects altered, mismatched, and expired state", () => {
  const value = state();
  const sealed = sealGmailOAuthState(value);
  assert.equal(openGmailOAuthState(`${sealed.slice(0, -1)}x`), null);
  assert.equal(isGmailOAuthStateValid(value, "wrong-state", 1_000), false);
  assert.equal(isGmailOAuthStateValid(value, value.state, 2_001), false);
  assert.equal(isGmailOAuthStateValid(value, value.state, 2_000), true);
});

test("Gmail refresh tokens are encrypted with a separate purpose key", () => {
  const encrypted = sealGmailRefreshToken("synthetic-refresh-token");
  assert.equal(encrypted.includes("synthetic-refresh-token"), false);
  assert.equal(openGmailRefreshToken(encrypted), "synthetic-refresh-token");
  assert.equal(openGmailRefreshToken(sealGmailOAuthState(state())), null);
});
