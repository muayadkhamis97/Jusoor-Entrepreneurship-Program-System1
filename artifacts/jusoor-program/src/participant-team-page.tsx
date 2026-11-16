import { Handshake, ShieldCheck, Users } from 'lucide-react';
import {
  getGetParticipantBusinessTeamsQueryKey,
  useGetParticipantBusinessTeams,
} from '@workspace/api-client-react';
import type { ParticipantBusinessTeam, ParticipantEnrollment } from '@workspace/api-client-react';
import { ParticipantPeerDirectory } from './peer-directory';
import { t } from './language';
import {
  ParticipantPageError,
  ParticipantRouteHeading,
  participantDateText,
  participantStatusClass,
  participantWord,
  useParticipantEnrollments,
} from './participant-page-shared';
import './participant-business-team.css';

export function ParticipantTeamPage() {
  const query = useParticipantEnrollments();
  const accepted = (query.data?.applications || []).filter(enrollment => enrollment.applicationStatus === 'accepted');
  return <div className="participant-wrap participant-route-page page-enter">
    <ParticipantRouteHeading title="My team" summary="Your business team, founder support, and a peer directory for your cohort." />
    {query.isLoading ? <div className="loading-panel" role="status" aria-busy="true"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <ParticipantPageError retry={() => void query.refetch()} />
        : !accepted.length ? <div id="participant-business-team" className="empty-panel"><span className="empty-icon"><Users size={20} /></span><h2>{t('Your team is being prepared.')}</h2><p>{t('Your business team and founder community will appear here when you are accepted into a program.')}</p></div>
          : <div className="participant-route-stack">
            <section id="participant-business-team" className="participant-route-section"><div className="participant-route-section-title"><h2>{t('Business team')}</h2><p>{t('Your business and the people building it with you.')}</p></div><ParticipantBusinessTeams /></section>
            <section id="participant-founder-support" className="participant-route-section"><div className="participant-route-section-title"><h2>{t('Founder support')}</h2><p>{t('Support arranged for your business.')}</p></div>{accepted.map(enrollment => <ParticipantFounderSupport key={enrollment.applicationId} enrollment={enrollment} />)}</section>
            <section className="participant-route-section"><div className="participant-route-section-title"><h2>{t('Founder peer directory')}</h2><p>{t('Meet founders who opted in to connect with your cohort.')}</p></div>{accepted.map(enrollment => <ParticipantPeerDirectory programId={enrollment.program.id} key={enrollment.applicationId} />)}</section>
          </div>}
  </div>;
}

function ParticipantBusinessTeams() {
  const query = useGetParticipantBusinessTeams({
    query: { queryKey: getGetParticipantBusinessTeamsQueryKey(), refetchOnWindowFocus: true },
  });
  return <section className="participant-business-teams" aria-labelledby="participant-business-teams-title" data-testid="participant-business-teams">
    <header><span className="participant-business-icon"><Users size={17} /></span><div><div className="eyebrow">{t('YOUR TEAM')}</div><h2 id="participant-business-teams-title">{t('Business team')}</h2></div></header>
    {query.isLoading && <div className="participant-team-loading" aria-label={t('Loading your business team')} />}
    {query.isError && <div className="participant-team-status participant-team-error" role="alert"><p>{t('We could not load your business team.')}</p><button type="button" className="text-link" onClick={() => void query.refetch()} data-testid="button-retry-business-team">{t('Retry connection')}</button></div>}
    {query.data?.length === 0 && <p className="participant-team-status">{t('Your program staff will add your business team here.')}</p>}
    {query.data?.map((team: ParticipantBusinessTeam) => <article className="participant-business-card" key={`${team.programId}-${team.businessId}`}>
      <div className="participant-business-title"><div><span>{team.programName}</span><h3>{team.businessName}</h3></div><span className="badge badge-cool"><span />{t(team.stage.replaceAll('_', ' ').replace(/\b\w/g, value => value.toUpperCase()))}</span></div>
      {team.industry && <p className="participant-business-industry">{team.industry}</p>}
      <div className="participant-business-roster" aria-label={t('Business team members')}>
        {team.members.map((member, index) => <span className={`participant-business-member ${member.isYou ? 'is-you' : ''}`} key={`${member.founderName}-${index}`}>
          <span className="participant-business-member-avatar">{member.founderName.slice(0, 1).toUpperCase()}</span>{member.founderName}{member.isYou && <small>{t('You')}</small>}
        </span>)}
      </div>
      <p className="participant-business-privacy"><ShieldCheck size={14} />{t('Only business details and team members are shared. Your learning progress, assessments, and feedback remain private.')}</p>
    </article>)}
  </section>;
}

function ParticipantFounderSupport({ enrollment }: { enrollment: ParticipantEnrollment }) {
  const founderSupport = enrollment.support.filter(item => item.type !== 'mentor');
  return <section className="participant-section" data-testid={`founder-support-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Founder support')}</h2><p>{t('Support arranged for your business.')}</p></div></div>
    <div className="participant-card">{founderSupport.length === 0
      ? <div className="participant-empty-line" data-testid={`participant-founder-support-empty-${enrollment.applicationId}`}><Handshake size={17} aria-hidden="true" /><p>{t('No support engagements are linked yet. Your admin will update this space as support is arranged.')}</p></div>
      : founderSupport.map(item => <div className="participant-entry" key={item.id} data-testid={`support-participant-${item.id}`}><div className="calendar-icon"><Handshake size={16} /></div><div className="participant-entry-copy"><b>{item.topic}</b><span>{participantWord(item.type)} {t('with')} {item.provider}{item.scheduledDate ? ` · ${participantDateText(item.scheduledDate)}` : ''}</span></div><span className={`badge ${participantStatusClass(item.status)}`}>{participantWord(item.status)}</span></div>)}</div>
  </section>;
}
