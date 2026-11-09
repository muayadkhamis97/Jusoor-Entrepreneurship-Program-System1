import assert from "node:assert/strict";
import { test } from "node:test";
import { pool } from "@workspace/db";
import { withGoogleCalendarSyncLease } from "../src/lib/googleCalendarSync";

test("PostgreSQL advisory sync locks coordinate sessions per mentor", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a disposable PostgreSQL database.",
  timeout: 30_000,
}, async () => {
  const mentorStaffId = 2_147_483_000;
  const firstClient = await pool.connect();
  let firstSyncStarted!: () => void;
  let releaseFirstSync!: () => void;
  const firstStarted = new Promise<void>(resolve => { firstSyncStarted = resolve; });
  const firstGate = new Promise<void>(resolve => { releaseFirstSync = resolve; });
  const firstSync = withGoogleCalendarSyncLease(mentorStaffId, async () => {
    firstSyncStarted();
    await firstGate;
  }, async () => firstClient);
  try {
    await firstStarted;

    const differentMentorClient = await pool.connect();
    assert.equal(await withGoogleCalendarSyncLease(mentorStaffId + 1, async () => {}, async () => differentMentorClient), true);

    const competingClient = await pool.connect();
    let competingSyncRan = false;
    assert.equal(await withGoogleCalendarSyncLease(mentorStaffId, async () => {
      competingSyncRan = true;
    }, async () => competingClient), false);
    assert.equal(competingSyncRan, false, "A competing PostgreSQL session must not run the same mentor sync.");

    releaseFirstSync();
    assert.equal(await firstSync, true);

    const retryClient = await pool.connect();
    assert.equal(await withGoogleCalendarSyncLease(mentorStaffId, async () => {}, async () => retryClient), true);
  } finally {
    releaseFirstSync();
    await firstSync.catch(() => {});
    await pool.end();
  }
});
