import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchCalendarPage,
  withGoogleCalendarSyncLease,
  type GoogleCalendarSyncClient,
} from "../src/lib/googleCalendarSync";

function mockClient(
  query: (statement: string, values: unknown[]) => Promise<{ rows: Array<{ locked?: boolean }> }>,
  onRelease: (error?: Error) => void = () => {},
): GoogleCalendarSyncClient {
  return {
    query: (statement: string, values: unknown[]) => query(statement, values),
    release: (error?: Error) => onRelease(error),
  } as unknown as PoolClient;
}

test("Google Calendar sync lease excludes another replica for the same mentor", async () => {
  const heldLocks = new Set<string>();
  const released: number[] = [];
  const keyFor = (values: unknown[]) => values.join(":");
  const connect = async () => mockClient(async (statement, values) => {
    const key = keyFor(values);
    if (statement.includes("pg_try_advisory_lock")) {
      if (heldLocks.has(key)) return { rows: [{ locked: false }] };
      heldLocks.add(key);
      return { rows: [{ locked: true }] };
    }
    assert.ok(statement.includes("pg_advisory_unlock"));
    heldLocks.delete(key);
    return { rows: [{ locked: true }] };
  }, () => released.push(1));

  let finishFirstSync!: () => void;
  let firstSyncStarted!: () => void;
  const started = new Promise<void>(resolve => { firstSyncStarted = resolve; });
  const holdFirstSync = new Promise<void>(resolve => { finishFirstSync = resolve; });
  let secondSyncRan = false;

  const firstReplica = withGoogleCalendarSyncLease(24, async () => {
    firstSyncStarted();
    await holdFirstSync;
  }, connect);
  await started;

  const secondReplica = await withGoogleCalendarSyncLease(24, async () => {
    secondSyncRan = true;
  }, connect);
  assert.equal(secondReplica, false);
  assert.equal(secondSyncRan, false);

  finishFirstSync();
  assert.equal(await firstReplica, true);
  assert.equal(heldLocks.size, 0);
  assert.equal(released.length, 2);

  assert.equal(await withGoogleCalendarSyncLease(24, async () => {}, connect), true);
  assert.equal(heldLocks.size, 0, "The lock is released after each sync.");
});

test("Google Calendar sync lease releases its lock when the sync fails", async () => {
  let lockHeld = false;
  const client = mockClient(async (statement) => {
    if (statement.includes("pg_try_advisory_lock")) {
      lockHeld = true;
      return { rows: [{ locked: true }] };
    }
    lockHeld = false;
    return { rows: [{ locked: true }] };
  });

  await assert.rejects(
    withGoogleCalendarSyncLease(31, async () => {
      throw new Error("synthetic sync failure");
    }, async () => client),
    /synthetic sync failure/,
  );
  assert.equal(lockHeld, false);
});

test("Google Calendar request timeout releases the lease so the next sync can retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ((milliseconds: number) => {
    assert.equal(milliseconds, 30_000, "Calendar page timeout should be bounded");
    const controller = new AbortController();
    controller.abort(new DOMException("private provider response data", "TimeoutError"));
    return controller.signal;
  }) as typeof AbortSignal.timeout;
  let lockHeld = false;
  const connect = async () => mockClient(async statement => {
    if (statement.includes("pg_try_advisory_lock")) {
      if (lockHeld) return { rows: [{ locked: false }] };
      lockHeld = true;
      return { rows: [{ locked: true }] };
    }
    assert.ok(statement.includes("pg_advisory_unlock"));
    lockHeld = false;
    return { rows: [{ locked: true }] };
  });
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.signal?.aborted, true, "the mock request should observe the expired deadline");
    throw init?.signal?.reason;
  }) as typeof fetch;

  try {
    await assert.rejects(
      withGoogleCalendarSyncLease(
        53,
        async () => {
          await fetchCalendarPage("test-access-token", null);
        },
        connect,
      ),
      error => {
        assert.match((error as Error).message, /Google Calendar events could not be retrieved/);
        assert.equal((error as Error).message.includes("private provider response data"), false);
        return true;
      },
    );
    assert.equal(lockHeld, false, "a failed provider request must release the advisory lock");
    assert.equal(await withGoogleCalendarSyncLease(53, async () => {}, connect), true);
    assert.equal(lockHeld, false, "the next sync can acquire and release the lock");
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});

test("Google Calendar sync lease destroys the session if lock release fails", async () => {
  let releasedWithError: Error | undefined;
  let calls = 0;
  const client = mockClient(async (statement) => {
    calls += 1;
    if (statement.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
    throw new Error("synthetic unlock failure");
  }, error => { releasedWithError = error; });

  assert.equal(await withGoogleCalendarSyncLease(42, async () => {}, async () => client), true);
  assert.equal(calls, 2);
  assert.match(releasedWithError?.message ?? "", /synthetic unlock failure/);
});
