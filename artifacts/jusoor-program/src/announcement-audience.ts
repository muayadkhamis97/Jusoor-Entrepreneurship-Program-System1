export type AnnouncementAudienceMode = 'all' | 'cohort' | 'business';

export type AnnouncementAudienceTarget = {
  programId: number | null;
  businessId: number | null;
};

export function buildAnnouncementAudienceTarget(
  mode: AnnouncementAudienceMode,
  programValue: string,
  businessValue: string,
): AnnouncementAudienceTarget | null {
  if (mode === 'all') return { programId: null, businessId: null };

  const programId = Number(programValue);
  if (!Number.isInteger(programId) || programId < 1) return null;
  if (mode === 'cohort') return { programId, businessId: null };

  const businessId = Number(businessValue);
  if (!Number.isInteger(businessId) || businessId < 1) return null;
  return { programId, businessId };
}

export function businessesForProgram<T extends { programId: number }>(
  businesses: readonly T[],
  programValue: string,
): T[] {
  const programId = Number(programValue);
  if (!Number.isInteger(programId) || programId < 1) return [];
  return businesses.filter(business => business.programId === programId);
}
