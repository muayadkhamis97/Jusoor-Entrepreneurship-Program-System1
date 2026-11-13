import assert from 'node:assert/strict';
import test from 'node:test';
import type { LearningProgressProgram } from '@workspace/api-client-react';
import { buildCohortLearningOutcomesCsv } from './learning-outcomes-export';

const program = (overrides: Partial<LearningProgressProgram> = {}) => ({
  programId: 12,
  programName: 'Spring, "Founders"',
  startDate: '2026-03-01',
  participantCount: 4,
  completedParticipants: 0,
  averageCompletionPercent: 0,
  averageActiveSeconds: 0,
  averageQuizPercent: null,
  assessmentGain: {
    eligibleParticipants: 4,
    participantsWithPre: 3,
    participantsWithPost: 2,
    pairedParticipants: 1,
    preAveragePercent: 0,
    postAveragePercent: 72.5,
    averageGainPercentagePoints: 72.5,
  },
  certificatesIssued: 0,
  reminders: { pending: 0, sent: 0, failed: 0, uncertain: 0, latestError: null, failedDeliveries: [], uncertainDeliveries: [] },
  participants: [],
  ...overrides,
} satisfies LearningProgressProgram);

test('exports cohort assessment averages with their eligible counts', () => {
  const csv = buildCohortLearningOutcomesCsv([program()]);
  const rows = csv.replace(/^\uFEFF/, '').trim().split('\r\n');

  assert.equal(rows[0], [
    '"Program run"',
    '"Program ID"',
    '"Start date"',
    '"Eligible cohort participants"',
    '"Pre-course first-attempt average (%)"',
    '"Participants with pre-course result"',
    '"Post-course first-attempt average (%)"',
    '"Participants with post-course result"',
    '"Participants with both results"',
    '"Average change (percentage points)"',
  ].join(','));
  assert.equal(rows[1], '"Spring, ""Founders""","12","2026-03-01","4","0","3","72.5","2","1","72.5"');
});

test('keeps missing assessment averages and change blank rather than zero', () => {
  const csv = buildCohortLearningOutcomesCsv([program({
    assessmentGain: {
      eligibleParticipants: 4,
      participantsWithPre: 0,
      participantsWithPost: 2,
      pairedParticipants: 0,
      preAveragePercent: null,
      postAveragePercent: 0,
      averageGainPercentagePoints: null,
    },
  })]);

  assert.match(csv, /,"4","","0","0","2","0",""\r\n$/);
  assert.doesNotMatch(csv, /,"0","0","3","0","2","0","0"\r\n$/);
});

test('protects spreadsheet formula-like program names', () => {
  const csv = buildCohortLearningOutcomesCsv([program({ programName: '=HYPERLINK("https://bad.example")' })]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad\.example""\)"/);
});
