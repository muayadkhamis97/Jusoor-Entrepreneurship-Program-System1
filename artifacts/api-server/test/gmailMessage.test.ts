import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGmailRawMessage } from "../src/lib/gmailMessage";

test("Gmail MIME hides recipient addresses and encodes bilingual message bodies", () => {
  const raw = buildGmailRawMessage({
    from: "sender@example.test",
    recipients: ["one@example.test", "two@example.test"],
    subject: "جلسة التدريب – reminders",
    text: "مرحباً",
    html: "<p>مرحباً</p>",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /To: undisclosed-recipients:;/);
  assert.match(decoded, /Bcc: one@example\.test, two@example\.test/);
  assert.doesNotMatch(decoded, /^Cc:/m);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
  assert.match(decoded, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(decoded, /Content-Type: text\/html; charset=UTF-8/);
});

test("Gmail MIME rejects recipient and header injection", () => {
  assert.throws(() => buildGmailRawMessage({
    from: "sender@example.test",
    recipients: ["bad@example.test\r\nBcc: victim@example.test"],
    subject: "Safe subject",
    text: "Message",
    html: "<p>Message</p>",
  }), /address is invalid/);
  assert.throws(() => buildGmailRawMessage({
    from: "sender@example.test",
    recipients: ["one@example.test"],
    subject: "Safe subject\r\nBcc: victim@example.test",
    text: "Message",
    html: "<p>Message</p>",
  }), /subject is invalid/);
});
