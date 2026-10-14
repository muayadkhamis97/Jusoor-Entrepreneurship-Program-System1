export type BusinessTeamRosterRow = {
  applicationId: number;
  programId: number;
  primaryBusinessId: number | null;
  membershipBusinessId: number | null;
  founderName: string;
  clerkUserId: string | null;
};

export type VisibleBusinessTeamMember = {
  founderName: string;
  isYou: boolean;
};

export function participantBusinessTeamMembers(
  business: { businessId: number; programId: number },
  rows: readonly BusinessTeamRosterRow[],
  userId: string,
): VisibleBusinessTeamMember[] {
  const members = new Map<number, VisibleBusinessTeamMember>();
  for (const row of rows) {
    const linkedBusinessId = row.primaryBusinessId ?? row.membershipBusinessId;
    if (row.programId !== business.programId || linkedBusinessId !== business.businessId) continue;
    members.set(row.applicationId, {
      founderName: row.founderName,
      isYou: row.clerkUserId === userId,
    });
  }
  return [...members.values()];
}
