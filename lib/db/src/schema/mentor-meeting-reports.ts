import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { calendlyMeetingsTable } from "./calendly-meetings";
import { googleCalendarMeetingsTable } from "./google-calendar-meetings";
import { staffMembersTable } from "./staff";
import { supportTable } from "./support";

export const mentorMeetingReportsTable = pgTable("jusoor_mentor_meeting_reports", {
  id: serial("id").primaryKey(),
  supportId: integer("support_id").notNull().references(() => supportTable.id, { onDelete: "restrict" }),
  calendlyMeetingId: integer("calendly_meeting_id").references(() => calendlyMeetingsTable.id, { onDelete: "set null" }),
  googleCalendarMeetingId: integer("google_calendar_meeting_id").references(() => googleCalendarMeetingsTable.id, { onDelete: "set null" }),
  coachStaffId: integer("coach_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  coachName: text("coach_name").notNull(),
  coachEmail: text("coach_email").notNull(),
  businessName: text("business_name").notNull(),
  meetingDate: text("meeting_date").notNull(),
  attendees: text("attendees").array().notNull(),
  sessionSummary: text("session_summary").notNull(),
  smartGrowActions: text("smart_grow_actions").notNull(),
  achievementsAndOpportunities: text("achievements_and_opportunities").notNull(),
  teamRecommendations: text("team_recommendations"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("jusoor_mentor_meeting_reports_one_occurrence_check", sql`num_nonnulls(${table.calendlyMeetingId}, ${table.googleCalendarMeetingId}) <= 1`),
  index("jusoor_mentor_meeting_reports_support_date_idx").on(table.supportId, table.meetingDate, table.id),
  index("jusoor_mentor_meeting_reports_coach_idx").on(table.coachStaffId, table.submittedAt),
  uniqueIndex("jusoor_mentor_meeting_reports_calendly_meeting_unique")
    .on(table.calendlyMeetingId)
    .where(sql`${table.calendlyMeetingId} IS NOT NULL`),
  uniqueIndex("jusoor_mentor_meeting_reports_google_meeting_unique")
    .on(table.googleCalendarMeetingId)
    .where(sql`${table.googleCalendarMeetingId} IS NOT NULL`),
]);

export type MentorMeetingReport = typeof mentorMeetingReportsTable.$inferSelect;
