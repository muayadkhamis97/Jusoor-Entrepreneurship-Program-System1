export type TrainerAttendanceEmptyState = 'no-assigned-sessions' | 'no-attendance-yet' | null;

export function getTrainerAttendanceEmptyState(sessionCount: number, attendanceReportCount: number): TrainerAttendanceEmptyState {
  if (attendanceReportCount > 0) return null;
  return sessionCount > 0 ? 'no-attendance-yet' : 'no-assigned-sessions';
}

export function updateTrainerIdSet(current: Set<number>, id: number, active: boolean): Set<number> {
  const next = new Set(current);
  if (active) next.add(id);
  else next.delete(id);
  return next;
}
