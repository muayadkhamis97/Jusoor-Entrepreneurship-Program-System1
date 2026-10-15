export function filterAssignedTrainerPrograms(
  programIds: readonly number[],
  programs: readonly { id: number; name: string }[],
): { id: number; name: string }[] {
  const assignedIds = new Set(programIds);
  return programs.filter(({ id }) => assignedIds.has(id));
}
