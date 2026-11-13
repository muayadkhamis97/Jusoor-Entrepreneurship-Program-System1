import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMentorFollowUpDigestStatusQueryKey,
  useGetMentorFollowUpDigestStatus,
  useReconcileMentorFollowUpDigestDelivery,
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
    : status === 'retry_authorized'
      ? 'Retry authorized'
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
    ? 'Delivery is on hold. Check Gmail Sent using the exact Message-ID. Recent messages can take time to appear; retry only after confirming the message is absent.'
    : status === 'retry_authorized'
      ? 'The retry was authorized after Gmail Sent was checked. The same message identity will be retained.'
    : null;
}

function statusClass(status: MentorFollowUpDigestStatus['status']): string {
  if (status === 'sent') return 'badge-good';
  if (status === 'failed' || status === 'uncertain') return 'badge-bad';
  return 'badge-warm';
}

export function MentorDigestStatus() {
  const [calendarDate, setCalendarDate] = useState(programCalendarDate);
  const [gmailChecked, setGmailChecked] = useState(false);
  const reconcile = useReconcileMentorFollowUpDigestDelivery();
  const client = useQueryClient();
  useEffect(() => setGmailChecked(false), [calendarDate]);
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
  const reconcileDelivery = (deliveryFound: boolean) => {
    reconcile.reset();
    reconcile.mutate({ calendarDate, data: { gmailChecked: true, deliveryFound } }, {
      onSuccess: () => {
        setGmailChecked(false);
        void client.invalidateQueries({ queryKey: getGetMentorFollowUpDigestStatusQueryKey({ calendarDate }) });
      },
    });
  };

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
              {delivery.status === 'uncertain' && <>
                <p className="dashboard-note" data-testid="text-mentor-digest-message-identity">
                  {t('Search Gmail Sent for this exact Message-ID:')} <code>{delivery.messageId}</code>
                </p>
                <label className="mentor-digest-confirm-check"><input
                  type="checkbox"
                  checked={gmailChecked}
                  onChange={event => setGmailChecked(event.target.checked)}
                  data-testid="checkbox-gmail-checked-mentor-digest"
                />{t('I checked Gmail Sent for this message.')}</label>
                <div className="mentor-digest-reconcile-actions">
                  <button className="button button-outline" type="button" onClick={() => reconcileDelivery(true)} disabled={!gmailChecked || reconcile.isPending} data-testid="button-confirm-mentor-digest-delivered">{t('Record as delivered')}</button>
                  <button className="button button-outline" type="button" onClick={() => reconcileDelivery(false)} disabled={!gmailChecked || reconcile.isPending} data-testid="button-retry-absent-mentor-digest">{reconcile.isPending ? t('Resolving…') : t('Retry; confirmed absent')}</button>
                </div>
              </>}
              {reconcile.isError && <p className="form-error" role="alert" data-testid="error-reconcile-mentor-digest">{t('The held email could not be resolved. Refresh the status and try again.')}</p>}
            </div>
          : <p className="empty-panel" role="status" data-testid="text-mentor-digest-empty">{t('No digest delivery record exists for this date.')}</p>}
  </section>;
}
