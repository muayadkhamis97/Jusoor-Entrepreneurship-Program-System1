import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LearningProgressProgram } from '@workspace/api-client-react';
import { CohortAssessmentHistory } from './cohort-assessment-history';

function program(
  programId: number,
  programName: string,
  startDate: string,
  assessmentGain: LearningProgressProgram['assessmentGain'],
): LearningProgressProgram {
  return {
    programId,
    programName,
    startDate,
    participantCount: assessmentGain.eligibleParticipants,
    completedParticipants: 0,
    averageCompletionPercent: 0,
    averageActiveSeconds: 0,
    averageQuizPercent: null,
    assessmentGain,
    certificatesIssued: 0,
    reminders: { pending: 0, sent: 0, failed: 0, latestError: null, failedDeliveries: [] },
    participants: [],
  };
}

test('selected program runs render chronologically with pre- and post-course coverage counts', () => {
  const programs = [
    program(30, 'Autumn 2026', '2026-09-01', {
      eligibleParticipants: 5,
      participantsWithPre: 3,
      participantsWithPost: 2,
      pairedParticipants: 1,
      preAveragePercent: 0,
      postAveragePercent: 50,
      averageGainPercentagePoints: 50,
    }),
    program(10, 'Spring 2025', '2025-03-01', {
      eligibleParticipants: 4,
      participantsWithPre: 4,
      participantsWithPost: 1,
      pairedParticipants: 1,
      preAveragePercent: 25,
      postAveragePercent: null,
      averageGainPercentagePoints: null,
    }),
    program(20, 'Winter 2026', '2026-01-15', {
      eligibleParticipants: 7,
      participantsWithPre: 2,
      participantsWithPost: 6,
      pairedParticipants: 2,
      preAveragePercent: 40,
      postAveragePercent: 60,
      averageGainPercentagePoints: 20,
    }),
  ];

  const markup = renderToStaticMarkup(
    <CohortAssessmentHistory
      programs={programs}
      selectedProgramIds={[30, 10]}
      onToggleProgram={() => {}}
    />,
  );
  const springRow = markup.indexOf('data-testid="row-assessment-history-10"');
  const autumnRow = markup.indexOf('data-testid="row-assessment-history-30"');
  assert.ok(springRow >= 0 && autumnRow > springRow, 'selected runs should be in chronological order');
  assert.doesNotMatch(markup, /data-testid="row-assessment-history-20"/, 'unselected runs should not be rendered');

  const spring = markup.slice(springRow, autumnRow);
  const autumn = markup.slice(autumnRow);
  assert.match(spring, /4 \/ 4 participants/);
  assert.match(spring, /1 \/ 4 participants/);
  assert.match(spring, /<strong>—<\/strong>/);
  assert.match(autumn, /3 \/ 5 participants/);
  assert.match(autumn, /2 \/ 5 participants/);
  assert.match(autumn, /<strong>0\.0%<\/strong>/);
});
