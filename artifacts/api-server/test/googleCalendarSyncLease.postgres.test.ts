import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { pool } from "@workspace/db";
import {
  encryptGoogleCalendarToken,
  processGoogleCalendarSyncMentorQueue,
  syncGoogleCalendarMentor,
  withGoogleCalendarSyncLease,
} from "../src/lib/googleCalendarSync";

test("PostgreSQL advisory sync locks recover after callback and lock-acquisition failures", {
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

    const syncFailure = new Error("Calendar callback failed.");
    let failedSyncRan = false;
    const failedSyncClient = await pool.connect();
    await assert.rejects(
      withGoogleCalendarSyncLease(mentorStaffId, async () => {
        failedSyncRan = true;
        throw syncFailure;
      }, async () => failedSyncClient),
      error => error === syncFailure,
      "The original calendar sync error must remain visible to the caller.",
    );
    assert.equal(failedSyncRan, true, "The failing callback must run after acquiring the mentor lock.");

    const afterFailureClient = await pool.connect();
    assert.equal(
      await withGoogleCalendarSyncLease(mentorStaffId, async () => {}, async () => afterFailureClient),
      true,
      "A fresh PostgreSQL session must acquire the mentor lock after a callback failure.",
    );

    const acquisitionClient = await pool.connect();
    const acquisitionError = new Error("Database connection failed during mentor lock acquisition.");
    let acquisitionQueryFailed = false;
    let acquisitionReleasedWith: unknown;
    const failingAcquisitionClient = new Proxy(acquisitionClient, {
      get(target, property) {
        if (property === "query") {
          return (...args: unknown[]) => {
            if (
              !acquisitionQueryFailed &&
              args[0] === "SELECT pg_try_advisory_lock($1, $2) AS locked"
            ) {
              acquisitionQueryFailed = true;
              throw acquisitionError;
            }
            return Reflect.apply(target.query, target, args);
          };
        }
        if (property === "release") {
          return (error?: Error | boolean) => {
            acquisitionReleasedWith = error;
            return Reflect.apply(target.release, target, [error]);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as typeof acquisitionClient;
    let acquisitionSyncRan = false;
    await assert.rejects(
      withGoogleCalendarSyncLease(mentorStaffId, async () => {
        acquisitionSyncRan = true;
      }, async () => failingAcquisitionClient),
      error => error === acquisitionError,
      "The lock-acquisition error must be reported to the caller.",
    );
    assert.equal(acquisitionQueryFailed, true, "The injected failure must occur on the advisory lock query.");
    assert.equal(acquisitionSyncRan, false, "The sync callback must not run when lock acquisition fails.");
    assert.equal(
      acquisitionReleasedWith,
      acquisitionError,
      "A connection that fails during lock acquisition must be discarded from the pool.",
    );

    let retrySyncRan = false;
    const afterAcquisitionFailureClient = await pool.connect();
    assert.equal(
      await withGoogleCalendarSyncLease(mentorStaffId, async () => {
        retrySyncRan = true;
      }, async () => afterAcquisitionFailureClient),
      true,
      "A subsequent PostgreSQL session must acquire the mentor lock after an acquisition failure.",
    );
    assert.equal(retrySyncRan, true, "The sync callback must run after the retry acquires the mentor lock.");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jusoor_staff_members (
        id serial PRIMARY KEY,
        email text NOT NULL UNIQUE,
        role text NOT NULL DEFAULT 'staff',
        status text NOT NULL DEFAULT 'invited',
        google_calendar_account_email text,
        google_calendar_refresh_token_encrypted text,
        google_calendar_access_token_encrypted text,
        google_calendar_access_token_expires_at timestamptz,
        google_calendar_sync_token text,
        google_calendar_sync_last_success_at timestamptz,
        google_calendar_sync_last_failure_at timestamptz,
        google_calendar_sync_consecutive_failures integer NOT NULL DEFAULT 0,
        google_calendar_sync_needs_reauthorization boolean NOT NULL DEFAULT false
      );
      ALTER TABLE jusoor_staff_members
        ADD COLUMN IF NOT EXISTS google_calendar_account_email text,
        ADD COLUMN IF NOT EXISTS google_calendar_refresh_token_encrypted text,
        ADD COLUMN IF NOT EXISTS google_calendar_access_token_encrypted text,
        ADD COLUMN IF NOT EXISTS google_calendar_access_token_expires_at timestamptz,
        ADD COLUMN IF NOT EXISTS google_calendar_sync_token text,
        ADD COLUMN IF NOT EXISTS google_calendar_sync_last_success_at timestamptz,
        ADD COLUMN IF NOT EXISTS google_calendar_sync_last_failure_at timestamptz,
        ADD COLUMN IF NOT EXISTS google_calendar_sync_consecutive_failures integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS google_calendar_sync_needs_reauthorization boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS jusoor_businesses (
        id integer PRIMARY KEY,
        email text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jusoor_support (
        business_id integer NOT NULL,
        mentor_staff_id integer,
        type text NOT NULL
      );
    `);

    const mentorEmail = `calendar-sync-health-${randomUUID()}@example.test`;
    const refreshTokenEncrypted = encryptGoogleCalendarToken("calendar-sync-health-refresh-token");
    const { rows: [healthMentor] } = await pool.query<{ id: number }>(
      `INSERT INTO jusoor_staff_members (
        email, role, status, google_calendar_account_email,
        google_calendar_refresh_token_encrypted, google_calendar_sync_consecutive_failures
      ) VALUES ($1, 'mentor', 'active', $2, $3, 0)
      RETURNING id`,
      [mentorEmail, mentorEmail, refreshTokenEncrypted],
    );
    assert.ok(healthMentor);

    const healthSyncFailureClient = await pool.connect();
    const syncAcquisitionError = new Error("Database outage while acquiring the mentor lock.");
    let acquisitionFailureInjected = false;
    const failingSyncClient = new Proxy(healthSyncFailureClient, {
      get(target, property) {
        if (property === "query") {
          return (...args: unknown[]) => {
            if (
              !acquisitionFailureInjected &&
              args[0] === "SELECT pg_try_advisory_lock($1, $2) AS locked"
            ) {
              acquisitionFailureInjected = true;
              throw syncAcquisitionError;
            }
            return Reflect.apply(target.query, target, args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as typeof healthSyncFailureClient;

    await assert.rejects(
      syncGoogleCalendarMentor(healthMentor.id, async () => failingSyncClient),
      error => error === syncAcquisitionError,
      "A failed lock acquisition must be returned by the sync entry point.",
    );

    assert.equal(acquisitionFailureInjected, true, "The sync must reach the injected lock-acquisition outage.");
    const { rows: [failedStatus] } = await pool.query<{
      google_calendar_sync_last_failure_at: Date | null;
      google_calendar_sync_consecutive_failures: number;
    }>(
      `SELECT google_calendar_sync_last_failure_at, google_calendar_sync_consecutive_failures
       FROM jusoor_staff_members WHERE id = $1`,
      [healthMentor.id],
    );
    assert.ok(failedStatus?.google_calendar_sync_last_failure_at, "The acquisition outage must be persisted as a sync failure.");
    assert.equal(failedStatus.google_calendar_sync_consecutive_failures, 1);

    const replacementAccountEmail = `calendar-sync-replacement-${randomUUID()}@example.test`;
    const replacementRefreshToken = encryptGoogleCalendarToken("calendar-sync-replacement-refresh-token");
    const existingSyncHealth = {
      lastSuccessAt: new Date("2025-01-02T03:04:05.000Z"),
      lastFailureAt: new Date("2025-02-03T04:05:06.000Z"),
      consecutiveFailures: 7,
      needsReauthorization: true,
    };
    await pool.query(
      `UPDATE jusoor_staff_members
       SET google_calendar_sync_last_success_at = $2,
           google_calendar_sync_last_failure_at = $3,
           google_calendar_sync_consecutive_failures = $4,
           google_calendar_sync_needs_reauthorization = $5
       WHERE id = $1`,
      [
        healthMentor.id,
        existingSyncHealth.lastSuccessAt,
        existingSyncHealth.lastFailureAt,
        existingSyncHealth.consecutiveFailures,
        existingSyncHealth.needsReauthorization,
      ],
    );

    const lockOwnerClient = await pool.connect();
    const competingSyncClient = await pool.connect();
    let lockOwnerStarted!: () => void;
    let releaseLockOwner!: () => void;
    const lockOwnerReady = new Promise<void>(resolve => { lockOwnerStarted = resolve; });
    const lockOwnerGate = new Promise<void>(resolve => { releaseLockOwner = resolve; });
    let competingSyncOwnsClient = false;
    const lockOwnerSync = withGoogleCalendarSyncLease(
      healthMentor.id,
      async () => {
        lockOwnerStarted();
        await lockOwnerGate;
      },
      async () => lockOwnerClient,
    );
    try {
      await lockOwnerReady;
      const [{ rows: [ownerBackend] }, { rows: [competingBackend] }] = await Promise.all([
        lockOwnerClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"),
        competingSyncClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"),
      ]);
      assert.notEqual(
        ownerBackend?.pid,
        competingBackend?.pid,
        "The lock owner and competing sync must use distinct PostgreSQL sessions.",
      );

      competingSyncOwnsClient = true;
      await syncGoogleCalendarMentor(healthMentor.id, async () => competingSyncClient);

      const { rows: [busyLockStatus] } = await pool.query<{
        google_calendar_sync_last_failure_at: Date | null;
        google_calendar_sync_consecutive_failures: number;
      }>(
        `SELECT google_calendar_sync_last_failure_at, google_calendar_sync_consecutive_failures
         FROM jusoor_staff_members WHERE id = $1`,
        [healthMentor.id],
      );
      assert.equal(
        busyLockStatus?.google_calendar_sync_last_failure_at?.toISOString(),
        existingSyncHealth.lastFailureAt.toISOString(),
        "A skipped sync must preserve the saved failure timestamp.",
      );
      assert.equal(
        busyLockStatus?.google_calendar_sync_consecutive_failures,
        existingSyncHealth.consecutiveFailures,
        "A skipped sync must preserve the saved consecutive-failure count.",
      );
    } finally {
      releaseLockOwner();
      if (!competingSyncOwnsClient) competingSyncClient.release();
      await lockOwnerSync;
    }

    const replacementSyncClient = await pool.connect();
    const replacementAcquisitionError = new Error("Database outage during replacement account reconnect.");
    let replacementWasInjected = false;
    const failingReplacementSyncClient = new Proxy(replacementSyncClient, {
      get(target, property) {
        if (property === "query") {
          return (...args: unknown[]) => {
            if (
              !replacementWasInjected &&
              args[0] === "SELECT pg_try_advisory_lock($1, $2) AS locked"
            ) {
              replacementWasInjected = true;
              return (async () => {
                await pool.query(
                  `UPDATE jusoor_staff_members
                   SET google_calendar_account_email = $2,
                       google_calendar_refresh_token_encrypted = $3
                   WHERE id = $1`,
                  [healthMentor.id, replacementAccountEmail, replacementRefreshToken],
                );
                throw replacementAcquisitionError;
              })();
            }
            return Reflect.apply(target.query, target, args);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as typeof replacementSyncClient;

    await assert.rejects(
      syncGoogleCalendarMentor(healthMentor.id, async () => failingReplacementSyncClient),
      error => error === replacementAcquisitionError,
      "The failed attempt must remain visible to the caller after the account is replaced.",
    );
    assert.equal(replacementWasInjected, true, "The account replacement must happen during lock acquisition.");
    const { rows: [replacementStatus] } = await pool.query<{
      google_calendar_account_email: string | null;
      google_calendar_refresh_token_encrypted: string | null;
      google_calendar_sync_last_success_at: Date | null;
      google_calendar_sync_last_failure_at: Date | null;
      google_calendar_sync_consecutive_failures: number;
      google_calendar_sync_needs_reauthorization: boolean;
    }>(
      `SELECT google_calendar_account_email, google_calendar_refresh_token_encrypted,
              google_calendar_sync_last_success_at, google_calendar_sync_last_failure_at,
              google_calendar_sync_consecutive_failures, google_calendar_sync_needs_reauthorization
       FROM jusoor_staff_members WHERE id = $1`,
      [healthMentor.id],
    );
    assert.equal(replacementStatus?.google_calendar_account_email, replacementAccountEmail);
    assert.equal(replacementStatus?.google_calendar_refresh_token_encrypted, replacementRefreshToken);
    assert.equal(replacementStatus?.google_calendar_sync_last_success_at?.toISOString(), existingSyncHealth.lastSuccessAt.toISOString());
    assert.equal(replacementStatus?.google_calendar_sync_last_failure_at?.toISOString(), existingSyncHealth.lastFailureAt.toISOString());
    assert.equal(replacementStatus?.google_calendar_sync_consecutive_failures, existingSyncHealth.consecutiveFailures);
    assert.equal(replacementStatus?.google_calendar_sync_needs_reauthorization, existingSyncHealth.needsReauthorization);

    const originalFetch = globalThis.fetch;
    const originalEnv = {
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    };
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "calendar-sync-health-test-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "calendar-sync-health-test-secret";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "calendar-sync-health-access-token", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ items: [], nextSyncToken: "calendar-sync-health-next-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const staleFailureEmail = `calendar-sync-stale-failure-${randomUUID()}@example.test`;
      const staleFailureReplacementEmail = `calendar-sync-stale-failure-replacement-${randomUUID()}@example.test`;
      const staleFailureRefreshToken = encryptGoogleCalendarToken("calendar-sync-stale-failure-refresh-token");
      const staleFailureReplacementRefreshToken = encryptGoogleCalendarToken("calendar-sync-stale-failure-replacement-refresh-token");
      const { rows: [staleFailureMentor] } = await pool.query<{ id: number }>(
        `INSERT INTO jusoor_staff_members (
           email, role, status, google_calendar_account_email, google_calendar_refresh_token_encrypted
         )
         VALUES ($1, 'mentor', 'active', $1, $2)
         RETURNING id`,
        [staleFailureEmail, staleFailureRefreshToken],
      );
      assert.ok(staleFailureMentor);

      let calendarRequestStarted!: () => void;
      let releaseCalendarFailure!: () => void;
      const calendarRequestStartedPromise = new Promise<void>(resolve => { calendarRequestStarted = resolve; });
      const calendarFailureGate = new Promise<void>(resolve => { releaseCalendarFailure = resolve; });
      const healthyCalendarFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        if (String(input) === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "calendar-sync-stale-failure-access-token", expires_in: 3600 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        calendarRequestStarted();
        await calendarFailureGate;
        return new Response(JSON.stringify({ error: { message: "Invalid credentials" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const staleFailureSync = syncGoogleCalendarMentor(staleFailureMentor.id);
      try {
        try {
          await calendarRequestStartedPromise;
          await pool.query(
            `UPDATE jusoor_staff_members
             SET google_calendar_account_email = NULL,
                 google_calendar_refresh_token_encrypted = NULL,
                 google_calendar_access_token_encrypted = NULL,
                 google_calendar_access_token_expires_at = NULL,
                 google_calendar_sync_token = NULL,
                 google_calendar_sync_last_success_at = NULL,
                 google_calendar_sync_last_failure_at = NULL,
                 google_calendar_sync_consecutive_failures = 0,
                 google_calendar_sync_needs_reauthorization = false
             WHERE id = $1`,
            [staleFailureMentor.id],
          );
          await pool.query(
            `UPDATE jusoor_staff_members
             SET google_calendar_account_email = $2,
                 google_calendar_refresh_token_encrypted = $3
             WHERE id = $1`,
            [staleFailureMentor.id, staleFailureReplacementEmail, staleFailureReplacementRefreshToken],
          );
        } finally {
          releaseCalendarFailure();
        }
        await assert.rejects(
          staleFailureSync,
          error => error instanceof Error && error.message === "Google Calendar events could not be retrieved.",
          "The stale provider error must remain visible to the caller.",
        );
        const { rows: [staleFailureStatus] } = await pool.query<{
          google_calendar_account_email: string | null;
          google_calendar_refresh_token_encrypted: string | null;
          google_calendar_access_token_encrypted: string | null;
          google_calendar_sync_token: string | null;
          google_calendar_sync_last_success_at: Date | null;
          google_calendar_sync_last_failure_at: Date | null;
          google_calendar_sync_consecutive_failures: number;
          google_calendar_sync_needs_reauthorization: boolean;
        }>(
          `SELECT google_calendar_account_email, google_calendar_refresh_token_encrypted,
                  google_calendar_access_token_encrypted, google_calendar_sync_token,
                  google_calendar_sync_last_success_at, google_calendar_sync_last_failure_at,
                  google_calendar_sync_consecutive_failures, google_calendar_sync_needs_reauthorization
           FROM jusoor_staff_members WHERE id = $1`,
          [staleFailureMentor.id],
        );
        assert.equal(staleFailureStatus?.google_calendar_account_email, staleFailureReplacementEmail);
        assert.equal(staleFailureStatus?.google_calendar_refresh_token_encrypted, staleFailureReplacementRefreshToken);
        assert.equal(staleFailureStatus?.google_calendar_access_token_encrypted, null);
        assert.equal(staleFailureStatus?.google_calendar_sync_token, null);
        assert.equal(staleFailureStatus?.google_calendar_sync_last_success_at, null);
        assert.equal(staleFailureStatus?.google_calendar_sync_last_failure_at, null);
        assert.equal(staleFailureStatus?.google_calendar_sync_consecutive_failures, 0);
        assert.equal(staleFailureStatus?.google_calendar_sync_needs_reauthorization, false);
      } finally {
        releaseCalendarFailure();
        await staleFailureSync.catch(() => {});
        globalThis.fetch = healthyCalendarFetch;
        await pool.query("DELETE FROM jusoor_staff_members WHERE id = $1", [staleFailureMentor.id]);
      }

      await syncGoogleCalendarMentor(healthMentor.id);
      const { rows: [recoveredStatus] } = await pool.query<{
        google_calendar_sync_last_success_at: Date | null;
        google_calendar_sync_last_failure_at: Date | null;
        google_calendar_sync_consecutive_failures: number;
      }>(
        `SELECT google_calendar_sync_last_success_at, google_calendar_sync_last_failure_at,
                google_calendar_sync_consecutive_failures
         FROM jusoor_staff_members WHERE id = $1`,
        [healthMentor.id],
      );
      assert.ok(recoveredStatus?.google_calendar_sync_last_success_at, "The successful retry must be recorded.");
      assert.equal(recoveredStatus.google_calendar_sync_last_failure_at, null);
      assert.equal(recoveredStatus.google_calendar_sync_consecutive_failures, 0);

      const failingWorkerEmail = `calendar-sync-worker-failure-${randomUUID()}@example.test`;
      const nextWorkerEmail = `calendar-sync-worker-next-${randomUUID()}@example.test`;
      const { rows: [failingWorkerMentor] } = await pool.query<{ id: number }>(
        `INSERT INTO jusoor_staff_members (
           email, role, status, google_calendar_account_email, google_calendar_refresh_token_encrypted
         )
         VALUES ($1, 'mentor', 'active', $1, $2)
         RETURNING id`,
        [failingWorkerEmail, refreshTokenEncrypted],
      );
      assert.ok(failingWorkerMentor);
      const { rows: [nextWorkerMentor] } = await pool.query<{ id: number }>(
        `INSERT INTO jusoor_staff_members (
           email, role, status, google_calendar_account_email, google_calendar_refresh_token_encrypted
         )
         VALUES ($1, 'mentor', 'active', $1, $2)
         RETURNING id`,
        [nextWorkerEmail, refreshTokenEncrypted],
      );
      assert.ok(nextWorkerMentor);

      const workerLockError = new Error("Database outage while acquiring the first mentor lock.");
      const workerLockClient = await pool.connect();
      const failingWorkerClient = new Proxy(workerLockClient, {
        get(target, property) {
          if (property === "query") {
            return (...args: unknown[]) => {
              if (args[0] === "SELECT pg_try_advisory_lock($1, $2) AS locked") {
                throw workerLockError;
              }
              return Reflect.apply(target.query, target, args);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof workerLockClient;
      const workerAttempts: number[] = [];
      const workerReports: Array<{ mentorStaffId: number; error: unknown }> = [];
      try {
        await processGoogleCalendarSyncMentorQueue(
          [{ id: failingWorkerMentor.id }, { id: nextWorkerMentor.id }],
          async mentorStaffId => {
            workerAttempts.push(mentorStaffId);
            await syncGoogleCalendarMentor(
              mentorStaffId,
              async () => mentorStaffId === failingWorkerMentor.id
                ? failingWorkerClient
                : pool.connect(),
            );
          },
          (mentorStaffId, error) => workerReports.push({ mentorStaffId, error }),
        );

        assert.deepEqual(
          workerAttempts,
          [failingWorkerMentor.id, nextWorkerMentor.id],
          "The worker must attempt the next connected mentor after a lock-acquisition failure.",
        );
        assert.deepEqual(
          workerReports,
          [{ mentorStaffId: failingWorkerMentor.id, error: workerLockError }],
          "The worker must report the mentor whose lock acquisition failed.",
        );
        const { rows: [workerFailureStatus] } = await pool.query<{
          google_calendar_sync_last_failure_at: Date | null;
          google_calendar_sync_consecutive_failures: number;
        }>(
          `SELECT google_calendar_sync_last_failure_at, google_calendar_sync_consecutive_failures
           FROM jusoor_staff_members WHERE id = $1`,
          [failingWorkerMentor.id],
        );
        assert.ok(workerFailureStatus?.google_calendar_sync_last_failure_at);
        assert.equal(workerFailureStatus.google_calendar_sync_consecutive_failures, 1);
        const { rows: [workerSuccessStatus] } = await pool.query<{
          google_calendar_sync_last_success_at: Date | null;
        }>(
          `SELECT google_calendar_sync_last_success_at
           FROM jusoor_staff_members WHERE id = $1`,
          [nextWorkerMentor.id],
        );
        assert.ok(workerSuccessStatus?.google_calendar_sync_last_success_at);
      } finally {
        await pool.query(
          "DELETE FROM jusoor_staff_members WHERE id = ANY($1::int[])",
          [[failingWorkerMentor.id, nextWorkerMentor.id]],
        );
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.clientId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
      else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalEnv.clientId;
      if (originalEnv.clientSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
      else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.clientSecret;
      await pool.query("DELETE FROM jusoor_staff_members WHERE id = $1", [healthMentor.id]);
    }

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
