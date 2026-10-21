import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CreateProgramBody,
  ResolveStaffMentorAdditionalSessionRequestBody,
  UpdateProgramBody,
} from "@workspace/api-zod";
import {
  additionalSessionRequestEligibility,
  canRetryMentorSessionRequestEmail,
  effectiveMentorSessionTarget,
  isValidAdditionalSessionDecision,
} from "../src/lib/mentor-session-quota";

test("program creation and editing accept a non-negative per-business session target", () => {
  const created = CreateProgramBody.safeParse({
    name: "Cohort",
    format: "bootcamp",
    mentorSessionsPerBusiness: 4,
  });
  assert.equal(created.success, true);
  if (created.success) assert.equal(created.data.mentorSessionsPerBusiness, 4);

  const updated = UpdateProgramBody.safeParse({ mentorSessionsPerBusiness: 2 });
  assert.equal(updated.success, true);
  assert.equal(UpdateProgramBody.safeParse({ mentorSessionsPerBusiness: -1 }).success, false);
});

test("additional sessions can only be requested after a configured target is reached", () => {
  assert.equal(additionalSessionRequestEligibility({
    reportedSessions: 0,
    sessionTarget: 0,
    hasOpenRequest: false,
  }), "target_not_configured");
  assert.equal(additionalSessionRequestEligibility({
    reportedSessions: 2,
    sessionTarget: 3,
    hasOpenRequest: false,
  }), "target_not_reached");
  assert.equal(additionalSessionRequestEligibility({
    reportedSessions: 3,
    sessionTarget: 3,
    hasOpenRequest: false,
  }), "eligible");
  assert.equal(additionalSessionRequestEligibility({
    reportedSessions: 4,
    sessionTarget: 3,
    hasOpenRequest: true,
  }), "request_already_open");
});

test("approved session additions increase only the business's effective target", () => {
  assert.equal(effectiveMentorSessionTarget(4, 0), 4);
  assert.equal(effectiveMentorSessionTarget(4, 3), 7);
  assert.equal(effectiveMentorSessionTarget(4, -2), 4);
});

test("staff approval requires a positive bounded count, while decline carries no count", () => {
  assert.equal(ResolveStaffMentorAdditionalSessionRequestBody.safeParse({
    decision: "approved",
    approvedAdditionalSessions: 3,
  }).success, true);
  assert.equal(ResolveStaffMentorAdditionalSessionRequestBody.safeParse({
    decision: "declined",
  }).success, true);
  assert.equal(isValidAdditionalSessionDecision("approved", 1), true);
  assert.equal(isValidAdditionalSessionDecision("approved", 0), false);
  assert.equal(isValidAdditionalSessionDecision("approved", 1001), false);
  assert.equal(isValidAdditionalSessionDecision("declined", undefined), true);
  assert.equal(isValidAdditionalSessionDecision("declined", 1), false);
});

test("failed and stale pending notifications can be retried, but delivered or fresh sends cannot", () => {
  const now = Date.now();
  assert.equal(canRetryMentorSessionRequestEmail("failed", new Date(now), now), true);
  assert.equal(canRetryMentorSessionRequestEmail("delivered", new Date(0), now), false);
  assert.equal(canRetryMentorSessionRequestEmail("pending", new Date(now - 10 * 60 * 1000), now), true);
  assert.equal(canRetryMentorSessionRequestEmail("pending", new Date(now - 10), now), false);
});
