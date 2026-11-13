import { useState } from 'react';
import {
  getGetMentorFollowUpDigestStatusQueryKey,
  useGetMentorFollowUpDigestStatus,
  type MentorFollowUpDigestStatus,
} from '@workspace/api-client-react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { currentLanguage, t } from './language';

function programCalendarDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts
    .filter(part => part.type !== 'literal')
    .map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', {
    timeZone: 'Asia/Amman',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function mentorDigestStatusLabel(status: MentorFollowUpDigestStatus['status']): string {
  return status === 'uncertain'
    ? 'Email delivery uncertain'
    : status === 'failed'
      ? 'Email failed'
      : status === 'sent'
        ? 'Email sent'
        : status === 'sending'
          ? 'Email sending'
          : 'Email pending';
}

export function mentorDigestStatusGuidance(status: MentorFollowUpDigestStatus['status']): string | null {
  return status === 'uncertain'
    ? 'Uncertain digest deliveries are held for review and are not retried automatically to prevent duplicate emails.'
    : null;
}

function statusClass(status: MentorFollowUpDigestStatus['status']): string {
  if (status === 'sent') return 'badge-good';
  if (status === 'failed' || status === 'uncertain') return 'badge-bad';
  return 'badge-warm';
}

export function MentorDigestStatus() {
  const [calendarDate, setCalendarDate] = useState(programCalendarDate);
  const query = useGetMentorFollowUpDigestStatus(
    { calendarDate },
    {
      query: {
        queryKey: getGetMentorFollowUpDigestStatusQueryKey({ calendarDate }),
        refetchOnWindowFocus: true,
      },
    },
  );
  const delivery = query.data?.[0];

  return <section className="panel staff-panel mentor-digest-status" data-testid="panel-mentor-digest-status">
    <div className="panel-heading">
      <div>
        <div className="eyebrow">{t('MENTOR OPERATIONS')}</div>
        <h2 className="app-title">{t('Mentor digest delivery')}</h2>
        <p>{t('Review mentor digest delivery for a selected program date.')}</p>
      </div>
      <label className="filter-select">
        <CalendarDays size={15} />
        <span className="sr-only">{t('Program date')}</span>
        <input
          className="form-control"
          type="date"
          value={calendarDate}
          onChange={event => setCalendarDate(event.target.value)}
          aria-label={t('Program date')}
          data-testid="input-mentor-digest-date"
        />
      </label>
    </div>

    {query.isLoading
      ? <p role="status" aria-busy="true" data-testid="status-mentor-digest-loading">{t('Loading digest delivery status…')}</p>
      : query.isError
        ? <div className="empty-panel error-panel" role="alert">
            <p>{t('Mentor digest delivery status could not be loaded.')}</p>
            <button
              className="button button-outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              data-testid="button-retry-mentor-digest-status"
            >
              <RefreshCw size={14} /> {query.isFetching ? t('Refreshing…') : t('Retry connection')}
            </button>
          </div>
        : delivery
          ? <div role="status" data-testid="status-mentor-digest-delivery">
              <div className="mentor-digest-status-summary">
                <span className={`badge ${statusClass(delivery.status)}`} data-testid="text-mentor-digest-state">
                  <span />{t(mentorDigestStatusLabel(delivery.status))}
                </span>
                <span>{t('Attempts')}: <b data-testid="text-mentor-digest-attempts">{delivery.attempts}</b></span>
                <span>{t('Last attempt')}: <b data-testid="text-mentor-digest-last-attempt">{formatDateTime(delivery.lastAttemptAt)}</b></span>
                {delivery.sentAt && <span>{t('Sent')}: <b data-testid="text-mentor-digest-sent-at">{formatDateTime(delivery.sentAt)}</b></span>}
              </div>
              {mentorDigestStatusGuidance(delivery.status) && <p className="dashboard-note" data-testid="text-mentor-digest-uncertain-guidance">
                <span className="note-mark"><CalendarDays size={13} /></span>
                {t(mentorDigestStatusGuidance(delivery.status)!)}
              </p>}
            </div>
          : <p className="empty-panel" role="status" data-testid="text-mentor-digest-empty">{t('No digest delivery record exists for this date.')}</p>}
  </section>;
}
