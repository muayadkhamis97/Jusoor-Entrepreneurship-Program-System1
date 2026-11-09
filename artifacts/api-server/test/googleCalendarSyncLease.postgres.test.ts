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

    const terminatedClient = await pool.connect();
    // This test intentionally closes the socket while no query is pending.
    // Observe pg's expected client error event; the lease promise is asserted below.
    terminatedClient.on("error", () => {});
    const { rows: backendRows } = await terminatedClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const terminatedBackendPid = backendRows[0]!.pid;
    let terminatedSyncStarted!: () => void;
    let releaseTerminatedSync!: () => void;
    const terminatedStarted = new Promise<void>(resolve => { terminatedSyncStarted = resolve; });
    const terminatedGate = new Promise<void>(resolve => { releaseTerminatedSync = resolve; });
    const terminatedSync = withGoogleCalendarSyncLease(mentorStaffId, async () => {
      terminatedSyncStarted();
      await terminatedGate;
    }, async () => terminatedClient);
    const terminatedSyncOutcome = terminatedSync.then(
      value => ({ value }),
      error => ({ error }),
    );
    await terminatedStarted;

    let terminationClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    try {
      terminationClient = await pool.connect();
      const { rows } = await terminationClient.query<{ terminated: boolean }>(
        "SELECT pg_terminate_backend($1) AS terminated",
        [terminatedBackendPid],
      );
      assert.equal(rows[0]?.terminated, true, "PostgreSQL must terminate the session that owns the mentor lock.");

      const deadline = Date.now() + 5_000;
      let backendStillExists = true;
      while (backendStillExists && Date.now() < deadline) {
        const { rows: activityRows } = await terminationClient.query<{ exists: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = $1) AS exists",
          [terminatedBackendPid],
        );
        backendStillExists = activityRows[0]?.exists === true;
        if (backendStillExists) await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(backendStillExists, false, "The lock-owning PostgreSQL backend must exit before the sync resumes.");
    } finally {
      terminationClient?.release();
      releaseTerminatedSync();
      await terminatedSyncOutcome;
    }

    const syncOutcome = await terminatedSyncOutcome;
    assert.deepEqual(
      syncOutcome,
      { value: true },
      "The completed sync should resolve after its terminated database session is discarded.",
    );

    const afterExitClient = await pool.connect();
    assert.equal(
      await withGoogleCalendarSyncLease(mentorStaffId, async () => {}, async () => afterExitClient),
      true,
      "A new PostgreSQL session must acquire the mentor lock after the previous owner exits.",
    );
  } finally {
    releaseFirstSync();
    await firstSync.catch(() => {});
    await pool.end();
  }
});
