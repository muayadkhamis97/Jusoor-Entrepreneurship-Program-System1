type SessionProgramOption = {
  id: number;
  name: string;
};

export function sessionProgramField(programs: readonly SessionProgramOption[], isAdmin: boolean) {
  return {
    name: 'programId',
    label: 'Program cohort',
    kind: 'select' as const,
    required: !isAdmin,
    hint: isAdmin ? undefined : 'Choose an assigned cohort. If none are listed, ask an admin to assign you to one.',
    options: programs.map(program => ({ value: String(program.id), label: program.name })),
  };
}
