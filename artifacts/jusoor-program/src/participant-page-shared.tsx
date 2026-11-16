import { useLocation } from 'wouter';
import { getGetParticipantDashboardQueryKey, useGetParticipantDashboard } from '@workspace/api-client-react';
import { CircleAlert } from 'lucide-react';
import { t, currentLanguage } from './language';
import './participant-routes.css';

export const participantDateText = (value?: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : t('To be announced');

export const participantWord = (value?: string | null) => value
  ? t(value.replaceAll('_', ' ').replace(/\b\w/g, part => part.toUpperCase()))
  : '—';

export const participantStatusWords: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'In review',
  accepted: 'Accepted',
  declined: 'Not selected',
};

export const participantStatusClass = (status: string) => (
  ['accepted', 'completed', 'confirmed'].includes(status) ? 'badge-good'
    : ['declined', 'cancelled'].includes(status) ? 'badge-bad'
      : ['submitted', 'under_review', 'scheduled', 'requested', 'rescheduled'].includes(status) ? 'badge-warm'
        : 'badge-neutral'
);

export function useParticipantEnrollments() {
  return useGetParticipantDashboard({
    query: {
      queryKey: getGetParticipantDashboardQueryKey(),
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
    },
  });
}

export function ParticipantRouteHeading({ title, summary, kicker = 'YOUR PROGRAM JOURNEY / PRIVATE VIEW' }: {
  title: string;
  summary: string;
  kicker?: string;
}) {
  const [path] = useLocation();
  return <header className="participant-page-heading">
    <div className="eyebrow">{t(kicker)}</div>
    <h1 tabIndex={-1} data-participant-route-heading={path.split('#')[0]}>{t(title)}</h1>
    <p>{t(summary)}</p>
  </header>;
}

export function ParticipantPageError({ retry }: { retry: () => void }) {
  return <div className="empty-panel error-panel" role="alert">
    <span className="empty-icon"><CircleAlert size={20} aria-hidden="true" /></span>
    <h2>{t('Your program view could not load.')}</h2>
    <p>{t('Your records are safe. Try connecting again.')}</p>
    <button className="button button-outline" onClick={retry}>{t('Retry connection')}</button>
  </div>;
}
