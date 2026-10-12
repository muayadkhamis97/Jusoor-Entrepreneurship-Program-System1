export type ParticipantSupportBooking = {
  id: number;
  businessId: number;
  type: string;
  provider: string | null;
  topic: string | null;
  scheduledDate: string | null;
  status: string;
  calendlyBookingUrl: string | null;
};

export function getParticipantSupportForBusiness(
  support: ParticipantSupportBooking[],
  businessId: number,
) {
  return support
    .filter((item) => item.businessId === businessId)
    .map(({ businessId: _businessId, calendlyBookingUrl, ...item }) => ({
      ...item,
      mentorBookingUrl: item.type === "mentor" ? calendlyBookingUrl : null,
    }));
}
