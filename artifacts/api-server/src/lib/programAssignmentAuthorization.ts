export function canManageProgramAssignments(
  role: string,
  assignedProgramIds: readonly number[],
  programId: number,
  programIsActive: boolean,
): boolean {
  if (!programIsActive) return false;
  return role === "coordinator" || (role === "staff" && assignedProgramIds.includes(programId));
}

export function resolveProgramSpecialistRoles(
  primaryRole: string,
  legacyProgramIds: readonly number[],
  explicitAssignments: readonly { programId: number; role: "trainer" | "mentor" | "judge" }[],
  roleTableAvailable: boolean,
): { programId: number; role: "trainer" | "mentor" | "judge" }[] {
  const roles = new Map<string, { programId: number; role: "trainer" | "mentor" | "judge" }>();
  for (const assignment of explicitAssignments) {
    roles.set(`${assignment.programId}:${assignment.role}`, assignment);
  }
  if (!roleTableAvailable && (primaryRole === "trainer" || primaryRole === "mentor" || primaryRole === "judge")) {
    for (const programId of legacyProgramIds) {
      roles.set(`${programId}:${primaryRole}`, { programId, role: primaryRole });
    }
  }
  return [...roles.values()];
}
