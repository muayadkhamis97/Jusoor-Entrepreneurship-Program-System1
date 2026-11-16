import { Handshake } from 'lucide-react';
import { ParticipantAnnouncements } from './communications-surfaces';
import { t } from './language';
import { ParticipantPageError, ParticipantRouteHeading, useParticipantEnrollments } from './participant-page-shared';

export function ParticipantUpdatesPage() {
  const query = useParticipantEnrollments();
  const announcements = query.data?.announcements || [];
  return <div className="participant-wrap participant-route-page page-enter">
    <ParticipantRouteHeading title="Updates" summary="Important notes from your cohort, gathered here." />
    {query.isLoading ? <div className="loading-panel" role="status" aria-busy="true"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <ParticipantPageError retry={() => void query.refetch()} />
        : <>
          <section id="participant-updates" className="participant-route-section"><ParticipantAnnouncements announcements={announcements} /></section>
          <div className="participant-support-note" role="note"><Handshake size={15} aria-hidden="true" /><span><b>{t('Need program support?')}</b> {t('Contact the program team if you need help outside a session.')}</span></div>
        </>}
  </div>;
}
