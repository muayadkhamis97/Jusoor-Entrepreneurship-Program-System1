import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db, rateLimitCountersTable } from "@workspace/db";
import { logger } from "./logger";

const cleanupIntervalMs = 15 * 60_000;
const expiredRowRetentionMs = 24 * 60 * 60_000;
let nextCleanupAt = 0;

export type DatabaseRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function rateLimitKeyHash(key: string, maximum: number, periodMs: number): string {
  return createHash("sha256")
    .update(`${maximum}:${periodMs}\0${key}`)
    .digest("hex");
}

async function pruneExpiredCounters(): Promise<void> {
  const nowMs = Date.now();
  if (nowMs < nextCleanupAt) return;
  nextCleanupAt = nowMs + cleanupIntervalMs;
  try {
    await db.delete(rateLimitCountersTable)
      .where(lt(rateLimitCountersTable.updatedAt, new Date(nowMs - expiredRowRetentionMs)));
  } catch (error) {
    // Cleanup is best-effort; rate enforcement itself remains database-backed.
    logger.warn({ err: error }, "Expired API rate-limit counters could not be pruned");
  }
}

/**
 * Atomically consume a fixed window shared by every API replica. The key is
 * hashed before storage so IP addresses, tokens, and API-key IDs are not kept
 * in clear text in the counter table.
 */
export async function consumeDatabaseRateLimit(
  key: string,
  maximum: number,
  periodMs: number,
): Promise<DatabaseRateLimitResult> {
  if (!key || !Number.isSafeInteger(maximum) || maximum < 1 ||
      !Number.isSafeInteger(periodMs) || periodMs < 1 ||
      maximum > 2_147_483_646) {
    throw new Error("Invalid database rate-limit parameters.");
  }

  await pruneExpiredCounters();

  const keyHash = rateLimitKeyHash(key, maximum, periodMs);
  const databaseNow = sql`statement_timestamp()`;
  const expiredWindow = sql`${rateLimitCountersTable.windowStartedAt} <= statement_timestamp() - (${periodMs} * interval '1 millisecond')`;
  const [counter] = await db.insert(rateLimitCountersTable).values({
    keyHash,
    windowStartedAt: databaseNow,
    hitCount: 1,
    updatedAt: databaseNow,
  }).onConflictDoUpdate({
    target: rateLimitCountersTable.keyHash,
    set: {
      windowStartedAt: sql`CASE WHEN ${expiredWindow} THEN statement_timestamp() ELSE ${rateLimitCountersTable.windowStartedAt} END`,
      hitCount: sql`CASE WHEN ${expiredWindow} THEN 1 ELSE LEAST(${rateLimitCountersTable.hitCount} + 1, ${maximum + 1}) END`,
      updatedAt: databaseNow,
    },
  }).returning({
    windowStartedAt: rateLimitCountersTable.windowStartedAt,
    hitCount: rateLimitCountersTable.hitCount,
  });

  if (!counter) throw new Error("Database rate-limit counter could not be updated.");
  const windowEndsAt = counter.windowStartedAt.getTime() + periodMs;
  return {
    allowed: counter.hitCount <= maximum,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - Date.now()) / 1000)),
  };
}
