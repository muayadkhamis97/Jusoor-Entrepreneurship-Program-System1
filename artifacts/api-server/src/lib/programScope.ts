import { and, eq, isNull } from "drizzle-orm";
import { db, programsTable } from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";

export async function activeProgramIdsFor(staff: StaffAccess): Promise<number[]> {
  const rows = await db.select({ id: programsTable.id }).from(programsTable)
    .where(isNull(programsTable.archivedAt));
  const activeIds = rows.map(({ id }) => id);
  if (staff.role === "coordinator") return activeIds;
  const assigned = new Set(staff.programIds ?? []);
  return activeIds.filter((id) => assigned.has(id));
}

export async function canAccessActiveProgram(staff: StaffAccess, programId: number): Promise<boolean> {
  if (staff.role !== "coordinator" && !staff.programIds.includes(programId)) return false;
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(and(eq(programsTable.id, programId), isNull(programsTable.archivedAt)))
    .limit(1);
  return Boolean(program);
}
