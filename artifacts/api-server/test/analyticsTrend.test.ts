import assert from "node:assert/strict";
import { test } from "node:test";

test("weekly poll and survey trends compare adjacent eligible periods and skip draft or ineligible activity", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const { buildSessionInteractionTrend } = await import("../src/routes/analytics");

  const trend = buildSessionInteractionTrend("2026-09-01", "2026-09-30", "weekly", [
    { sessionDate: "2026-09-02", status: "open", responseCount: 2, eligibleBusinesses: 10 },
    { sessionDate: "2026-09-08", status: "draft", responseCount: 0, eligibleBusinesses: 10 },
    { sessionDate: "2026-09-15", status: "closed", responseCount: 3, eligibleBusinesses: 15 },
    { sessionDate: "2026-09-22", status: "open", responseCount: 6, eligibleBusinesses: 15 },
    { sessionDate: "2026-09-29", status: "closed", responseCount: 0, eligibleBusinesses: 0 },
  ]);

  assert.equal(trend.length, 5);
  assert.deepEqual(
    trend.map(({ activityCount, responseCount, responseRate }) => ({ activityCount, responseCount, responseRate })),
    [
      { activityCount: 1, responseCount: 2, responseRate: 20 },
      { activityCount: 0, responseCount: null, responseRate: null },
      { activityCount: 1, responseCount: 3, responseRate: 20 },
      { activityCount: 1, responseCount: 6, responseRate: 40 },
      { activityCount: 0, responseCount: null, responseRate: null },
    ],
  );
  assert.equal(trend[3].responseCountChange, 3);
  assert.equal(trend[3].responseRateChange, 20);
  assert.equal(trend[2].responseCountChange, null);
  assert.equal(trend[4].responseCountChange, null);
});

test("monthly trends use calendar months and clip displayed period boundaries to the selected range", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const { buildSessionInteractionTrend } = await import("../src/routes/analytics");

  const trend = buildSessionInteractionTrend("2026-01-15", "2026-03-02", "monthly", [
    { sessionDate: "2026-01-22", status: "closed", responseCount: 1, eligibleBusinesses: 5 },
    { sessionDate: "2026-02-12", status: "open", responseCount: 4, eligibleBusinesses: 10 },
    { sessionDate: "2026-03-01", status: "draft", responseCount: 0, eligibleBusinesses: 10 },
  ]);

  assert.deepEqual(trend.map(({ periodStart, periodEnd }) => [periodStart, periodEnd]), [
    ["2026-01-15", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-02"],
  ]);
  assert.deepEqual(trend.map(({ responseCount, responseRate }) => [responseCount, responseRate]), [
    [1, 20],
    [4, 40],
    [null, null],
  ]);
  assert.equal(trend[1].responseCountChange, 3);
  assert.equal(trend[1].responseRateChange, 20);
});
