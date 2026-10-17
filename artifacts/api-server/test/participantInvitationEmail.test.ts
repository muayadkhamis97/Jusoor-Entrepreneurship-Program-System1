import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParticipantInvitationEmail,
  sendParticipantInvitationEmail,
} from "../src/lib/participant-invitation-email";

const input = {
  applicationId: 42,
  email: "participant@example.test",
  participantName: "Mona <Founders>",
  programName: "Spring <Launch>",
  businessName: "North & South",
  expiresAt: new Date("2026-11-16T12:00:00.000Z"),
};

test("participant invitation email names the recipient, assigned scope, and expiry", () => {
  const message = buildParticipantInvitationEmail(input);

  assert.deepEqual(message.recipients, ["participant@example.test"]);
  assert.match(message.text, /Program: Spring <Launch>\./);
  assert.match(message.text, /Business: North & South\./);
  assert.match(message.text, /November 16, 2026/);
  assert.match(message.text, /same verified email address/);
  assert.match(message.html, /Mona &lt;Founders&gt;/);
  assert.match(message.html, /Spring &lt;Launch&gt;/);
  assert.match(message.html, /North &amp; South/);
  assert.doesNotMatch(message.html, /<Founders>/);
  assert.equal(message.idempotencyKey, "participant-invitation-42-1794830400000");
});

test("participant email is sent through the injected platform sender", async () => {
  let delivered: ReturnType<typeof buildParticipantInvitationEmail> | undefined;
  await sendParticipantInvitationEmail(input, async message => {
    delivered = message;
  });

  assert.equal(delivered?.recipients[0], input.email);
  assert.match(delivered?.text ?? "", /assigned program and business/);
});
