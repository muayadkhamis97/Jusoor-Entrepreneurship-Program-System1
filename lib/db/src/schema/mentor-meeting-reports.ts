import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { staffMembersTable } from "./staff";
import { supportTable } from "./support";

export const mentorMeetingReportsTable = pgTable("jusoor_mentor_meeting_reports", {
  id: serial("id").primaryKey(),
  supportId: integer("support_id").notNull().references(() => supportTable.id, { onDelete: "restrict" }),
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
  index("jusoor_mentor_meeting_reports_support_date_idx").on(table.supportId, table.meetingDate, table.id),
  index("jusoor_mentor_meeting_reports_coach_idx").on(table.coachStaffId, table.submittedAt),
]);

export type MentorMeetingReport = typeof mentorMeetingReportsTable.$inferSelect;
