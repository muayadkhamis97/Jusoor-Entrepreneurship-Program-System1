import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";

export const staffProgramAssignmentsTable = pgTable("jusoor_staff_program_assignments", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "cascade" }),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "restrict" }),
  assignedByStaffId: integer("assigned_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("jusoor_staff_program_assignments_staff_program_uq").on(table.staffId, table.programId),
  index("jusoor_staff_program_assignments_program_idx").on(table.programId),
]);

export const insertStaffProgramAssignmentSchema = createInsertSchema(staffProgramAssignmentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStaffProgramAssignment = z.infer<typeof insertStaffProgramAssignmentSchema>;
export type StaffProgramAssignment = typeof staffProgramAssignmentsTable.$inferSelect;
