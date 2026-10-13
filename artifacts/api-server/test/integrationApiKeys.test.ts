import assert from "node:assert/strict";
import test from "node:test";
import { createIntegrationApiKeySecret, hashIntegrationApiKey } from "../src/routes/integrationApiKeys";

test("API key secrets are high-entropy, prefixed, and hashed deterministically", () => {
  const first = createIntegrationApiKeySecret();
  const second = createIntegrationApiKeySecret();

  assert.match(first, /^jusoor_live_[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first, second);
  assert.equal(hashIntegrationApiKey(first), hashIntegrationApiKey(first));
  assert.match(hashIntegrationApiKey(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashIntegrationApiKey(first), first);
});
