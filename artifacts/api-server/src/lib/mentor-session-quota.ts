export type AdditionalSessionRequestEligibility =
  | "target_not_configured"
  | "target_not_reached"
  | "request_already_open"
  | "eligible";

export const MENTOR_SESSION_EMAIL_RETRY_STALE_MS = 5 * 60 * 1000;

export function effectiveMentorSessionTarget(programTarget: number, approvedAdditionalSessions: number): number {
  return programTarget + Math.max(0, approvedAdditionalSessions);
}

export function canRetryMentorSessionRequestEmail(
  status: "pending" | "delivered" | "failed",
  updatedAt: Date,
  now = Date.now(),
): boolean {
  return status === "failed" ||
    (status === "pending" && updatedAt.getTime() <= now - MENTOR_SESSION_EMAIL_RETRY_STALE_MS);
}

export function isValidAdditionalSessionDecision(
  decision: "approved" | "declined",
  approvedAdditionalSessions: number | undefined,
): boolean {
  if (decision === "approved") {
    return Number.isInteger(approvedAdditionalSessions) &&
      approvedAdditionalSessions! >= 1 &&
      approvedAdditionalSessions! <= 1000;
  }
  return approvedAdditionalSessions === undefined;
}

export function additionalSessionRequestEligibility(input: {
  reportedSessions: number;
  sessionTarget: number;
  hasOpenRequest: boolean;
}): AdditionalSessionRequestEligibility {
  if (!Number.isInteger(input.sessionTarget) || input.sessionTarget <= 0) {
    return "target_not_configured";
  }
  if (!Number.isInteger(input.reportedSessions) || input.reportedSessions < input.sessionTarget) {
    return "target_not_reached";
  }
  if (input.hasOpenRequest) return "request_already_open";
  return "eligible";
}
