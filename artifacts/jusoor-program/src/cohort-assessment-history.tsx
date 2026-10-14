import React from 'react';
import type { LearningProgressProgram } from '@workspace/api-client-react';
import { Download } from 'lucide-react';
import { currentLanguage, t } from './language';
import { downloadCohortLearningOutcomesCsv } from './learning-outcomes-export';

function fmtDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : t('Not set');
}

export function CohortAssessmentHistory({
  programs,
  selectedProgramIds,
  onToggleProgram,
}: {
  programs: LearningProgressProgram[];
  selectedProgramIds: number[] | null;
  onToggleProgram: (programId: number) => void;
}) {
  const selectedPrograms = programs
    .filter(program => selectedProgramIds === null || selectedProgramIds.includes(program.programId))
    .sort((left, right) => {
      if (left.startDate && right.startDate) return left.startDate.localeCompare(right.startDate) || left.programId - right.programId;
      if (left.startDate) return -1;
      if (right.startDate) return 1;
      return left.programId - right.programId;
    });
  const score = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
  const change = (program: LearningProgressProgram) => {
    const { preAveragePercent, postAveragePercent, averageGainPercentagePoints } = program.assessmentGain;
    if (preAveragePercent === null || postAveragePercent === null || averageGainPercentagePoints === null) return '—';
    return `${averageGainPercentagePoints > 0 ? '+' : ''}${averageGainPercentagePoints.toFixed(1)} ${t('pp')}`;
  };

  return <section className="lp-assessment-history" data-testid="panel-assessment-history">
    <header className="lp-history-header">
      <div><span className="lp-eyebrow">{t('HISTORICAL LEARNING')}</span><h3>{t('Assessment results across program runs')}</h3>
        <p>{t('Compare first-attempt pre-course and post-course averages. Each average includes only participants with an eligible result. Averages with fewer than 5 eligible participants are flagged because small samples may be less representative.')}</p>
      </div>
      <button
        type="button"
        className="lp-button lp-button-outline lp-history-export"
        onClick={() => downloadCohortLearningOutcomesCsv(selectedPrograms)}
        disabled={!selectedPrograms.length}
        data-testid="button-export-learning-outcomes"
      ><Download size={14} />{t('Export spreadsheet (CSV)')}</button>
    </header>
    <fieldset className="lp-history-select">
      <legend>{t('SELECT PROGRAM RUNS')}</legend>
      <div>{programs.map(program => {
        const checked = selectedProgramIds === null || selectedProgramIds.includes(program.programId);
        return <label key={program.programId}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleProgram(program.programId)}
            data-testid={`checkbox-assessment-history-program-${program.programId}`}
          />
          <span>{program.programName}</span>
        </label>;
      })}</div>
    </fieldset>
    {selectedPrograms.length ? <div className="lp-history-table-wrap">
      <table className="lp-history-table">
        <thead><tr>
          <th>{t('Program run')}</th>
          <th>{t('Pre-course average')}</th>
          <th>{t('Post-course average')}</th>
          <th>{t('Average change')}</th>
        </tr></thead>
        <tbody>{selectedPrograms.map(program => {
          const summary = program.assessmentGain;
          const delta = summary.averageGainPercentagePoints;
          return <tr key={program.programId} data-testid={`row-assessment-history-${program.programId}`}>
            <th scope="row"><strong>{program.programName}</strong><small>{fmtDate(program.startDate)}</small></th>
            <td><strong>{score(summary.preAveragePercent)}</strong><small>{summary.participantsWithPre} / {summary.eligibleParticipants} {t('participants')}{summary.participantsWithPre < 5 && <span className="lp-history-small-sample" data-testid={`badge-small-sample-pre-${program.programId}`}>{t('Small sample')}</span>}</small></td>
            <td><strong>{score(summary.postAveragePercent)}</strong><small>{summary.participantsWithPost} / {summary.eligibleParticipants} {t('participants')}{summary.participantsWithPost < 5 && <span className="lp-history-small-sample" data-testid={`badge-small-sample-post-${program.programId}`}>{t('Small sample')}</span>}</small></td>
            <td className={delta == null ? '' : delta > 0 ? 'is-gain' : 'is-loss'}><strong>{change(program)}</strong></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <p className="lp-history-empty">{t('Select at least one program run to compare assessment results.')}</p>}
    <p className="lp-history-footnote">{t('Change is omitted when either average has no eligible results. Missing assessments are not treated as zero.')}</p>
  </section>;
}
