import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export const integrationApiKeysTable = pgTable(
  "jusoor_integration_api_keys",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
    createdByStaffId: integer("created_by_staff_id").notNull()
      .references(() => staffMembersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("jusoor_integration_api_keys_hash_unique").on(table.keyHash),
    index("jusoor_integration_api_keys_program_idx").on(table.programId, table.createdAt),
    index("jusoor_integration_api_keys_revoked_idx").on(table.revokedAt),
  ],
);
