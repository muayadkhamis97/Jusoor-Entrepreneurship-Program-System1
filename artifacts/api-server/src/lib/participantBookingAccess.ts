export type ParticipantSupportBooking = {
  id: number;
  businessId: number;
  type: string;
  provider: string | null;
  topic: string | null;
  scheduledDate: string | null;
  status: string;
  mentorStatus: string | null;
  bookingProvider: string | null;
  calendlyBookingUrl: string | null;
  googleCalendarBookingUrl: string | null;
};

export function getParticipantSupportForBusiness(
  support: ParticipantSupportBooking[],
  businessId: number,
) {
  return support
    .filter((item) => item.businessId === businessId)
    .map(({ businessId: _businessId, calendlyBookingUrl, googleCalendarBookingUrl, bookingProvider, mentorStatus, ...item }) => ({
      ...item,
      mentorBookingUrl: item.type !== "mentor" || mentorStatus !== "active"
        ? null
        : bookingProvider === "google_calendar"
          ? googleCalendarBookingUrl
          : calendlyBookingUrl,
    }));
}
