import { useLocation } from 'wouter';
import { Link } from 'wouter';
import { BookOpen } from 'lucide-react';
import { ParticipantBusinessPlan } from './founder-business-plan';
import { ParticipantIdeaValidation } from './idea-validation';
import { t } from './language';
import { ParticipantPageError, ParticipantRouteHeading, useParticipantEnrollments } from './participant-page-shared';

export function ParticipantWorkbooksPage() {
  const query = useParticipantEnrollments();
  const [path, setPath] = useLocation();
  const accepted = (query.data?.applications || []).filter(enrollment => enrollment.applicationStatus === 'accepted');
  const isPlan = path.endsWith('/plan');
  const tabs = [
    { href: '/participant/workbooks/idea', label: 'Founder workbook' },
    { href: '/participant/workbooks/plan', label: 'Business plan' },
  ];
  const moveTab = (event: React.KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const rtl = document.documentElement.dir === 'rtl';
    const direction = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
    setPath(tabs[next].href);
    requestAnimationFrame(() => document.getElementById(`participant-workbook-tab-${next}`)?.focus());
  };
  return <div className="participant-wrap participant-route-page page-enter">
    <ParticipantRouteHeading title="Workbooks" summary="Private, practical workbooks to help you test your idea and plan your next business steps." />
    <div className="participant-workbook-tabs" role="tablist" aria-label={t('Founder workbooks')}>
      {tabs.map((tab, index) => <Link key={tab.href} id={`participant-workbook-tab-${index}`} href={tab.href} role="tab" aria-selected={isPlan === (index === 1)} aria-controls="participant-workbook-panel" tabIndex={isPlan === (index === 1) ? 0 : -1} onClick={event => { event.preventDefault(); setPath(tab.href); }} onKeyDown={event => moveTab(event, index)}>{t(tab.label)}</Link>)}
    </div>
    {query.isLoading ? <div className="loading-panel" role="status" aria-busy="true"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <ParticipantPageError retry={() => void query.refetch()} />
        : <section id="participant-workbook-panel" role="tabpanel" aria-labelledby={`participant-workbook-tab-${isPlan ? 1 : 0}`} className="participant-route-section">
          {!accepted.length ? <div className="empty-panel"><span className="empty-icon"><BookOpen size={20} /></span><h2>{t('Your workbook is being prepared.')}</h2><p>{t('A private workbook will appear here for each accepted program.')}</p></div>
            : isPlan ? <div id="participant-business-plan-workbook"><ParticipantBusinessPlan enrollments={accepted} /></div> : <div id="participant-founder-workbook"><ParticipantIdeaValidation enrollments={accepted} /></div>}
        </section>}
  </div>;
}
