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
  emailNotificationStatus: text("email_notification_status", {
    enum: ["not_sent", "sent", "failed", "uncertain"],
  }).notNull().default("not_sent"),
  emailNotificationFailureKind: text("email_notification_failure_kind", {
    enum: ["quota", "needs_reconnect", "invalid_recipient", "transient", "ambiguous"],
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, table => [
  check("jusoor_announcement_replies_sender_check", sql`${table.sender} in ('participant', 'staff')`),
  check("jusoor_announcement_replies_body_check", sql`length(btrim(${table.body})) between 1 and 5000`),
  check("jusoor_announcement_replies_email_status_check", sql`${table.emailNotificationStatus} in ('not_sent', 'sent', 'failed', 'uncertain')`),
  check("jusoor_announcement_replies_email_failure_check", sql`${table.emailNotificationFailureKind} is null or ${table.emailNotificationFailureKind} in ('quota', 'needs_reconnect', 'invalid_recipient', 'transient', 'ambiguous')`),
  index("jusoor_announcement_replies_thread_idx").on(table.announcementId, table.applicationId, table.id),
]);

export const insertAnnouncementReplySchema = createInsertSchema(announcementRepliesTable).omit({ id: true, createdAt: true });
export type AnnouncementReply = typeof announcementRepliesTable.$inferSelect;
