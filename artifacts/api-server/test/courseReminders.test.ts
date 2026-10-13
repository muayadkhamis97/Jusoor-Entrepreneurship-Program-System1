import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCourseReminderSchedule } from "../src/lib/course-reminders";

const now = new Date("2026-10-14T12:00:00.000Z");

function module(overrides: Partial<Parameters<typeof buildCourseReminderSchedule>[0][number]> = {}) {
  return {
    moduleId: 1,
    programId: 9,
    dueAt: null,
    releaseAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    position: 1,
    isRequired: true,
    isPublished: true,
    ...overrides,
  };
}

const applications = [{ id: 101, programId: 9 }];

test("deadline reminders are scheduled in the three-day, due-day, and overdue windows", () => {
  const schedules = buildCourseReminderSchedule([
    module({ moduleId: 1, dueAt: new Date(now.getTime() + 60 * 60 * 60 * 1000) }),
    module({ moduleId: 2, dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000) }),
    module({ moduleId: 3, dueAt: new Date(now.getTime() - 80 * 60 * 60 * 1000) }),
  ], applications, [], [], now);

  assert.deepEqual(schedules.filter(({ reminderKind }) => reminderKind !== "weekly_incomplete")
    .map(({ moduleId, reminderKind }) => [moduleId, reminderKind]), [
    [1, "three_days_before"],
    [2, "deadline_day"],
    [3, "three_days_overdue"],
  ]);
});

test("modules without deadlines get weekly reminders only after inactivity and a week-old start", () => {
  const schedules = buildCourseReminderSchedule(
    [module({ moduleId: 1, dueAt: null })],
    applications,
    [],
    [{ applicationId: 101, lastActivityAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) }],
    now,
  );

  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].reminderKind, "weekly_incomplete");
  assert.equal(schedules[0].moduleId, 1);
  assert.equal(schedules[0].dueAt.toISOString(), "2026-10-12T00:00:00.000Z");
});

test("recent activity, future due dates, and recently released modules do not get weekly reminders", () => {
  const schedules = buildCourseReminderSchedule([
    module({ moduleId: 1, dueAt: null }),
    module({ moduleId: 2, dueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), position: 2 }),
    module({
      moduleId: 3,
      dueAt: null,
      releaseAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      position: 3,
    }),
  ], applications, [], [
    { applicationId: 101, lastActivityAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
  ], now);

  assert.deepEqual(schedules.map(({ moduleId, reminderKind }) => [moduleId, reminderKind]), [
    [2, "three_days_before"],
  ]);
  assert.equal(schedules.some(({ reminderKind }) => reminderKind === "weekly_incomplete"), false);
});

test("completed modules are excluded from deadline and weekly reminders", () => {
  const completedAt = new Date("2026-10-01T00:00:00.000Z");
  const schedules = buildCourseReminderSchedule([
    module({ moduleId: 1, dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000) }),
    module({ moduleId: 2, dueAt: null, position: 2 }),
  ], applications, [
    { applicationId: 101, moduleId: 1, completedAt },
    { applicationId: 101, moduleId: 2, completedAt },
  ], [], now);

  assert.deepEqual(schedules, []);
});

test("only published, required, released modules can be scheduled", () => {
  const schedules = buildCourseReminderSchedule([
    module({ moduleId: 1, dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000) }),
    module({ moduleId: 2, dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000), isRequired: false }),
    module({ moduleId: 3, dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000), isPublished: false }),
    module({
      moduleId: 4,
      dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      releaseAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    }),
  ], applications, [], [], now);

  assert.deepEqual(schedules.map(({ moduleId }) => moduleId), [1]);
});
