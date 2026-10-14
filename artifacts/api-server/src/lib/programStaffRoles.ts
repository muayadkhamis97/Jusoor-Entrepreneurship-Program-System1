import { and, eq, isNull } from "drizzle-orm";
import { db, programsTable, staffMembersTable, staffProgramAssignmentsTable, staffProgramRolesTable } from "@workspace/db";
import type { ProgramSpecialistRole } from "@workspace/db";

function isUndefinedRelation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");
}

/**
 * Accepts both program-specific specialist roles and legacy primary-role assignments.
 * The latter keeps older installations usable until the additive role migration is applied.
 */
export async function hasProgramStaffRole(
  staffId: number,
  programId: number,
  role: ProgramSpecialistRole,
): Promise<boolean> {
  try {
    const [assignment] = await db.select({ id: staffProgramRolesTable.id })
      .from(staffProgramRolesTable)
      .where(and(
        eq(staffProgramRolesTable.staffId, staffId),
        eq(staffProgramRolesTable.programId, programId),
        eq(staffProgramRolesTable.role, role),
      ))
      .limit(1);
    return Boolean(assignment);
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
  }

  const [member] = await db.select({ id: staffMembersTable.id })
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.role, role),
    ))
    .limit(1);
  if (!member) return false;
  const [legacyAssignment] = await db.select({ id: staffProgramAssignmentsTable.id })
    .from(staffProgramAssignmentsTable)
    .where(and(
      eq(staffProgramAssignmentsTable.staffId, staffId),
      eq(staffProgramAssignmentsTable.programId, programId),
    ))
    .limit(1);
  return Boolean(legacyAssignment);
}

export async function hasAnyProgramStaffRole(
  staffId: number,
  role: ProgramSpecialistRole,
): Promise<boolean> {
  try {
    const [assignment] = await db.select({ id: staffProgramRolesTable.id })
      .from(staffProgramRolesTable)
      .innerJoin(programsTable, eq(programsTable.id, staffProgramRolesTable.programId))
      .where(and(
        eq(staffProgramRolesTable.staffId, staffId),
        eq(staffProgramRolesTable.role, role),
        isNull(programsTable.archivedAt),
      ))
      .limit(1);
    return Boolean(assignment);
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
  }

  const [member] = await db.select({ id: staffMembersTable.id })
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.role, role),
    ))
    .limit(1);
  return Boolean(member);
}
