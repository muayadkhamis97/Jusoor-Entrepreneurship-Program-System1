import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";
import { programsTable } from "./programs";
import { sessionsTable } from "./sessions";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";

export const programAnnouncementsTable = pgTable(
  "jusoor_program_announcements",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id").references(() => programsTable.id, { onDelete: "restrict" }),
    businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "restrict" }),
    sessionId: integer("session_id").references(() => sessionsTable.id, { onDelete: "cascade" }),
    recordingVersion: integer("recording_version"),
    kind: text("kind").notNull().default("update"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "jusoor_program_announcements_business_requires_program_check",
      sql`${table.businessId} IS NULL OR ${table.programId} IS NOT NULL`,
    ),
    index("jusoor_program_announcements_program_idx").on(table.programId, table.scheduledFor),
    index("jusoor_program_announcements_business_idx").on(table.businessId, table.scheduledFor),
    index("jusoor_program_announcements_scheduled_idx").on(table.scheduledFor),
    uniqueIndex("jusoor_program_announcements_session_recording_version_unique")
      .on(table.sessionId, table.recordingVersion),
  ],
);

export const announcementReceiptsTable = pgTable(
  "jusoor_announcement_receipts",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id").notNull().references(() => programAnnouncementsTable.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("jusoor_announcement_receipt_user_unique").on(table.announcementId, table.clerkUserId),
    index("jusoor_announcement_receipt_user_idx").on(table.clerkUserId),
  ],
);

export const insertProgramAnnouncementSchema = createInsertSchema(programAnnouncementsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertProgramAnnouncement = z.infer<typeof insertProgramAnnouncementSchema>;
export type ProgramAnnouncement = typeof programAnnouncementsTable.$inferSelect;
export type AnnouncementReceipt = typeof announcementReceiptsTable.$inferSelect;
