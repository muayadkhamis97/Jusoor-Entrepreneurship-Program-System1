import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const rateLimitCountersTable = pgTable(
  "jusoor_rate_limit_counters",
  {
    keyHash: text("key_hash").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    hitCount: integer("hit_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("jusoor_rate_limit_counters_updated_idx").on(table.updatedAt),
  ],
);
