import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const staffMembersTable = pgTable("jusoor_staff_members", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  clerkUserId: text("clerk_user_id").unique(),
  role: text("role").notNull().default("staff"),
  status: text("status").notNull().default("invited"),
  bookingProvider: text("booking_provider").notNull().default("calendly"),
  calendlyBookingUrl: text("calendly_booking_url"),
  calendlyFollowUpDate: date("calendly_follow_up_date", { mode: "string" }),
  calendlyFollowUpNote: text("calendly_follow_up_note"),
  calendlyFollowUpUpdatedByStaffId: integer("calendly_follow_up_updated_by_staff_id")
    .references((): AnyPgColumn => staffMembersTable.id, { onDelete: "set null" }),
  calendlyFollowUpUpdatedAt: timestamp("calendly_follow_up_updated_at", { withTimezone: true }),
  googleCalendarAccountEmail: text("google_calendar_account_email"),
  googleCalendarBookingUrl: text("google_calendar_booking_url"),
  googleCalendarRefreshTokenEncrypted: text("google_calendar_refresh_token_encrypted"),
  googleCalendarAccessTokenEncrypted: text("google_calendar_access_token_encrypted"),
  googleCalendarAccessTokenExpiresAt: timestamp("google_calendar_access_token_expires_at", { withTimezone: true }),
  googleCalendarSyncToken: text("google_calendar_sync_token"),
  calendlyWebhookTokenHash: text("calendly_webhook_token_hash").unique(),
  calendlyWebhookTokenEncrypted: text("calendly_webhook_token_encrypted"),
  calendlyWebhookSecretEncrypted: text("calendly_webhook_secret_encrypted"),
  calendlyWebhookSubscriptionUri: text("calendly_webhook_subscription_uri"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffMemberSchema = createInsertSchema(staffMembersTable).omit({
  id: true,
  createdAt: true,
  calendlyFollowUpUpdatedByStaffId: true,
  calendlyFollowUpUpdatedAt: true,
});

export type InsertStaffMember = z.infer<typeof insertStaffMemberSchema>;
export type StaffMember = typeof staffMembersTable.$inferSelect;
