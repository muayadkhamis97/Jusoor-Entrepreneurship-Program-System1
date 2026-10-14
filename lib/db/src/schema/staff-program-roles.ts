import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";

export const programSpecialistRoles = ["trainer", "mentor", "judge"] as const;
export type ProgramSpecialistRole = typeof programSpecialistRoles[number];

export const staffProgramRolesTable = pgTable("jusoor_staff_program_roles", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "cascade" }),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "restrict" }),
  role: text("role").$type<ProgramSpecialistRole>().notNull(),
  assignedByStaffId: integer("assigned_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("jusoor_staff_program_roles_role_check", sql`${table.role} in ('trainer', 'mentor', 'judge')`),
  uniqueIndex("jusoor_staff_program_roles_staff_program_role_uq").on(table.staffId, table.programId, table.role),
  index("jusoor_staff_program_roles_program_role_idx").on(table.programId, table.role),
  index("jusoor_staff_program_roles_staff_idx").on(table.staffId),
]);

export const insertStaffProgramRoleSchema = createInsertSchema(staffProgramRolesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStaffProgramRole = z.infer<typeof insertStaffProgramRoleSchema>;
export type StaffProgramRole = typeof staffProgramRolesTable.$inferSelect;
