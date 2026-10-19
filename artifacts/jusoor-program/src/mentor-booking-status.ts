import type { MentorBookingStatus } from '@workspace/api-client-react';

type ConnectionStatus = Pick<MentorBookingStatus, 'calendlyConnected' | 'googleCalendarConnected'>;
type FollowUpStatus = ConnectionStatus & Pick<MentorBookingStatus, 'calendlyFollowUpDate' | 'calendlyFollowUpNote'>;

export function hasMentorBookingConnection(mentor: ConnectionStatus): boolean {
  return mentor.calendlyConnected || mentor.googleCalendarConnected;
}

export function mentorBookingConnectionSummary(mentors: FollowUpStatus[]) {
  const pending = mentors.filter(mentor => !hasMentorBookingConnection(mentor));
  return {
    connectedCount: mentors.length - pending.length,
    pendingCount: pending.length,
    needsFollowUpCount: pending.filter(mentor => !mentor.calendlyFollowUpDate && !mentor.calendlyFollowUpNote).length,
  };
}
