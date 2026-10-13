export function canTrainerAccessSessionQuestion(
  sessionId: number | null,
  assignedSessionIds: ReadonlySet<number>,
): boolean {
  return sessionId === null || assignedSessionIds.has(sessionId);
}
