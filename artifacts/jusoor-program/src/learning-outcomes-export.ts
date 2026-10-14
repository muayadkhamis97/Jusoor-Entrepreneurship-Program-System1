import type { LearningProgressProgram } from '@workspace/api-client-react';

type CohortLearningOutcome = Pick<LearningProgressProgram, 'programId' | 'programName' | 'startDate' | 'assessmentGain'>;

const csvCell = (value: string | number | null) => {
  const safeValue = value == null ? '' : String(value);
  const spreadsheetSafeValue = /^[\t\r ]*[=+\-@]/.test(safeValue) ? `'${safeValue}` : safeValue;
  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
};

export function buildCohortLearningOutcomesCsv(programs: CohortLearningOutcome[]): string {
  const headers = [
    'Program run',
    'Program ID',
    'Start date',
    'Eligible cohort participants',
    'Pre-course first-attempt average (%)',
    'Participants with pre-course result',
    'Post-course first-attempt average (%)',
    'Participants with post-course result',
    'Participants with both results',
    'Average change (percentage points)',
  ];
  const rows = programs.map(({ programId, programName, startDate, assessmentGain }) => [
    programName,
    programId,
    startDate,
    assessmentGain.eligibleParticipants,
    assessmentGain.preAveragePercent,
    assessmentGain.participantsWithPre,
    assessmentGain.postAveragePercent,
    assessmentGain.participantsWithPost,
    assessmentGain.pairedParticipants,
    assessmentGain.averageGainPercentagePoints,
  ]);

  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadCohortLearningOutcomesCsv(programs: CohortLearningOutcome[]): void {
  const csv = buildCohortLearningOutcomesCsv(programs);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cohort-learning-outcomes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
