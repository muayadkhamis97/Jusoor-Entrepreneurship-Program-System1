import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encryptGoogleCalendarToken,
  findGoogleCalendarBusinessMatch,
  googleCalendarPrivacy,
} from "../src/lib/googleCalendarSync";

const assignedBusinesses = [
  { id: 31, email: "founder@example.com" },
  { id: 42, email: "other@example.com" },
];

test("matches a calendar event only to a unique assigned founder hosted by the linked mentor", () => {
  const event = {
    organizer: { email: "mentor@example.com" },
    attendees: [{ email: "founder@example.com" }, { email: "mentor@example.com" }],
  };
  assert.equal(
    findGoogleCalendarBusinessMatch(event, "Mentor@example.com", assignedBusinesses),
    31,
  );
  assert.equal(
    findGoogleCalendarBusinessMatch(
      { ...event, attendees: [...event.attendees, { email: "unknown@example.com" }] },
      "mentor@example.com",
      assignedBusinesses,
    ),
    31,
  );
  assert.equal(findGoogleCalendarBusinessMatch(event, "different@example.com", assignedBusinesses), null);
});

test("does not match unassigned or ambiguous founder email addresses", () => {
  assert.equal(
    findGoogleCalendarBusinessMatch({
      organizer: { email: "mentor@example.com" },
      attendees: [{ email: "unassigned@example.com" }],
    }, "mentor@example.com", assignedBusinesses),
    null,
  );
  assert.equal(
    findGoogleCalendarBusinessMatch({
      organizer: { email: "mentor@example.com" },
      attendees: [{ email: "shared@example.com" }],
    }, "mentor@example.com", [
      { id: 1, email: "shared@example.com" },
      { id: 2, email: "shared@example.com" },
    ]),
    null,
  );
  assert.equal(
    findGoogleCalendarBusinessMatch({
      organizer: { email: "mentor@example.com" },
      attendees: [{ email: "founder@example.com" }, { email: "other@example.com" }],
    }, "mentor@example.com", assignedBusinesses),
    null,
  );
});

test("encrypts OAuth tokens before they are stored", () => {
  process.env.SESSION_SECRET = "google-calendar-test-secret";
  const encrypted = encryptGoogleCalendarToken("private-refresh-token");
  assert.notEqual(encrypted, "private-refresh-token");
  assert.equal(encrypted.split(".").length, 3);
});

test("requests only event fields needed for booking matching and history", () => {
  for (const requiredField of ["id", "status", "updated", "start(dateTime,timeZone)", "end(dateTime,timeZone)", "attendees(email)", "organizer(email)"]) {
    assert.ok(googleCalendarPrivacy.eventFields.includes(requiredField));
  }
  for (const privateField of ["summary", "description", "location", "conferenceData", "displayName"]) {
    assert.equal(googleCalendarPrivacy.eventFields.includes(privateField), false);
  }
});
