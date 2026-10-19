import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMentorMeetingReportsQueryKey, useGetMentorMeetingReports,
  useSubmitMentorMeetingReport,
} from '@workspace/api-client-react';
import type { MentorMeetingReportInput } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { t } from './language';

function todayLocalDate() {
  const local = new Date();
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

export function MentorMeetingReportForm({ engagementId }: { engagementId: number }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const reportQuery = useGetMentorMeetingReports(engagementId, {
    query: { queryKey: getGetMentorMeetingReportsQueryKey(engagementId), enabled: open },
  });
  const submit = useSubmitMentorMeetingReport();
  const [meetingDate, setMeetingDate] = useState(todayLocalDate);
  const [attendeeIds, setAttendeeIds] = useState<number[]>([]);
  const [sessionSummary, setSessionSummary] = useState('');
  const [smartGrowActions, setSmartGrowActions] = useState('');
  const [achievementsAndOpportunities, setAchievementsAndOpportunities] = useState('');
  const [teamRecommendations, setTeamRecommendations] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const resetForm = () => {
    setMeetingDate(todayLocalDate());
    setAttendeeIds([]);
    setSessionSummary('');
    setSmartGrowActions('');
    setAchievementsAndOpportunities('');
    setTeamRecommendations('');
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportQuery.data) return;
    if (!attendeeIds.length) {
      setValidationMessage('Select at least one attending team member.');
      return;
    }
    if ([sessionSummary, smartGrowActions, achievementsAndOpportunities].some(value => value.trim().length < 3)) {
      setValidationMessage('Complete each required answer with at least three non-space characters.');
      return;
    }
    setValidationMessage('');
    const data: MentorMeetingReportInput = {
      meetingDate,
      attendeeApplicationIds: attendeeIds,
      sessionSummary: sessionSummary.trim(),
      smartGrowActions: smartGrowActions.trim(),
      achievementsAndOpportunities: achievementsAndOpportunities.trim(),
      teamRecommendations: teamRecommendations.trim() || null,
    };
    submit.mutate({ id: engagementId, data }, {
      onSuccess: async () => {
        resetForm();
        await client.invalidateQueries({ queryKey: getGetMentorMeetingReportsQueryKey(engagementId) });
      },
    });
  };
  const changeAttendee = (id: number, selected: boolean) =>
    setAttendeeIds(current => selected ? [...new Set([...current, id])] : current.filter(value => value !== id));

  return <section className="mentor-meeting-report-panel" data-testid={`meeting-reports-${engagementId}`}>
    <div className="role-button-row">
      <Button type="button" className="button button-quiet" aria-expanded={open} aria-controls={`meeting-report-content-${engagementId}`} onClick={() => setOpen(value => !value)} data-testid={`button-open-meeting-report-${engagementId}`}>
        {open ? t('Hide meeting reports') : t('Record meeting report')}
      </Button>
    </div>
    {open && <div id={`meeting-report-content-${engagementId}`}>
      <p>{t('Complete a separate report after each meeting. Reports are visible only for this assigned business.')}</p>
      {reportQuery.isLoading && <p role="status">{t('Loading meeting reports…')}</p>}
      {reportQuery.isError && <p role="alert">{t('Meeting reports could not load.')}{' '}
        <Button type="button" className="button button-quiet" onClick={() => void reportQuery.refetch()}>{t('Retry meeting reports')}</Button>
      </p>}
      {reportQuery.data && <>
        <dl className="mentor-meeting-report-identity">
          <div><dt>{t('Coach name')}</dt><dd>{reportQuery.data.coachName}</dd></div>
          <div><dt>{t('Coach email')}</dt><dd>{reportQuery.data.coachEmail}</dd></div>
          <div><dt>{t('Business name')}</dt><dd>{reportQuery.data.businessName}</dd></div>
        </dl>
        <form className="role-form-grid compact" onSubmit={onSubmit} aria-busy={submit.isPending}>
          <label className="field">{t('Meeting date')}
            <input className="form-control" type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} required disabled={submit.isPending} data-testid={`input-meeting-date-${engagementId}`} />
          </label>
          <fieldset className="field field-wide" disabled={submit.isPending} data-testid={`meeting-attendees-${engagementId}`}>
            <legend>{t('Team members who attended the session')} *</legend>
            {reportQuery.data.attendees.length === 0
              ? <p>{t('No accepted team members are assigned to this business yet. Ask the program team to confirm the roster.')}</p>
              : reportQuery.data.attendees.map(person => <label className="mentor-booking-choice" key={person.applicationId}>
                <input type="checkbox" checked={attendeeIds.includes(person.applicationId)} onChange={event => changeAttendee(person.applicationId, event.target.checked)} data-testid={`meeting-attendee-${engagementId}-${person.applicationId}`} />
                <span>{person.name}</span>
              </label>)}
          </fieldset>
          {validationMessage && <p className="field-wide form-error" role="alert">{t(validationMessage)}</p>}
          <label className="field field-wide">{t('Topics, session highlights, connections made, and other notes')} *
            <textarea className="form-control" rows={4} minLength={3} maxLength={5000} value={sessionSummary} onChange={event => setSessionSummary(event.target.value)} required disabled={submit.isPending} data-testid={`input-meeting-summary-${engagementId}`} />
          </label>
          <label className="field field-wide">{t('SMART Grow actions recommended and agreed with the team until the next call')} *
            <textarea className="form-control" rows={4} minLength={3} maxLength={5000} value={smartGrowActions} onChange={event => setSmartGrowActions(event.target.value)} required disabled={submit.isPending} data-testid={`input-smart-grow-actions-${engagementId}`} />
          </label>
          <label className="field field-wide">{t('Key achievements and opportunities resulting from your coaching')} *
            <textarea className="form-control" rows={3} minLength={3} maxLength={5000} value={achievementsAndOpportunities} onChange={event => setAchievementsAndOpportunities(event.target.value)} required disabled={submit.isPending} data-testid={`input-meeting-achievements-${engagementId}`} />
          </label>
          <label className="field field-wide">{t('Recommendations to the program team for further support')}
            <textarea className="form-control" rows={3} maxLength={5000} value={teamRecommendations} onChange={event => setTeamRecommendations(event.target.value)} disabled={submit.isPending} data-testid={`input-meeting-recommendations-${engagementId}`} />
          </label>
          {submit.isError && <p className="field-wide form-error" role="alert" data-testid={`meeting-report-error-${engagementId}`}>{t('Meeting report could not be saved. Your answers are still here; try again.')}</p>}
          {submit.isSuccess && <p className="field-wide" role="status">{t('Meeting report submitted.')}</p>}
          <div className="field-wide">
            <Button type="submit" className="button button-primary" disabled={submit.isPending || reportQuery.data.attendees.length === 0} data-testid={`button-submit-meeting-report-${engagementId}`}>
              {submit.isPending ? t('Submitting…') : t('Submit meeting report')}
            </Button>
          </div>
        </form>
        <section aria-label={t('Previous meeting reports')}>
          <h4>{t('Previous meeting reports')} ({reportQuery.data.reports.length})</h4>
          {reportQuery.data.reports.map(report => <article className="answer-card" key={report.id} data-testid={`meeting-report-history-${report.id}`}>
            <h5>{report.meetingDate} · {report.businessName}</h5>
            <p>{t('Coach name')}: {report.coachName} · {t('Coach email')}: {report.coachEmail}</p>
            <p>{t('Team members who attended the session')}: {report.attendees.join(', ')}</p>
            <p><b>{t('Topics, session highlights, connections made, and other notes')}:</b> {report.sessionSummary}</p>
            <p><b>{t('SMART Grow actions recommended and agreed with the team until the next call')}:</b> {report.smartGrowActions}</p>
            <p><b>{t('Key achievements and opportunities resulting from your coaching')}:</b> {report.achievementsAndOpportunities}</p>
            {report.teamRecommendations && <p><b>{t('Recommendations to the program team for further support')}:</b> {report.teamRecommendations}</p>}
          </article>)}
          {reportQuery.data.reports.length === 0 && <p>{t('No meeting reports submitted yet.')}</p>}
        </section>
      </>}
    </div>}
  </section>;
}
