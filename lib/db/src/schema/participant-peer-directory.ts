import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";

export const participantPeerDirectoryPreferencesTable = pgTable(
  "jusoor_participant_peer_directory_preferences",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    isListed: boolean("is_listed").notNull().default(false),
    shareEmail: boolean("share_email").notNull().default(false),
    sharePhone: boolean("share_phone").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_participant_peer_directory_application_unique").on(table.applicationId),
    check(
      "jusoor_participant_peer_directory_contact_opt_in_check",
      sql`${table.isListed} OR (NOT ${table.shareEmail} AND NOT ${table.sharePhone})`,
    ),
  ],
);

export const insertParticipantPeerDirectoryPreferencesSchema = createInsertSchema(participantPeerDirectoryPreferencesTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertParticipantPeerDirectoryPreferences = z.infer<typeof insertParticipantPeerDirectoryPreferencesSchema>;
export type ParticipantPeerDirectoryPreferences = typeof participantPeerDirectoryPreferencesTable.$inferSelect;
