/**
 * Accept Google's public appointment-schedule URLs, including its share links.
 * Validate locally: never fetch or follow a mentor-supplied URL on the server.
 */
export function isGoogleCalendarBookingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;

    if (url.hostname === "calendar.app.google") {
      return /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    }
    if (url.hostname === "calendar.google.com") {
      return /^\/(?:calendar\/(?:u\/\d+\/)?)?appointments\/schedules\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}
