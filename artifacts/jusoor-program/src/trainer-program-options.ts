export type TrainerProgramName = {
  id: number;
  name?: string | null;
};

export type TrainerSession = {
  id: number;
  programId?: number | null;
  title: string;
};

export function trainerProgramOptions(
  programs: readonly TrainerProgramName[],
  unavailableLabel: string,
): { id: number; label: string }[] {
  return programs.map(program => ({
    id: program.id,
    label: program.name?.trim() || unavailableLabel,
  }));
}

export function trainerSessionOptions(
  sessions: readonly TrainerSession[],
  programId: number | null,
): { id: number; title: string }[] {
  if (programId === null) return [];
  return sessions
    .filter(session => session.programId === programId)
    .map(({ id, title }) => ({ id, title }));
}
