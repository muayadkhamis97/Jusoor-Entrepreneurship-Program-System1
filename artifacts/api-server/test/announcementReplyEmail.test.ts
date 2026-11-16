import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStaffReplyNotificationEmail,
  participantAnnouncementConversationUrl,
  sendStaffReplyNotification,
} from "../src/lib/announcement-reply-email";
import {
  SendParticipantAnnouncementReplyResponse,
  SendStaffAnnouncementReplyResponse,
} from "@workspace/api-zod";

const input = {
  replyId: 27,
  announcementId: 41,
  applicationId: 101,
  participantEmail: "founder@example.com",
  participantName: "Founder One",
  programName: "Cohort One",
};

test("private-reply email links to the exact participant conversation without message text", () => {
  const url = participantAnnouncementConversationUrl("https://program.example", 41, 101);
  assert.equal(url, "https://program.example/participant/updates?announcementId=41&applicationId=101");
  const message = buildStaffReplyNotificationEmail(input, url!);
  assert.deepEqual(message.recipients, ["founder@example.com"]);
  assert.equal(message.idempotencyKey, "jusoor-private-reply-27");
  assert.match(message.text, /replied to your private message/);
  assert.match(message.text, /announcementId=41&applicationId=101/);
  assert.doesNotMatch(message.text + message.html, /private content|staff reply body/i);
});

test("notification failures are returned as safe statuses and uncertain sends stay distinct", async () => {
  const failed = await sendStaffReplyNotification(input, "https://program.example", async () => ({ kind: "transient" }));
  assert.deepEqual(failed, { status: "failed", failureKind: "transient" });
  const uncertain = await sendStaffReplyNotification(input, "https://program.example", async () => ({ kind: "ambiguous" }));
  assert.deepEqual(uncertain, { status: "uncertain", failureKind: "ambiguous" });
  const invalidUrl = await sendStaffReplyNotification(input, "http://not-secure.example", async () => {
    assert.fail("The provider must not be called when the app link is invalid.");
  });
  assert.deepEqual(invalidUrl, { status: "failed", failureKind: "transient" });
});

test("email HTML escapes participant-provided text and uses a generic subject", () => {
  const message = buildStaffReplyNotificationEmail({
    ...input,
    participantName: "<Founder>",
    programName: "Cohort & One",
  }, "https://program.example/participant/updates");
  assert.equal(message.subject, "A private reply from your program team");
  assert.match(message.html, /&lt;Founder&gt;/);
  assert.match(message.html, /Cohort &amp; One/);
  assert.doesNotMatch(message.html, /<Founder>|Cohort & One/);
});

test("delivery diagnostics are staff-only in generated reply response contracts", () => {
  const reply = {
    id: 27,
    sender: "staff",
    body: "The reply stays private.",
    createdAt: "2026-10-22T11:00:00.000Z",
    readAt: null,
    emailNotificationStatus: "failed",
    emailNotificationFailureKind: "transient",
  };
  const participantReply = SendParticipantAnnouncementReplyResponse.parse(reply);
  assert.equal("emailNotificationStatus" in participantReply, false);
  const staffReply = SendStaffAnnouncementReplyResponse.parse(reply);
  assert.equal(staffReply.emailNotificationStatus, "failed");
  assert.equal(staffReply.emailNotificationFailureKind, "transient");
});
