import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { staffMembersTable } from "./staff";

export const calendlyMeetingsTable = pgTable("jusoor_calendly_meetings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  mentorStaffId: integer("mentor_staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "cascade" }),
  inviteeUri: text("invitee_uri").notNull(),
  scheduledEventUri: text("scheduled_event_uri").notNull(),
  eventName: text("event_name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone"),
  status: text("status").notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("jusoor_calendly_meetings_invitee_uri_unique").on(table.inviteeUri),
  index("jusoor_calendly_meetings_business_mentor_idx").on(table.businessId, table.mentorStaffId),
]);

export const insertCalendlyMeetingSchema = createInsertSchema(calendlyMeetingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCalendlyMeeting = z.infer<typeof insertCalendlyMeetingSchema>;
export type CalendlyMeeting = typeof calendlyMeetingsTable.$inferSelect;
