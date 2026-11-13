import { useGetAnnouncementEmailPauseAlert, getGetAnnouncementEmailPauseAlertQueryKey } from '@workspace/api-client-react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { currentLanguage, t, useAppLanguage } from './language';

export function announcementEmailPauseMessage(pause: {
  quotaPaused: boolean;
  reconnectPaused: boolean;
}): string | null {
  if (pause.quotaPaused && pause.reconnectPaused) {
    return 'Announcement emails are paused due to a Gmail sending limit or connection issue.';
  }
  if (pause.quotaPaused) {
    return 'Announcement emails are paused because Gmail has reached a sending limit.';
  }
  if (pause.reconnectPaused) {
    return 'Announcement emails are paused because Gmail needs to be reconnected.';
  }
  return null;
}

export function AnnouncementEmailPauseAlert() {
  useAppLanguage();
  const query = useGetAnnouncementEmailPauseAlert({
    query: {
      queryKey: getGetAnnouncementEmailPauseAlertQueryKey(),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const message = query.data ? announcementEmailPauseMessage(query.data) : null;
  if (!message) return null;

  const nextRetryAt = query.data?.nextRetryAt;
  const retryTime = nextRetryAt
    ? new Date(nextRetryAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return <section className="team-callout announcement-email-pause-alert" role="alert" data-testid="announcement-email-pause-alert">
    <AlertTriangle size={18} aria-hidden="true" />
    <div className="zoom-connect-copy">
      <b>{t(message)}</b>
      <span>{t('Portal announcements remain available while email is paused.')}</span>
      {retryTime && <span>{t('Next scheduled email check:')} {retryTime}</span>}
    </div>
    <Link href="/communications?emailHealth=1" className="button button-outline" data-testid="link-announcement-email-health">
      {t('Review email health')}
    </Link>
  </section>;
}
