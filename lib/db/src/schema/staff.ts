import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const staffMembersTable = pgTable("jusoor_staff_members", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  clerkUserId: text("clerk_user_id").unique(),
  role: text("role").notNull().default("staff"),
  status: text("status").notNull().default("invited"),
  calendlyBookingUrl: text("calendly_booking_url"),
  calendlyWebhookTokenHash: text("calendly_webhook_token_hash").unique(),
  calendlyWebhookTokenEncrypted: text("calendly_webhook_token_encrypted"),
  calendlyWebhookSecretEncrypted: text("calendly_webhook_secret_encrypted"),
  calendlyWebhookSubscriptionUri: text("calendly_webhook_subscription_uri"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffMemberSchema = createInsertSchema(staffMembersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStaffMember = z.infer<typeof insertStaffMemberSchema>;
export type StaffMember = typeof staffMembersTable.$inferSelect;
