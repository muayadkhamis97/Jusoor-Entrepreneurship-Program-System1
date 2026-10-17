import assert from "node:assert/strict";
import test from "node:test";
import { displayIntegrationApiKeyPrefix, extractIntegrationApiKey } from "./integrationApiKeyFormat";

test("new integration keys use a neutral visible prefix", () => {
  const key = `program_live_${"x".repeat(43)}`;
  assert.equal(extractIntegrationApiKey(`Bearer ${key}`), key);
  assert.equal(displayIntegrationApiKeyPrefix(key.slice(0, 18)), "program_live_xxxxx");
});

test("previously issued keys remain valid while their displayed prefix is neutral", () => {
  const key = `jusoor_live_${"y".repeat(43)}`;
  assert.equal(extractIntegrationApiKey(`Bearer ${key}`), key);
  assert.equal(displayIntegrationApiKeyPrefix(key.slice(0, 18)), "program_live_yyyyyy");
});

test("invalid authorization values do not parse as integration keys", () => {
  assert.equal(extractIntegrationApiKey("Bearer invalid"), null);
  assert.equal(extractIntegrationApiKey(`Bearer program_live_${"z".repeat(42)}`), null);
  assert.equal(extractIntegrationApiKey(`program_live_${"z".repeat(43)}`), null);
});
