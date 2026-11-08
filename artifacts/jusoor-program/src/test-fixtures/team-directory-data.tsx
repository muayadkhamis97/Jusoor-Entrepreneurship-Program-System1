import type { ParticipantInvitation, StaffMember } from '@workspace/api-client-react';

// Reserved domains and fixed dates only: never read accounts or send mail.
export const fixtureDate = '2026-10-14T12:00:00.000Z';
export const programName = 'Entrepreneurship incubation — regional founders and community enterprise development';
export const longEmail = 'a-very-long-account-identity-for-regional-program-operations-and-participant-support@example.test';

const staffStates: Pick<StaffMember, 'id' | 'role' | 'primaryRole' | 'status' | 'invitationEmailStatus'>[] = [
  { id: 1, role: 'coordinator', primaryRole: 'coordinator', status: 'active', invitationEmailStatus: null },
  { id: 2, role: 'staff', primaryRole: 'staff', status: 'invited', invitationEmailStatus: null },
  { id: 3, role: 'staff', primaryRole: 'staff', status: 'invited', invitationEmailStatus: 'delivered' },
  { id: 4, role: 'staff', primaryRole: 'staff', status: 'invited', invitationEmailStatus: 'failed' },
  { id: 5, role: 'staff', primaryRole: 'staff', status: 'invited', invitationEmailStatus: 'pending' },
  // A delivered invitation whose resend has an uncertain outcome, not a new API status.
  { id: 6, role: 'staff', primaryRole: 'staff', status: 'invited', invitationEmailStatus: 'delivered' },
];
export const staff: StaffMember[] = staffStates.map(member => ({
  ...member,
  email: `${member.id}-${longEmail}`,
  programIds: member.id === 1 ? [] : [41, 42],
  programRoles: [],
  createdAt: fixtureDate,
}));

export const participants: ParticipantInvitation[] = (['active', 'pending', 'expired'] as const).map((status, index) => ({
  id: 11 + index,
  email: `participant-${index}-${longEmail}`,
  participantName: 'اسم مؤسس طويل للاختبار — Alexandria Catherine Community Enterprise Founder',
  programId: 41,
  programName,
  businessId: 51,
  businessName: 'مشروع مجتمعي طويل الاسم — Regional Sustainable Food and Community Enterprise',
  status,
  createdAt: fixtureDate,
  expiresAt: '2026-11-13T12:00:00.000Z',
}));
