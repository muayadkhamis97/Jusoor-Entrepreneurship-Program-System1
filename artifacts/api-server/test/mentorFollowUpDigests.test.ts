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
        },
        {
          email: "connected@example.org",
          calendlyFollowUpDate: "2026-10-12",
          calendlyBookingUrl: "https://calendly.com/example",
        },
        {
          email: "no-date@example.org",
          calendlyFollowUpDate: null,
          calendlyBookingUrl: null,
        },
        {
          email: "today@example.org",
          calendlyFollowUpDate: "2026-10-15",
          calendlyBookingUrl: null,
        },
        {
          email: "overdue@example.org",
          calendlyFollowUpDate: "2026-10-14",
          calendlyBookingUrl: null,
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
