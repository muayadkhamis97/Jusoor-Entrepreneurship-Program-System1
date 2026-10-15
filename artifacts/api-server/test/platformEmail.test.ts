import assert from "node:assert/strict";
import test from "node:test";
import { sendPlatformEmail } from "../src/lib/platform-email";

test("platform email requires a configured sender before delivery", async () => {
  await assert.rejects(
    sendPlatformEmail({
      recipients: ["participant@example.test"],
      subject: "Reminder",
      text: "Reminder",
      html: "<p>Reminder</p>",
    }),
    /platform email sender is not configured/i,
  );
});

test("platform email rejects empty recipients before delivery", async () => {
  await assert.rejects(
    sendPlatformEmail({
      recipients: [],
      subject: "Reminder",
      text: "Reminder",
      html: "<p>Reminder</p>",
      fallbackFrom: "notifications@example.test",
    }),
    /email has no recipients/i,
  );
});
