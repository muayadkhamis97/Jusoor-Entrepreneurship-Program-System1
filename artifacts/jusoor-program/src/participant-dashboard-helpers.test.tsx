import assert from 'node:assert/strict';
import test from 'node:test';
import { getParticipantNextAction, participantSignInInstructions } from './participant-dashboard-helpers';

test('participant dashboard next action leads accepted founders to learning and others to their application', () => {
  assert.deepEqual(getParticipantNextAction(true), {
    href: '#participant-learning',
    titleKey: 'Continue with your program learning',
    descriptionKey: 'Your learning materials and upcoming sessions are available below.',
  });
  assert.deepEqual(getParticipantNextAction(false), {
    href: '#participant-program-progress',
    titleKey: 'Check your application progress',
    descriptionKey: 'Your application status and program updates are gathered below.',
  });
});

test('participant invitation instructions truthfully explain account access without claiming an email was sent', () => {
  const instructions = participantSignInInstructions('founder@example.org');
  assert.match(instructions, /founder@example\.org/);
  assert.match(instructions, /Create an account or sign in/);
  assert.match(instructions, /No email was sent/);
});
