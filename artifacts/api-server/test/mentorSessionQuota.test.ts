import assert from "node:assert/strict";
import { test } from "node:test";
import { CreateProgramBody, UpdateProgramBody } from "@workspace/api-zod";
import { additionalSessionRequestEligibility } from "../src/lib/mentor-session-quota";

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
