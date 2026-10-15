export type TrainerProgramName = {
  id: number;
  name?: string | null;
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
