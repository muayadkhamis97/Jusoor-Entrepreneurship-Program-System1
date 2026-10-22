import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { programAnnouncementsTable } from "./announcements";
import { applicationsTable } from "./applications";
import { staffMembersTable } from "./staff";

export const announcementRepliesTable = pgTable("jusoor_announcement_replies", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull().references(() => programAnnouncementsTable.id, { onDelete: "cascade" }),
  applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
  sender: text("sender", { enum: ["participant", "staff"] }).notNull(),
  staffId: integer("staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, table => [
  check("jusoor_announcement_replies_sender_check", sql`${table.sender} in ('participant', 'staff')`),
  check("jusoor_announcement_replies_body_check", sql`length(btrim(${table.body})) between 1 and 5000`),
  index("jusoor_announcement_replies_thread_idx").on(table.announcementId, table.applicationId, table.id),
]);

export const insertAnnouncementReplySchema = createInsertSchema(announcementRepliesTable).omit({ id: true, createdAt: true });
export type AnnouncementReply = typeof announcementRepliesTable.$inferSelect;
