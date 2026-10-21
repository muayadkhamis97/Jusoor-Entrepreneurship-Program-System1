export type AdditionalSessionRequestEligibility =
  | "target_not_configured"
  | "target_not_reached"
  | "request_already_open"
  | "eligible";

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
