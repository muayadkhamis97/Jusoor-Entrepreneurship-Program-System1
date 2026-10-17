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

test('participant invitation instructions confirm email delivery and include the expiration date', () => {
  const instructions = participantSignInInstructions(
    'founder@example.org',
    new Date('2026-11-16T12:00:00.000Z'),
  );
  assert.match(instructions, /founder@example\.org/);
  assert.match(instructions, /Create an account or sign in/);
  assert.match(instructions, /invitation email was sent/i);
  assert.match(instructions, /November 16, 2026/);
});
