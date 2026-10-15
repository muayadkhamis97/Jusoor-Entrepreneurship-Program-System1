import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";

export const googleCalendarMeetingsTable = pgTable("jusoor_google_calendar_meetings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  mentorStaffId: integer("mentor_staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "cascade" }),
  googleEventId: text("google_event_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone"),
  status: text("status").notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("jusoor_google_calendar_meetings_mentor_event_unique").on(table.mentorStaffId, table.googleEventId),
  index("jusoor_google_calendar_meetings_business_mentor_idx").on(table.businessId, table.mentorStaffId),
]);

export const insertGoogleCalendarMeetingSchema = createInsertSchema(googleCalendarMeetingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoogleCalendarMeeting = z.infer<typeof insertGoogleCalendarMeetingSchema>;
export type GoogleCalendarMeeting = typeof googleCalendarMeetingsTable.$inferSelect;
