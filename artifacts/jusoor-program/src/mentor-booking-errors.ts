export const bookingSaveMessages = {
  url: 'Enter a public Google Calendar appointment-schedule link, not a calendar or event link.',
  googleConnection: 'Connect Google Calendar using the connection button above, then save again.',
  calendlyConnection: 'Connect Calendly using the connection button above, then save again.',
  authentication: 'Your session has expired. Sign in again, then return to Booking settings.',
  access: 'Your account cannot change mentor booking settings. Ask an admin to check your mentor access.',
  rateLimit: 'Too many save attempts. Wait a moment, then try saving again.',
  server: 'The service could not complete this save. Your edits are still here. Try saving again shortly.',
  network: 'The save could not be confirmed because of a connection problem. Check your connection and try saving again.',
  validation: 'Check the selected booking provider and schedule link, then try saving again.',
} as const;

export function mentorBookingSaveError(error: unknown): { message: string; field?: 'url' } {
  const candidate = error && typeof error === 'object'
    ? error as { status?: unknown; data?: { error?: unknown } }
    : {};
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  // HTTP status takes precedence; never expose arbitrary response/exception text.
  if (status === 401) return { message: bookingSaveMessages.authentication };
  if (status === 403) return { message: bookingSaveMessages.access };
  if (status === 429) return { message: bookingSaveMessages.rateLimit };
  if (status !== undefined && status >= 500) return { message: bookingSaveMessages.server };
  if (status === undefined || status === 0) return { message: bookingSaveMessages.network };
  if (status === 400 || status === 422) {
    switch (candidate.data?.error) {
      case 'Enter a Google Calendar appointment-schedule link.':
      case 'Add your public Google Calendar appointment-schedule link first.':
        return { message: bookingSaveMessages.url, field: 'url' };
      case 'Connect Google Calendar before selecting it as your booking provider.':
        return { message: bookingSaveMessages.googleConnection };
      case 'Connect Calendly before selecting it as your booking provider.':
        return { message: bookingSaveMessages.calendlyConnection };
      default:
        return { message: bookingSaveMessages.validation };
    }
  }
  return { message: bookingSaveMessages.server };
}
