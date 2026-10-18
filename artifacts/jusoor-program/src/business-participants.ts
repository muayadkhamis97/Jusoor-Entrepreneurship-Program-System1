export type BusinessTeamParticipant = {
  applicationId: number;
  founderName: string;
  email: string;
  businessName: string;
  assignedBusinessId: number | null;
};

export function participantsForBusiness(
  participants: readonly BusinessTeamParticipant[],
  businessId: number,
): BusinessTeamParticipant[] {
  return participants.filter(participant => participant.assignedBusinessId === businessId);
}

export function participantInvitationBody(email: string, displayName: string, businessId: number) {
  const normalizedEmail = email.trim().toLowerCase();
  const name = displayName.trim();
  return {
    email: normalizedEmail,
    businessId,
    ...(name ? { displayName: name } : {}),
  };
}
