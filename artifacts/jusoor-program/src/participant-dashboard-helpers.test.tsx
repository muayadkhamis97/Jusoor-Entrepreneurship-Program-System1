import assert from 'node:assert/strict';
import test from 'node:test';
import type { ParticipantEnrollment } from '@workspace/api-client-react';
import { getParticipantNextAction, participantSignInInstructions } from './participant-dashboard-helpers';

const now = new Date(2026, 10, 15, 10, 0);
const noLowerPriorityWork = {
  courses: { programs: [] },
  learningProgress: { programs: [] },
  ideaWorkbooks: [],
  businessPlans: [],
};

function enrollment(overrides: Partial<ParticipantEnrollment> = {}): ParticipantEnrollment {
  return {
    applicationStatus: 'accepted',
    assignments: [],
    sessions: [],
    ...overrides,
  } as unknown as ParticipantEnrollment;
}

function localDateTime(hoursFromNow: number): { date: string; time: string } {
  const value = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  const pad = (number: number) => String(number).padStart(2, '0');
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

test('participant next action prioritizes the earliest outstanding assignment', () => {
  const sessionTime = localDateTime(2);
  const action = getParticipantNextAction({
    enrollments: [enrollment({
      assignments: [
        { id: 11, title: 'Later', dueDate: '2026-11-25', status: null, submittedAt: null },
        { id: 12, title: 'Sooner', dueDate: '2026-11-18', status: null, submittedAt: null },
        { id: 13, title: 'Already submitted', dueDate: '2026-11-16', status: 'submitted', submittedAt: '2026-11-14T10:00:00Z' },
      ] as ParticipantEnrollment['assignments'],
      sessions: [{
        id: 20, title: 'Soon session', status: 'scheduled', scheduledDate: sessionTime.date, startTime: sessionTime.time,
      } as ParticipantEnrollment['sessions'][number]],
    })],
    ...noLowerPriorityWork,
    now,
  });
  assert.equal(action?.href, '#participant-assignment-12');
  assert.equal(action?.titleKey, 'Complete your next assignment');
  assert.equal(action?.buttonLabelKey, 'Open assignment');
  assert.equal(action?.detail, 'Sooner');
  assert.equal(action?.date, '2026-11-18');
});

test('participant next action selects a session only when it starts within 24 hours', () => {
  const session = (id: number, hours: number) => {
    const time = localDateTime(hours);
    return {
    id,
    title: `Session ${id}`,
    status: 'scheduled',
    scheduledDate: time.date,
    startTime: time.time,
  } as ParticipantEnrollment['sessions'][number];
  };
  const action = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [session(21, 30), session(22, 4)] })],
    ...noLowerPriorityWork,
    now,
  });
  assert.equal(action?.href, '#participant-session-22');
  assert.equal(action?.titleKey, 'Prepare for your upcoming session');
  assert.equal(action?.time, localDateTime(4).time);
});

test('participant next action selects the next released and incomplete learning module', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment()],
    courses: { programs: [{ programId: 1, programName: 'Cohort', modules: [
      { id: 31, title: 'Completed module', description: null, position: 1, releaseAt: null, dueAt: null, materials: [], isRequired: true },
      { id: 32, title: 'Next module', description: null, position: 2, releaseAt: null, dueAt: null, materials: [], isRequired: true },
      { id: 33, title: 'Not released', description: null, position: 3, releaseAt: '2026-12-01T00:00:00Z', dueAt: null, materials: [], isRequired: true },
    ] }] },
    learningProgress: { programs: [{ programId: 1, programName: 'Cohort', completedRequiredModules: 1, totalRequiredModules: 2, completionPercent: 50, activeSeconds: 0, lastActivityAt: null, modules: [
      { moduleId: 31, title: 'Completed module', isRequired: true, dueAt: null, completedAt: '2026-11-14T10:00:00Z', completionStatus: 'completed', packages: [] },
    ], quizzes: [], certificate: null }] },
    ideaWorkbooks: [],
    businessPlans: [],
    now,
  });
  assert.equal(action?.href, '#participant-course-module-32');
  assert.equal(action?.detail, 'Next module');
});

test('participant next action starts at the first unstarted founder-workbook step', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment()],
    ...noLowerPriorityWork,
    ideaWorkbooks: [{
      applicationId: 26,
      customerSegment: '',
      problemStatement: 'A later step was filled first',
      riskiestAssumption: '',
      mvpExperiment: '',
      successSignal: '',
      evidenceAndNextStep: '',
    }] as NonNullable<Parameters<typeof getParticipantNextAction>[0]['ideaWorkbooks']>,
    now,
  });
  assert.equal(action?.href, '#participant-founder-workbook-26');
  assert.equal(action?.titleKey, 'Start step 1 of your workbook');
  assert.equal(action?.stepKey, 'Step 1 of 6');
});

test('participant next action says when all supported work is complete', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment()],
    ...noLowerPriorityWork,
    ideaWorkbooks: [{
      applicationId: 26,
      customerSegment: 'done',
      problemStatement: 'done',
      riskiestAssumption: 'done',
      mvpExperiment: 'done',
      successSignal: 'done',
      evidenceAndNextStep: 'done',
    }] as NonNullable<Parameters<typeof getParticipantNextAction>[0]['ideaWorkbooks']>,
    businessPlans: [{
      applicationId: 26,
      acquisitionChannels: 'done',
      outreachActions: 'done',
      fulfillmentSteps: 'done',
      reviewSignals: 'done',
    }] as NonNullable<Parameters<typeof getParticipantNextAction>[0]['businessPlans']>,
    now,
  });
  assert.equal(action?.titleKey, 'You’re all caught up');
  assert.equal(action?.href, null);
  assert.equal(action?.buttonLabelKey, null);
});

test('unaccepted participants are directed to their application progress', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment({ applicationStatus: 'pending' as unknown as ParticipantEnrollment['applicationStatus'] })],
    now,
  });
  assert.equal(action?.href, '#participant-program-progress');
  assert.equal(action?.buttonLabelKey, 'View application status');
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
