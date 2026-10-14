import { createInsertSchema } from "drizzle-zod";
import { check, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";

export const staffAssignmentAuditTypes = ["staff_roles", "business_team"] as const;
export type StaffAssignmentAuditType = typeof staffAssignmentAuditTypes[number];
export type StaffAssignmentAuditValue = Record<string, string | number | null | string[]>;

export const staffAssignmentAuditEventsTable = pgTable("jusoor_staff_assignment_audit_events", {
  id: serial("id").primaryKey(),
  assignmentType: text("assignment_type").$type<StaffAssignmentAuditType>().notNull(),
  programId: integer("program_id").notNull(),
  programName: text("program_name").notNull(),
  actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  actorEmail: text("actor_email").notNull(),
  affectedStaffId: integer("affected_staff_id"),
  affectedAccountEmail: text("affected_account_email"),
  applicationId: integer("application_id"),
  affectedApplicationName: text("affected_application_name"),
  previousValue: jsonb("previous_value").$type<StaffAssignmentAuditValue>().notNull(),
  newValue: jsonb("new_value").$type<StaffAssignmentAuditValue>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("jusoor_staff_assignment_audit_events_type_check", sql`${table.assignmentType} in ('staff_roles', 'business_team')`),
  check(
    "jusoor_staff_assignment_audit_events_subject_check",
    sql`(${table.assignmentType} = 'staff_roles' and ${table.affectedStaffId} is not null and ${table.applicationId} is null)
      or (${table.assignmentType} = 'business_team' and ${table.affectedStaffId} is null and ${table.applicationId} is not null)`,
  ),
  index("jusoor_staff_assignment_audit_events_created_idx").on(table.createdAt, table.id),
  index("jusoor_staff_assignment_audit_events_program_idx").on(table.programId, table.createdAt),
]);

export const insertStaffAssignmentAuditEventSchema = createInsertSchema(staffAssignmentAuditEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStaffAssignmentAuditEvent = typeof staffAssignmentAuditEventsTable.$inferInsert;
export type StaffAssignmentAuditEvent = typeof staffAssignmentAuditEventsTable.$inferSelect;
