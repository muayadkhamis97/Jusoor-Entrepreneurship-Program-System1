import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

const googleCalendarSkipWindowMs = 10 * 60_000;
const googleCalendarSkipAlertThreshold = 3;
const googleCalendarSkipAlertCooldownMs = 10 * 60_000;

type GoogleCalendarSkipState = {
  timestamps: number[];
  lastAlertAt?: number;
};

const googleCalendarSkipStateByMentor = new Map<number, GoogleCalendarSkipState>();

/**
 * Keep individual lock-contention skips searchable, but escalate only when a
 * mentor has repeatedly skipped within a short window. This is an operational
 * log alert, not a provider failure, and must not affect sync health fields.
 */
export function logGoogleCalendarSyncSkipped(mentorStaffId: number, now = Date.now()): void {
  const skipEvent = {
    event: "google_calendar_sync_skipped",
    mentorStaffId,
    skipped: true,
    reason: "lock_contended",
  } as const;

  logger.info(skipEvent, "Google Calendar sync skipped");

  for (const [mentorId, state] of googleCalendarSkipStateByMentor) {
    if (!state.timestamps.some(timestamp => now - timestamp < googleCalendarSkipWindowMs)) {
      googleCalendarSkipStateByMentor.delete(mentorId);
    }
  }

  const previousState = googleCalendarSkipStateByMentor.get(mentorStaffId);
  const timestamps = (previousState?.timestamps ?? [])
    .filter(timestamp => now - timestamp < googleCalendarSkipWindowMs);
  timestamps.push(now);
  const state: GoogleCalendarSkipState = {
    timestamps,
    lastAlertAt: previousState?.lastAlertAt,
  };

  if (
    timestamps.length >= googleCalendarSkipAlertThreshold &&
    (state.lastAlertAt === undefined || now - state.lastAlertAt >= googleCalendarSkipAlertCooldownMs)
  ) {
    state.lastAlertAt = now;
    logger.error({
      ...skipEvent,
      alert: "repeated_lock_contention",
      skipCount: timestamps.length,
      windowMs: googleCalendarSkipWindowMs,
    }, `ALERT: Google Calendar sync for mentor ${mentorStaffId} skipped ${timestamps.length} times within 10 minutes`);
  }

  googleCalendarSkipStateByMentor.set(mentorStaffId, state);
}
