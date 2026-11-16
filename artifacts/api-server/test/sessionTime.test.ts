import assert from "node:assert/strict";
import test from "node:test";
import { getSessionTimeIssue } from "../src/lib/session-time";

test("session validation identifies a spring-forward time that does not exist", () => {
  assert.equal(
    getSessionTimeIssue("2026-03-08", "02:30", "America/New_York"),
    "nonexistent",
  );
  assert.equal(
    getSessionTimeIssue("2026-03-08", "03:30", "America/New_York"),
    null,
  );
});

test("session validation identifies a fall-back time that occurs twice", () => {
  assert.equal(
    getSessionTimeIssue("2026-11-01", "01:30", "America/New_York"),
    "repeated",
  );
  assert.equal(
    getSessionTimeIssue("2026-11-01", "03:30", "America/New_York"),
    null,
  );
});
