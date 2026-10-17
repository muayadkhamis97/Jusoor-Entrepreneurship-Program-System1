import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStaffInvitationEmail,
  sendStaffInvitationEmail,
} from "../src/lib/staff-invitation-email";

test("builds a scoped invitation email with stable retry identity", () => {
  const message = buildStaffInvitationEmail({
    staffId: 42,
    email: "trainer@example.com",
    role: "trainer",
    programNames: ["Spring founders"],
  });

  assert.deepEqual(message.recipients, ["trainer@example.com"]);
  assert.equal(message.subject, "Invitation to join the program team");
  assert.match(message.text, /Role: Trainer\./);
  assert.match(message.text, /Assigned program: Spring founders\./);
  assert.match(message.text, /same verified email address/);
  assert.equal(message.idempotencyKey, "staff-invitation-42");
});

test("escapes program names and scopes admins globally in invitation content", () => {
  const scoped = buildStaffInvitationEmail({
    staffId: 43,
    email: "admin@example.com",
    role: "coordinator",
    programNames: ["Ignored program"],
  });
  const programStaff = buildStaffInvitationEmail({
    staffId: 44,
    email: "staff@example.com",
    role: "staff",
    programNames: ["Founders <North> & Co"],
  });

  assert.match(scoped.html, /Role:<\/strong> Admin/);
  assert.match(scoped.text, /Access: all programs\./);
  assert.doesNotMatch(scoped.text, /Ignored program/);
  assert.match(programStaff.html, /Founders &lt;North&gt; &amp; Co/);
  assert.doesNotMatch(programStaff.html, /<North>/);
});

test("sends the constructed invitation through the injected sender", async () => {
  let sent: ReturnType<typeof buildStaffInvitationEmail> | undefined;
  await sendStaffInvitationEmail({
    staffId: 45,
    email: "mentor@example.com",
    role: "mentor",
    programNames: ["Launch cohort"],
  }, async message => {
    sent = message;
  });

  assert.equal(sent?.recipients[0], "mentor@example.com");
  assert.match(sent?.text ?? "", /Role: Mentor\./);
});
