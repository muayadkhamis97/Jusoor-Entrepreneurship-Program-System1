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
  assert.equal(message.subject, "Program Hub: Your invitation to join the program team");
  assert.match(message.text, /Role: Trainer\./);
  assert.match(message.text, /Assigned program: Spring founders\./);
  assert.match(message.text, /same verified email address/);
  assert.match(message.text, /Open the program system: https:\/\/entrep-system\.replit\.app\/sign-in/);
  assert.match(message.html, /<a href="https:\/\/entrep-system\.replit\.app\/sign-in">Open the program system<\/a>/);
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
  }, async () => ({ brandName: "Future Founders", logoUrl: null, primaryColor: "#28665a", accentColor: "#d98a46" }));

  assert.equal(sent?.recipients[0], "mentor@example.com");
  assert.equal(sent?.subject, "Future Founders: Your invitation to join the program team");
  assert.match(sent?.text ?? "", /The Future Founders program team has invited you/);
  assert.match(sent?.text ?? "", /Role: Mentor\./);
});

test("staff invitation safely includes the current Unicode brand in subject and body", () => {
  const message = buildStaffInvitationEmail({
    staffId: 46, email: "mentor@example.com", role: "mentor", programNames: [],
  }, "أعمال <North> & Co\r\nTeam");
  assert.equal(message.subject, "أعمال <North> & Co Team: Your invitation to join the program team");
  assert.match(message.html, /أعمال &lt;North&gt; &amp; Co Team/);
  assert.match(message.text, /reply to this email/);
  assert.equal(message.idempotencyKey, "staff-invitation-46");
});

test("an explicit staff resend gets a stable, separate delivery identity", () => {
  const input = {
    staffId: 47,
    email: "mentor@example.com",
    role: "mentor" as const,
    programNames: [],
  };
  const first = buildStaffInvitationEmail({ ...input, resendRequestId: "3e1346e6-b86f-4b7a-8f2a-521932ea1cc0" });
  const retry = buildStaffInvitationEmail({ ...input, resendRequestId: "3e1346e6-b86f-4b7a-8f2a-521932ea1cc0" });
  const nextResend = buildStaffInvitationEmail({ ...input, resendRequestId: "a7fb6a6b-3f8b-4615-91a9-5290b7682a21" });

  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.notEqual(first.idempotencyKey, nextResend.idempotencyKey);
});
