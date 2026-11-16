import { useUser } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import {
  getGetParticipantBusinessPlansQueryKey,
  getGetParticipantCoursesQueryKey,
  getGetParticipantDashboardQueryKey,
  getGetParticipantIdeaValidationQueryKey,
  getGetParticipantLearningProgressQueryKey,
  getGetParticipantProfileQueryKey,
  useGetParticipantBusinessPlans,
  useGetParticipantCourses,
  useGetParticipantDashboard,
  useGetParticipantIdeaValidation,
  useGetParticipantLearningProgress,
  useGetParticipantProfile,
} from '@workspace/api-client-react';
import type { ParticipantEnrollment } from '@workspace/api-client-react';
import { ArrowRight, CircleAlert, MessageSquareText, ShieldCheck } from 'lucide-react';
import { getParticipantNextAction } from './participant-dashboard-helpers';
import { currentLanguage, t, useAppLanguage } from './language';
import {
  participantDateText,
  participantStatusClass,
  participantStatusWords,
  participantWord,
} from './participant-page-shared';

export function ParticipantDashboardPage() {
  useAppLanguage();
  const [path] = useLocation();
  const query = useGetParticipantDashboard({
    query: { queryKey: getGetParticipantDashboardQueryKey(), refetchOnWindowFocus: true, refetchInterval: 60_000 },
  });
  const profileQuery = useGetParticipantProfile({
    query: { queryKey: getGetParticipantProfileQueryKey(), retry: false },
  });
  const { user } = useUser();
  const enrollments = query.data?.applications || [];
  const acceptedEnrollments = enrollments.filter(enrollment => enrollment.applicationStatus === 'accepted');
  const hasAcceptedEnrollment = acceptedEnrollments.length > 0;
  const progressQuery = useGetParticipantLearningProgress({
    query: { queryKey: getGetParticipantLearningProgressQueryKey(), enabled: hasAcceptedEnrollment },
  });
  const coursesQuery = useGetParticipantCourses({
    query: { queryKey: getGetParticipantCoursesQueryKey(), enabled: hasAcceptedEnrollment },
  });
  const ideaQuery = useGetParticipantIdeaValidation({
    query: { queryKey: getGetParticipantIdeaValidationQueryKey(), enabled: hasAcceptedEnrollment },
  });
  const planQuery = useGetParticipantBusinessPlans({
    query: { queryKey: getGetParticipantBusinessPlansQueryKey(), enabled: hasAcceptedEnrollment },
  });
  const learningActionReady = !hasAcceptedEnrollment
    || coursesQuery.isSuccess && progressQuery.isSuccess
    || coursesQuery.isError || progressQuery.isError;
  const workbookActionReady = !hasAcceptedEnrollment
    || ideaQuery.isSuccess && planQuery.isSuccess
    || ideaQuery.isError || planQuery.isError;
  const nextAction = getParticipantNextAction({
    enrollments,
    announcements: query.data?.announcements,
    courses: coursesQuery.data,
    learningProgress: progressQuery.data,
    ideaWorkbooks: learningActionReady && workbookActionReady ? ideaQuery.data?.workbooks : undefined,
    businessPlans: learningActionReady && workbookActionReady ? planQuery.data?.plans : undefined,
  });
  const nextActionLoading = hasAcceptedEnrollment && !nextAction && (
    coursesQuery.isLoading || progressQuery.isLoading || ideaQuery.isLoading || planQuery.isLoading
  );
  const nextActionError = hasAcceptedEnrollment && !nextAction && (
    coursesQuery.isError || progressQuery.isError || ideaQuery.isError || planQuery.isError
  );
  const name = profileQuery.data?.displayName || user?.firstName || user?.fullName || 'Founder';
  const updates = (query.data?.announcements || [])
    .filter(item => new Date(item.scheduledFor).getTime() <= Date.now())
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  const activeLearning = progressQuery.data?.programs || [];
  const nextSession = acceptedEnrollments
    .flatMap(item => item.sessions)
    .filter(item => item.status === 'scheduled')
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.startTime || '').localeCompare(b.startTime || ''))[0];
  const workbookTotal = (ideaQuery.data?.workbooks || [])
    .filter(item => acceptedEnrollments.some(enrollment => enrollment.applicationId === item.applicationId))
    .reduce((sum, workbook) => sum + ['customerSegment', 'problemStatement', 'riskiestAssumption', 'mvpExperiment', 'successSignal', 'evidenceAndNextStep']
      .filter(key => typeof workbook[key as keyof typeof workbook] === 'string' && String(workbook[key as keyof typeof workbook]).trim()).length, 0)
    + (planQuery.data?.plans || [])
      .filter(item => acceptedEnrollments.some(enrollment => enrollment.applicationId === item.applicationId))
      .reduce((sum, plan) => sum + ['acquisitionChannels', 'outreachActions', 'fulfillmentSteps', 'reviewSignals']
        .filter(key => typeof plan[key as keyof typeof plan] === 'string' && String(plan[key as keyof typeof plan]).trim()).length, 0);
  const workbookSteps = acceptedEnrollments.length * 10;
  const learningCompleted = activeLearning.reduce((sum, item) => sum + item.completedRequiredModules, 0);
  const learningTotal = activeLearning.reduce((sum, item) => sum + item.totalRequiredModules, 0);
  const loading = query.isLoading || profileQuery.isLoading;

  return <div className="participant-wrap page-enter">
    <header className="participant-home-heading"><div>
      <div className="eyebrow">{t('YOUR PROGRAM JOURNEY / PRIVATE VIEW')}</div>
      <h1 tabIndex={-1} data-participant-route-heading={path}>{t('Welcome,')} {name.split(' ')[0]}.</h1>
      <p>{t('A clear view of your cohort, next steps, updates, and learning.')}</p>
    </div></header>
    {loading ? <div className="loading-panel" role="status" aria-busy="true"><div className="skeleton skeleton-wide" /><div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton skeleton-table" /></div>
      : query.isError ? <div className="empty-panel error-panel" role="alert"><span className="empty-icon"><CircleAlert size={22} /></span><h2>{t('Your progress view isn’t available just yet.')}</h2><p>{t('Check that you’re signed in with the same verified email used on your application or invitation. Your records remain private.')}</p><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-participant">{t('Retry connection')}</button></div>
        : <>
          <section id="participant-next-action" className="participant-home-next-action" aria-labelledby="participant-next-action-title" data-testid="participant-page-next-action">
            <div><span className="eyebrow">{t('YOUR NEXT ACTION')}</span>
              <h2 id="participant-next-action-title">{nextAction ? t(nextAction.titleKey) : nextActionError ? t('Your next action could not be checked.') : nextActionLoading ? t('Checking your next step…') : t('You’re all caught up')}</h2>
              <p>{nextAction ? <>{t(nextAction.descriptionKey)}{nextAction.detail && <> <strong>{nextAction.detail}</strong></>}{nextAction.stepKey && <> · {t(nextAction.stepKey)}</>}{nextAction.date && <> · {t(nextAction.dateLabelKey || 'Date')}: {participantDateText(nextAction.date)}{nextAction.time ? ` · ${nextAction.time}` : ''}</>}</> : nextActionError ? t('We could not check your workbooks. Retry to find your next action.') : nextActionLoading ? t('Checking your next step…') : t('There are no due assignments, upcoming sessions, unread updates needing a reply, or unfinished workbook steps right now.')}</p>
            </div>
            {nextAction?.href && nextAction.buttonLabelKey && <Link className="button button-primary participant-primary-action" href={nextAction.href}>{t(nextAction.buttonLabelKey)} <ArrowRight size={15} /></Link>}
            {nextActionError && <button type="button" className="button button-outline" onClick={() => { void Promise.all([coursesQuery.refetch(), progressQuery.refetch(), ideaQuery.refetch(), planQuery.refetch()]); }} data-testid="button-retry-next-action">{t('Retry')}</button>}
          </section>
          <section className="participant-summary-grid" aria-label={t('Program summary')}>
            <Link href="/participant/schedule" className="participant-summary-tile" aria-label={`${t('Next session')}: ${nextSession?.title || t('No sessions yet')}`}>
              <span>{t('Next session')}</span>
              <strong>{nextSession?.title || t('No sessions yet')}</strong>
              <small>{nextSession ? `${participantDateText(nextSession.scheduledDate)}${nextSession.startTime ? ` · ${nextSession.startTime}` : ''} · ${(nextSession as typeof nextSession & { timeZone: string }).timeZone}` : t('Your cohort schedule will appear here.')}</small>
            </Link>
            <Link href="/participant/updates" className="participant-summary-tile" aria-label={`${t('Unread updates')}: ${updates.filter(item => !item.readAt).length}`}>
              <span>{t('Unread updates')}</span>
              <strong>{updates.filter(item => !item.readAt).length}</strong>
              <small>{t('Updates from your program team')}</small>
            </Link>
            <Link href="/participant/workbooks/idea" className="participant-summary-tile" aria-label={`${t('Workbook progress')}: ${workbookTotal} ${t('of')} ${workbookSteps}`}>
              <span>{t('Workbook progress')}</span>
              <strong>{ideaQuery.isLoading || planQuery.isLoading ? '—' : `${workbookTotal} / ${workbookSteps}`}</strong>
              <small>{t('Founder and business-plan steps started')}</small>
            </Link>
            <Link href="/participant/learning" className="participant-summary-tile" aria-label={`${t('Learning progress')}: ${learningTotal ? `${Math.round(learningCompleted / learningTotal * 100)}%` : t('No modules yet')}`}>
              <span>{t('Learning progress')}</span>
              <strong>{progressQuery.isLoading ? '—' : learningTotal ? `${Math.round(learningCompleted / learningTotal * 100)}%` : t('No modules yet')}</strong>
              <small>{learningTotal ? `${learningCompleted} ${t('of')} ${learningTotal} ${t('required modules')}` : t('No modules yet')}</small>
            </Link>
          </section>
          <section id="participant-program-progress" className="participant-home-cohorts">
            {enrollments.length ? enrollments.map(enrollment => <ParticipantCohortCard key={enrollment.applicationId} enrollment={enrollment} />)
              : <div className="intake-success"><span className="intake-success-mark"><ShieldCheck size={24} /></span><div className="eyebrow">{t('PRIVATE FOUNDER VIEW')}</div><h2>{t('No program access linked yet.')}</h2><p>{t('This account does not have a program application or invitation associated with it. Sign in using the same verified email you used when applying or the email Admin invited, or start an application to a current cohort.')}</p><Link href="/apply" className="button button-primary" data-testid="link-start-application">{t('Explore open programs')} <ArrowRight size={15} /></Link></div>}
          </section>
          <section className="participant-home-updates">
            <div className="participant-section-head"><div><h2>{t('Latest updates')}</h2><p>{t('The latest notes from your program team.')}</p></div><Link href="/participant/updates" className="participant-text-link">{t('See all updates')} <ArrowRight size={14} /></Link></div>
            {query.data?.announcements?.length ? <div className="participant-home-update-list">{updates.slice(0, 2).map(item => <article key={item.id} className="participant-home-update" data-testid={`participant-home-update-${item.id}`}><span className={`badge ${item.readAt ? 'badge-neutral' : 'badge-warm'}`}>{item.readAt ? t('Read') : t('Unread')}</span><div><h3>{item.title}</h3><p>{item.body}</p><small>{item.programName || t('Program update')} · {participantDateText(item.scheduledFor)}</small></div></article>)}</div> : <div className="participant-empty-line"><MessageSquareText size={17} /><p>{t('No announcements just yet.')}</p></div>}
          </section>
        </>}
  </div>;
}

function ParticipantCohortCard({ enrollment }: { enrollment: ParticipantEnrollment }) {
  return <article className="participant-section participant-cohort-card" data-testid={`card-participant-application-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Your cohort')}</h2><p>{enrollment.enrollmentSource === 'admin_invitation' ? t('Participant access assigned') : t('Application received')} {participantDateText(enrollment.submittedAt)}</p></div><span className={`badge ${participantStatusClass(enrollment.applicationStatus)}`} data-testid={`status-application-${enrollment.applicationId}`}><span />{participantStatusWords[enrollment.applicationStatus] || participantWord(enrollment.applicationStatus)}</span></div>
    <div className="participant-program"><div><div className="eyebrow">{participantWord(enrollment.program.format)} {t('COHORT')}</div><h3>{enrollment.program.name}</h3><p>{enrollment.program.description || t('Your founder journey starts here.')}</p>{enrollment.business && <div className="participant-stage"><span>{t('Current venture stage')}</span><b>{participantWord(enrollment.business.stage)}</b></div>}</div><div className="program-window"><span>{t('PROGRAM WINDOW')}</span><b>{participantDateText(enrollment.program.startDate)} — {participantDateText(enrollment.program.endDate)}</b></div></div>
  </article>;
}
