import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { programAnnouncementsTable } from "./announcements";

// Absence of a request means no email, including all pre-existing announcements.
export const announcementEmailRequestsTable = pgTable("jusoor_announcement_email_requests", {
  announcementId: integer("announcement_id").primaryKey().references(() => programAnnouncementsTable.id, { onDelete: "cascade" }),
  preparedAt: timestamp("prepared_at", { withTimezone: true }),
  paused: boolean("paused").notNull().default(false),
  pauseReason: text("pause_reason"),
  resumeAt: timestamp("resume_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcementEmailDeliveriesTable = pgTable("jusoor_announcement_email_deliveries", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull().references(() => announcementEmailRequestsTable.announcementId, { onDelete: "cascade" }),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  failureKind: text("failure_kind"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, table => [
  uniqueIndex("jusoor_announcement_email_recipient_unique").on(table.announcementId, table.email),
  index("jusoor_announcement_email_pending_idx").on(table.status),
]);

export const insertAnnouncementEmailRequestSchema = createInsertSchema(announcementEmailRequestsTable);
export const insertAnnouncementEmailDeliverySchema = createInsertSchema(announcementEmailDeliveriesTable).omit({ id: true });
export type AnnouncementEmailDelivery = typeof announcementEmailDeliveriesTable.$inferSelect;
