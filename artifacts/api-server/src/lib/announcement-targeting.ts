export type AnnouncementTarget = {
  programId: number | null;
  businessId: number | null;
};

export function businessBelongsToSelectedProgram(
  businessProgramId: number,
  selectedProgramId: number | null,
): boolean {
  return selectedProgramId !== null && businessProgramId === selectedProgramId;
}

export function canParticipantAccessAnnouncement(
  target: AnnouncementTarget,
  acceptedProgramIds: ReadonlySet<number>,
  acceptedBusinessPrograms: ReadonlyMap<number, number>,
): boolean {
  if (target.programId !== null && !acceptedProgramIds.has(target.programId)) return false;
  if (target.businessId === null) return true;
  return target.programId !== null && acceptedBusinessPrograms.get(target.businessId) === target.programId;
}

export function isMissingAnnouncementBusinessColumn(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42703" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("business_id"),
  );
}

export function isMissingBusinessMembershipTable(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42P01" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("jusoor_participant_business_memberships"),
  );
}
