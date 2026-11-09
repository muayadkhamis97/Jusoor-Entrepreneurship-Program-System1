import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";

const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
const { db, pool, rateLimitCountersTable } = await import("@workspace/db");
const { consumeDatabaseRateLimit, rateLimitKeyHash } = await import("../src/lib/databaseRateLimit");

after(async () => {
  await pool.end();
});

test("database rate limits remain global under concurrent requests and reset after the window", {
  skip: !databaseAvailable && "Set TEST_DATABASE_URL to a disposable PostgreSQL database.",
  timeout: 30_000,
}, async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jusoor_rate_limit_counters (
      key_hash text PRIMARY KEY,
      window_started_at timestamptz NOT NULL,
      hit_count integer NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS jusoor_rate_limit_counters_updated_idx
      ON jusoor_rate_limit_counters(updated_at);
  `);

  const key = `database-rate-limit-test:${randomUUID()}`;
  const maximum = 4;
  const periodMs = 60_000;
  const keyHash = rateLimitKeyHash(key, maximum, periodMs);

  try {
    const concurrentRequests = await Promise.all(
      Array.from({ length: 20 }, () => consumeDatabaseRateLimit(key, maximum, periodMs)),
    );
    assert.equal(concurrentRequests.filter(result => result.allowed).length, maximum);
    assert.equal(concurrentRequests.filter(result => !result.allowed).length, 16);
    assert.ok(concurrentRequests.filter(result => !result.allowed).every(result => result.retryAfterSeconds > 0));

    const [stored] = await db.select().from(rateLimitCountersTable)
      .where(eq(rateLimitCountersTable.keyHash, keyHash)).limit(1);
    assert.ok(stored);
    assert.equal(stored.hitCount, maximum + 1, "Over-limit hits are capped to avoid counter overflow.");
    assert.notEqual(stored.keyHash, key, "Raw limiter keys must not be persisted.");

    await pool.query(
      "UPDATE jusoor_rate_limit_counters SET window_started_at = statement_timestamp() - interval '61 seconds' WHERE key_hash = $1",
      [keyHash],
    );
    const afterWindow = await consumeDatabaseRateLimit(key, maximum, periodMs);
    assert.equal(afterWindow.allowed, true);
  } finally {
    await db.delete(rateLimitCountersTable).where(eq(rateLimitCountersTable.keyHash, keyHash));
  }
});
