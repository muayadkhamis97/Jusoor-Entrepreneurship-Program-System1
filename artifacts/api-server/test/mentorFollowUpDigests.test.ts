import assert from "node:assert/strict";
import test from "node:test";
import {
  getProgramCalendarDate,
  isMentorFollowUpDigestDue,
  selectOverdueMentors,
} from "../src/lib/mentor-follow-up-digests";

test("mentor follow-up digest uses the Asia/Amman calendar day and morning send time", () => {
  assert.equal(
    getProgramCalendarDate(new Date("2026-10-14T20:59:00.000Z")),
    "2026-10-14",
  );
  assert.equal(
    getProgramCalendarDate(new Date("2026-10-14T21:00:00.000Z")),
    "2026-10-15",
  );
  assert.equal(
    isMentorFollowUpDigestDue(new Date("2026-10-15T05:59:00.000Z")),
    false,
  );
  assert.equal(
    isMentorFollowUpDigestDue(new Date("2026-10-15T06:00:00.000Z")),
    true,
  );
});

test("digest includes only unconnected mentors with follow-up dates before today", () => {
  assert.deepEqual(
    selectOverdueMentors(
      [
        {
          email: "tomorrow@example.org",
          calendlyFollowUpDate: "2026-10-16",
          calendlyBookingUrl: null,
          googleCalendarAccountEmail: null,
        },
        {
          email: "connected@example.org",
          calendlyFollowUpDate: "2026-10-12",
          calendlyBookingUrl: "https://calendly.com/example",
          googleCalendarAccountEmail: null,
        },
        {
          email: "no-date@example.org",
          calendlyFollowUpDate: null,
          calendlyBookingUrl: null,
          googleCalendarAccountEmail: null,
        },
        {
          email: "today@example.org",
          calendlyFollowUpDate: "2026-10-15",
          calendlyBookingUrl: null,
          googleCalendarAccountEmail: null,
        },
        {
          email: "overdue@example.org",
          calendlyFollowUpDate: "2026-10-14",
          calendlyBookingUrl: null,
          googleCalendarAccountEmail: null,
        },
      ],
      "2026-10-15",
    ),
    [
      {
        email: "overdue@example.org",
        calendlyFollowUpDate: "2026-10-14",
      },
    ],
  );
});

test("digest excludes Google-connected and dual-connected mentors with old follow-up dates", () => {
  const googleMentor = {
    email: "google@example.test",
    calendlyFollowUpDate: "2026-10-01",
    calendlyBookingUrl: null,
    googleCalendarAccountEmail: "private@example.test",
  };
  assert.deepEqual(selectOverdueMentors([
    googleMentor,
    { ...googleMentor, email: "both@example.test", calendlyBookingUrl: "https://calendly.com/example" },
  ], "2026-10-19"), []);
  assert.deepEqual(selectOverdueMentors([
    { ...googleMentor, googleCalendarAccountEmail: null },
  ], "2026-10-19"), [{ email: "google@example.test", calendlyFollowUpDate: "2026-10-01" }]);
});
