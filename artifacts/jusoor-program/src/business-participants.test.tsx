import assert from 'node:assert/strict';
import test from 'node:test';
import { participantInvitationBody, participantsForBusiness, type BusinessTeamParticipant } from './business-participants';

const participants: BusinessTeamParticipant[] = [
  { applicationId: 1, founderName: 'Amina Noor', email: 'amina@example.org', businessName: 'North Star', assignedBusinessId: 12 },
  { applicationId: 2, founderName: 'Omar Saleh', email: 'omar@example.org', businessName: 'Green Path', assignedBusinessId: 24 },
  { applicationId: 3, founderName: 'Lina Haddad', email: 'lina@example.org', businessName: 'North Star', assignedBusinessId: 12 },
  { applicationId: 4, founderName: 'Unassigned', email: 'unassigned@example.org', businessName: 'North Star', assignedBusinessId: null },
];

test('business roster shows only participants assigned to the selected business', () => {
  assert.deepEqual(participantsForBusiness(participants, 12).map(participant => participant.applicationId), [1, 3]);
});

test('participant invite targets the selected business and normalizes the supplied identity', () => {
  assert.deepEqual(participantInvitationBody('  NEW@EXAMPLE.ORG ', '  New Participant  ', 12), {
    email: 'new@example.org',
    businessId: 12,
    displayName: 'New Participant',
  });
  assert.deepEqual(participantInvitationBody('new@example.org', '   ', 12), {
    email: 'new@example.org',
    businessId: 12,
  });
});
