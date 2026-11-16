import assert from 'node:assert/strict';
import test from 'node:test';
import type { ParticipantEnrollment } from '@workspace/api-client-react';
import { getParticipantNextAction, participantSignInInstructions } from './participant-dashboard-helpers';
import { loadArabicTranslations, translate } from './language';

await loadArabicTranslations();

const now = new Date('2026-11-15T10:00:00.000Z');
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

test('participant next action prioritizes the earliest outstanding assignment', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment({
      assignments: [
        { id: 11, title: 'Later', dueDate: '2026-11-25', status: null, submittedAt: null },
        { id: 12, title: 'Sooner', dueDate: '2026-11-18', status: null, submittedAt: null },
        { id: 13, title: 'Already submitted', dueDate: '2026-11-16', status: 'submitted', submittedAt: '2026-11-14T10:00:00Z' },
      ] as ParticipantEnrollment['assignments'],
      sessions: [{
        id: 20, title: 'Soon session', status: 'scheduled', scheduledDate: '2026-11-15', startTime: '13:00', timeZone: 'Asia/Amman',
      } as unknown as ParticipantEnrollment['sessions'][number]],
    })],
    ...noLowerPriorityWork,
    now,
  });
  assert.equal(action?.href, '/participant/learning#participant-assignment-12');
  assert.equal(action?.titleKey, 'Complete your next assignment');
  assert.equal(action?.buttonLabelKey, 'Open assignment');
  assert.equal(action?.detail, 'Sooner');
  assert.equal(action?.date, '2026-11-18');
});

test('participant next action selects a session only when it starts within 24 hours', () => {
  const session = (id: number, scheduledDate: string, startTime: string, timeZone: string) => ({
    id,
    title: `Session ${id}`,
    status: 'scheduled',
    scheduledDate,
    startTime,
    timeZone,
  } as unknown as ParticipantEnrollment['sessions'][number]);
  const action = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [
      session(21, '2026-11-16', '14:00', 'Asia/Amman'),
      session(22, '2026-11-15', '14:00', 'Asia/Amman'),
    ] })],
    ...noLowerPriorityWork,
    now,
  });
  assert.equal(action?.href, '/participant/schedule#participant-session-22');
  assert.equal(action?.titleKey, 'Prepare for your upcoming session');
  assert.equal(action?.time, '14:00');
});

test('upcoming session checks use each session zone rather than the participant browser zone', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [{
      id: 23,
      title: 'Pacific session',
      status: 'scheduled',
      scheduledDate: '2026-11-15',
      startTime: '04:00',
      timeZone: 'America/Los_Angeles',
    } as unknown as ParticipantEnrollment['sessions'][number]] })],
    ...noLowerPriorityWork,
    now: new Date('2026-11-15T10:00:00.000Z'),
  });
  assert.equal(action?.href, '/participant/schedule#participant-session-23');
});

test('upcoming session checks account for daylight-saving offset changes', () => {
  const session = (id: number, scheduledDate: string, startTime: string) => ({
    id,
    title: `Session ${id}`,
    status: 'scheduled',
    scheduledDate,
    startTime,
    timeZone: 'America/New_York',
  } as unknown as ParticipantEnrollment['sessions'][number]);

  const beforeSpringForward = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [session(24, '2026-03-08', '01:30')] })],
    ...noLowerPriorityWork,
    now: new Date('2026-03-08T05:00:00.000Z'),
  });
  assert.equal(beforeSpringForward?.href, '/participant/schedule#participant-session-24');

  const afterSpringForward = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [session(25, '2026-03-08', '03:30')] })],
    ...noLowerPriorityWork,
    now: new Date('2026-03-08T07:00:00.000Z'),
  });
  assert.equal(afterSpringForward?.href, '/participant/schedule#participant-session-25');

  const nonexistentSpringTime = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [session(26, '2026-03-08', '02:30')] })],
    ...noLowerPriorityWork,
    now: new Date('2026-03-08T06:00:00.000Z'),
  });
  assert.notEqual(nonexistentSpringTime?.href, '/participant/schedule#participant-session-26');

  const repeatedFallTime = getParticipantNextAction({
    enrollments: [enrollment({ sessions: [session(27, '2026-11-01', '01:30')] })],
    ...noLowerPriorityWork,
    now: new Date('2026-11-01T05:45:00.000Z'),
  });
  assert.notEqual(repeatedFallTime?.href, '/participant/schedule#participant-session-27');
});

test('unread updates needing a reply come after sessions and before learning modules', () => {
  const announcements = [
    { id: 72, title: 'Older update', scheduledFor: '2026-11-14T10:00:00Z', readAt: null, needsReply: true },
    { id: 73, title: 'Latest update', scheduledFor: '2026-11-15T10:00:00Z', readAt: null, needsReply: true },
    { id: 74, title: 'Already read', scheduledFor: '2026-11-15T11:00:00Z', readAt: '2026-11-15T12:00:00Z', needsReply: true },
    { id: 75, title: 'No reply needed', scheduledFor: '2026-11-15T13:00:00Z', readAt: null, needsReply: false },
  ] as unknown as NonNullable<Parameters<typeof getParticipantNextAction>[0]['announcements']>;
  const action = getParticipantNextAction({
    enrollments: [enrollment()],
    announcements,
    ...noLowerPriorityWork,
    now,
  });
  assert.equal(action?.href, '/participant/updates#participant-announcement-73');
  assert.equal(action?.titleKey, 'Reply to a program update');
  assert.equal(action?.buttonLabelKey, 'Open update');
  assert.equal(action?.detail, 'Latest update');
  assert.equal(translate(action?.titleKey || '', 'ar'), 'الرد على تحديث البرنامج');
  assert.equal(translate(action?.buttonLabelKey || '', 'ar'), 'فتح التحديث');
  assert.equal(translate(action?.descriptionKey || '', 'ar'), 'نحتاج إلى ردك على هذا التحديث غير المقروء:');
});

test('an upcoming session remains ahead of an unread update needing a reply', () => {
  const action = getParticipantNextAction({
    enrollments: [enrollment({
      sessions: [{
        id: 22, title: 'Soon session', status: 'scheduled', scheduledDate: '2026-11-15', startTime: '13:00', timeZone: 'Asia/Amman',
      } as unknown as ParticipantEnrollment['sessions'][number]],
    })],
    announcements: [{
      id: 73, title: 'Please reply', scheduledFor: '2026-11-15T10:00:00Z', readAt: null, needsReply: true,
    }] as unknown as NonNullable<Parameters<typeof getParticipantNextAction>[0]['announcements']>,
    ...noLowerPriorityWork,
    now,
  });
  assert.equal(action?.href, '/participant/schedule#participant-session-22');
  assert.equal(action?.titleKey, 'Prepare for your upcoming session');
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
  assert.equal(action?.href, '/participant/learning#participant-course-module-32');
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
  assert.equal(action?.href, '/participant/workbooks/idea#participant-founder-workbook-26');
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
  assert.equal(action?.href, '/participant#participant-program-progress');
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
