import assert from "node:assert/strict";
import test from "node:test";
import { CreateIntegrationApiKeyBody } from "@workspace/api-zod";
import {
  createIntegrationApiKeySecret,
  hashIntegrationApiKey,
  integrationApiKeyAllowsRequest,
  integrationApiPermissionForRequest,
} from "../src/routes/integrationApiKeys";

test("API key secrets are high-entropy, prefixed, and hashed deterministically", () => {
  const first = createIntegrationApiKeySecret();
  const second = createIntegrationApiKeySecret();

  assert.match(first, /^jusoor_live_[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first, second);
  assert.equal(hashIntegrationApiKey(first), hashIntegrationApiKey(first));
  assert.match(hashIntegrationApiKey(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashIntegrationApiKey(first), first);
});

test("program and schedule endpoints map to separate read and write permissions", () => {
  assert.equal(integrationApiPermissionForRequest("GET", "/programs/12"), "programs_sessions:read");
  assert.equal(integrationApiPermissionForRequest("PATCH", "/programs/12"), "programs_sessions:write");
  assert.equal(integrationApiPermissionForRequest("POST", "/programs/12/resources/sessions"), "programs_sessions:write");
  assert.equal(integrationApiPermissionForRequest("HEAD", "/programs/12/resources/sessions"), "programs_sessions:read");
});

test("each API resource maps to its configured permission group", () => {
  const groupByResource = {
    applications: "applications_businesses",
    businesses: "applications_businesses",
    sessions: "programs_sessions",
    "course-modules": "courses_attendance",
    attendance: "courses_attendance",
    "learning-progress": "courses_attendance",
    mentoring: "mentoring_grants",
    pitches: "mentoring_grants",
    "grant-receipts": "mentoring_grants",
  } as const;

  for (const [resource, group] of Object.entries(groupByResource)) {
    assert.equal(
      integrationApiPermissionForRequest("GET", `/programs/12/resources/${resource}`),
      `${group}:read`,
      `${resource} GET permission`,
    );
    assert.equal(
      integrationApiPermissionForRequest("POST", `/programs/12/resources/${resource}`),
      `${group}:write`,
      `${resource} POST permission`,
    );
    assert.equal(
      integrationApiPermissionForRequest("PATCH", `/programs/12/resources/${resource}/45`),
      `${group}:write`,
      `${resource} PATCH permission`,
    );
  }
});

test("unrecognized resources and hard deletes do not receive an API permission", () => {
  assert.equal(integrationApiPermissionForRequest("DELETE", "/programs/12/resources/businesses/45"), null);
  assert.equal(integrationApiPermissionForRequest("GET", "/programs/12/resources/unknown"), null);
  assert.equal(integrationApiPermissionForRequest("POST", "/other-path"), null);
});

test("API permissions distinguish read-only, write-only, and unrelated data groups", () => {
  const readOnly = ["applications_businesses:read"] as const;
  const writeOnly = ["applications_businesses:write"] as const;

  assert.equal(integrationApiKeyAllowsRequest(readOnly, "GET", "/programs/12/resources/applications"), true);
  assert.equal(integrationApiKeyAllowsRequest(readOnly, "PATCH", "/programs/12/resources/businesses/45"), false);
  assert.equal(integrationApiKeyAllowsRequest(writeOnly, "POST", "/programs/12/resources/applications"), true);
  assert.equal(integrationApiKeyAllowsRequest(writeOnly, "GET", "/programs/12/resources/applications"), false);
  assert.equal(integrationApiKeyAllowsRequest(readOnly, "GET", "/programs/12/resources/pitches"), false);
});

test("API key creation requires at least one known permission", () => {
  const input = { label: "Reports", programId: 12 };
  assert.equal(CreateIntegrationApiKeyBody.safeParse({
    ...input,
    permissions: ["applications_businesses:read"],
  }).success, true);
  assert.equal(CreateIntegrationApiKeyBody.safeParse({ ...input, permissions: [] }).success, false);
  assert.equal(CreateIntegrationApiKeyBody.safeParse({
    ...input,
    permissions: ["root:admin"],
  }).success, false);
});
