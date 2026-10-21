import { createInsertSchema } from "drizzle-zod";
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
import { staffMembersTable } from "./staff";
import { supportTable } from "./support";

export const mentorSessionRequestStatuses = ["open", "resolved"] as const;
export const mentorSessionRequestEmailStatuses = ["pending", "delivered", "failed"] as const;

export const mentorSessionRequestsTable = pgTable("mentor_session_requests", {
  id: serial("id").primaryKey(),
  supportId: integer("support_id").notNull().references(() => supportTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  mentorStaffId: integer("mentor_staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "cascade" }),
  reportedSessionsAtRequest: integer("reported_sessions_at_request").notNull(),
  sessionTargetAtRequest: integer("session_target_at_request").notNull(),
  status: text("status", { enum: mentorSessionRequestStatuses }).notNull().default("open"),
  emailNotificationStatus: text("email_notification_status", { enum: mentorSessionRequestEmailStatuses }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByStaffId: integer("resolved_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
}, (table) => [
  check("mentor_session_requests_reported_check", sql`${table.reportedSessionsAtRequest} >= 0`),
  check("mentor_session_requests_target_check", sql`${table.sessionTargetAtRequest} >= 0`),
  check("mentor_session_requests_status_check", sql`${table.status} IN ('open', 'resolved')`),
  check("mentor_session_requests_email_status_check", sql`${table.emailNotificationStatus} IN ('pending', 'delivered', 'failed')`),
  index("mentor_session_requests_program_status_created_idx").on(table.programId, table.status, table.createdAt),
  index("mentor_session_requests_business_created_idx").on(table.businessId, table.createdAt),
  uniqueIndex("mentor_session_requests_one_open_per_business_uq")
    .on(table.businessId)
    .where(sql`${table.status} = 'open'`),
]);

export const insertMentorSessionRequestSchema = createInsertSchema(mentorSessionRequestsTable).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedByStaffId: true,
});

export type InsertMentorSessionRequest = typeof mentorSessionRequestsTable.$inferInsert;
export type MentorSessionRequest = typeof mentorSessionRequestsTable.$inferSelect;
