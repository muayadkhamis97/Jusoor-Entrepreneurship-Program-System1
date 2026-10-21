import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMentorAdditionalSessionDecisionEmail,
  sendMentorAdditionalSessionDecisionEmail,
} from "../src/lib/mentor-additional-session-email";

const baseInput = {
  requestId: 56,
  recipientEmail: "mentor@example.test",
  mentorName: "Mentor",
  businessName: "Bright & Co",
  programName: "Founders <Spring>",
};

test("approval email states the approved count and escapes HTML content", () => {
  const message = buildMentorAdditionalSessionDecisionEmail({
    ...baseInput,
    decision: "approved",
    approvedAdditionalSessions: 2,
  });

  assert.deepEqual(message.recipients, ["mentor@example.test"]);
  assert.match(message.subject, /approved/);
  assert.match(message.text, /approved\. 2 additional sessions were approved/);
  assert.match(message.html, /Bright &amp; Co/);
  assert.match(message.html, /Founders &lt;Spring&gt;/);
  assert.equal(message.idempotencyKey, "mentor-additional-session-decision-56");
});

test("decline email clearly states the decision without an approved count", () => {
  const message = buildMentorAdditionalSessionDecisionEmail({
    ...baseInput,
    decision: "declined",
    approvedAdditionalSessions: null,
  });

  assert.match(message.subject, /declined/);
  assert.match(message.text, /was declined/);
  assert.doesNotMatch(message.text, /additional sessions were approved/);
});

test("email sender exposes delivery failures to the route for logging", async () => {
  await assert.rejects(
    sendMentorAdditionalSessionDecisionEmail({
      ...baseInput,
      decision: "declined",
      approvedAdditionalSessions: null,
    }, async () => {
      throw new Error("mail unavailable");
    }),
    /mail unavailable/,
  );
});
