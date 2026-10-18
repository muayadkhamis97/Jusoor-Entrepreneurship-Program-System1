import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const { findUniqueApplicationIdForEmail, findUniqueBusinessIdForEmail } = await import("../src/lib/zoom-attendance");

test("matches a Zoom email to one business despite case and whitespace differences", () => {
  assert.equal(
    findUniqueBusinessIdForEmail(" Founder@Example.org ", [
      { id: 12, email: "founder@example.org" },
      { id: 13, email: "other@example.org" },
    ]),
    12,
  );
});

test("leaves missing or duplicate emails unmatched instead of guessing", () => {
  const businesses = [
    { id: 12, email: "shared@example.org" },
    { id: 13, email: "shared@example.org" },
  ];
  assert.equal(findUniqueBusinessIdForEmail(null, businesses), null);
  assert.equal(findUniqueBusinessIdForEmail("", businesses), null);
  assert.equal(findUniqueBusinessIdForEmail("shared@example.org", businesses), null);
});

test("matches a Zoom attendee to one accepted participant email", () => {
  assert.equal(
    findUniqueApplicationIdForEmail(" Participant@Example.org ", [
      { id: 42, email: "participant@example.org" },
      { id: 43, email: "other@example.org" },
    ]),
    42,
  );
});

test("does not guess when an attendee email is absent or ambiguous", () => {
  const participants = [
    { id: 42, email: "shared@example.org" },
    { id: 43, email: "shared@example.org" },
  ];
  assert.equal(findUniqueApplicationIdForEmail(null, participants), null);
  assert.equal(findUniqueApplicationIdForEmail("", participants), null);
  assert.equal(findUniqueApplicationIdForEmail("shared@example.org", participants), null);
});
