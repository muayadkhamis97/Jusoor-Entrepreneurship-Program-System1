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
  }, async () => ({ brandName: "Future Founders", logoUrl: null, primaryColor: "#28665a", accentColor: "#d98a46" }));

  assert.equal(delivered?.recipients[0], input.email);
  assert.equal(delivered?.subject, "Future Founders: Your program invitation");
  assert.match(delivered?.text ?? "", /The Future Founders program team has invited you/);
  assert.match(delivered?.text ?? "", /assigned program and business/);
});

test("participant invitation escapes its brand and keeps its original retry identity", () => {
  const message = buildParticipantInvitationEmail(input, "أعمال <North> & Co\nTeam");
  assert.equal(message.subject, "أعمال <North> & Co Team: Your program invitation");
  assert.match(message.html, /أعمال &lt;North&gt; &amp; Co Team/);
  assert.match(message.text, /reply to this email/);
  assert.equal(message.idempotencyKey, "participant-invitation-42-1794830400000");
});

test("an explicit participant resend gets a stable, separate delivery identity", () => {
  const first = buildParticipantInvitationEmail({ ...input, resendRequestId: "3e1346e6-b86f-4b7a-8f2a-521932ea1cc0" });
  const retry = buildParticipantInvitationEmail({ ...input, resendRequestId: "3e1346e6-b86f-4b7a-8f2a-521932ea1cc0" });
  const nextResend = buildParticipantInvitationEmail({ ...input, resendRequestId: "a7fb6a6b-3f8b-4615-91a9-5290b7682a21" });

  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.notEqual(first.idempotencyKey, nextResend.idempotencyKey);
  assert.match(first.idempotencyKey, /resend-3e1346e6-b86f-4b7a-8f2a-521932ea1cc0$/);
});
