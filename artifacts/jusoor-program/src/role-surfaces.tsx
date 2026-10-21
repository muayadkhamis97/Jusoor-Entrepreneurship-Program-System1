import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClerk } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import {
  getGetTrainerDashboardQueryKey, getGetMentorDashboardQueryKey, getGetJudgeDashboardQueryKey,
  getGetTrainerAttendanceReportsQueryKey, useGetTrainerAttendanceReports,
  useGetTrainerDashboard, useCreateTrainingAssignment, useReviewTrainingAnswer,
  useReplyTrainingQuestion, useGetMentorDashboard,
  useGetJudgeDashboard, useSubmitJudgeScorecard, useStartCalendlyConnection,
  useStartGoogleCalendarConnection, useUpdateMentorBookingSettings, useDisconnectGoogleCalendar,
  getGetProgramBrandingQueryKey, getGetStaffMentorMeetingReportsQueryKey,
  getGetStaffMentorMeetingReportCoachesQueryKey, useGetStaffMentorMeetingReportCoaches,
  getGetStaffMentorAdditionalSessionRequestsQueryKey,
  useGetStaffMentorAdditionalSessionRequests, useResolveStaffMentorAdditionalSessionRequest,
  useRetryStaffMentorAdditionalSessionRequestEmail, useCreateMentorAdditionalSessionRequest,
  useWithdrawMentorAdditionalSessionRequest,
  getListBusinessesQueryKey, getListProgramsQueryKey, useGetProgramBranding,
  useGetStaffMentorMeetingReports, useListBusinesses, useListPrograms,
} from '@workspace/api-client-react';
import type {
  TrainingAssignmentInput, TrainingAnswerReview, TrainingQuestionReply,
  JudgeScorecardInput, StaffMember,
  MentorBookingSettingsInput,
} from '@workspace/api-client-react';
import { ArrowRight, BookOpen, CalendarDays, ChevronDown, CircleAlert, ClipboardList, Clock3, Download, LayoutGrid, LogOut, MessageCircle, Printer, UserRound, Video } from 'lucide-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { SessionRecordingPlayer } from './session-recording-player';
import './attendance-reports.css';
import './mentor-session-progress.css';
import { getDisplayBrandName, LanguageToggle, currentLanguage, t, useAppLanguage } from './language';
import { trainerProgramOptions, trainerSessionOptions } from './trainer-program-options';
import { mentorBookingSaveError } from './mentor-booking-errors';
import { useMentorBookingDraft } from './use-mentor-booking-draft';
import { MentorEngagementCard, type MentorEngagementDraft } from './mentor-engagement-card';
import { buildTrainerAttendanceSheetRows, downloadTrainerAttendanceCsv } from './trainer-attendance-export';
import { printReportSheet } from './print-report-sheet';
import { getTrainerAttendanceEmptyState, updateTrainerIdSet } from './trainer-dashboard-state';
import {
  getStaffMentorMeetingReportFilterParams,
  selectStaffMentorMeetingReportBusiness,
  selectStaffMentorMeetingReportProgram,
  type StaffMentorMeetingReportSelection,
} from './staff-mentor-meeting-report-filters';
import { downloadStaffMentorMeetingReportsCsv } from './mentor-meeting-reports-export';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const word = (value?: string | null) => value ? t(value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())) : '—';
const dateText = (date?: string | null) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('Not scheduled');
const dateTimeText = (date?: string | null) => date ? new Date(date).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function RoleFrame({ role, name, children, availableRoles = [], primaryRole, beforeLeave }: { role: string; name: string; children: ReactNode; availableRoles?: string[]; primaryRole?: string; beforeLeave?: () => boolean }) {
  useAppLanguage();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const branding = brandingQuery.data;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'J';
  const otherRoles = availableRoles.filter(availableRole => availableRole !== role);
  return <div className="role-workspace">
    <header className="role-topbar">
      <Link href={`/${role}`} className="brand" data-testid="link-role-brand">{branding?.logoUrl ? <img className="brand-logo" src={branding.logoUrl} alt="" /> : <span className="brand-mark">{getDisplayBrandName(branding?.brandName).slice(0, 1)}</span>}<span><b>{getDisplayBrandName(branding?.brandName)}</b><small>{t('PROGRAM HUB')}</small></span></Link>
       <div className="role-top-actions">
         <DropdownMenu>
           <DropdownMenuTrigger asChild>
             <button type="button" className="button button-quiet role-navigation-trigger" aria-label={t('Open all pages menu')} data-testid="button-role-navigation-menu">
               <LayoutGrid size={15} aria-hidden="true" /><span>{t('All pages')}</span><ChevronDown size={14} aria-hidden="true" />
             </button>
           </DropdownMenuTrigger>
           <DropdownMenuContent align="end" side="bottom" className="role-navigation-menu" aria-label={t('All pages')}>
             <DropdownMenuLabel>{t('All pages')}</DropdownMenuLabel>
             {role === 'trainer' && <>
               <DropdownMenuItem asChild><Link href={location === '/trainer/sessions' ? '/trainer' : '/trainer/sessions'} data-testid="link-trainer-sessions"><CalendarDays size={16} aria-hidden="true" /><span>{t(location === '/trainer/sessions' ? 'Training workspace' : 'Live sessions')}</span></Link></DropdownMenuItem>
               <DropdownMenuItem asChild><Link href={location === '/trainer/courses' ? '/trainer' : '/trainer/courses'} data-testid="link-trainer-learning"><BookOpen size={16} aria-hidden="true" /><span>{t(location === '/trainer/courses' ? 'Training workspace' : 'Course learning')}</span></Link></DropdownMenuItem>
             </>}
             {otherRoles.map(availableRole => <DropdownMenuItem asChild key={availableRole}><Link href={`/${availableRole}`} data-testid={`link-role-${availableRole}`}><LayoutGrid size={16} aria-hidden="true" /><span>{t(`Open ${availableRole} workspace`)}</span></Link></DropdownMenuItem>)}
             {(primaryRole === 'coordinator' || primaryRole === 'staff') && <DropdownMenuItem asChild><Link href="/" data-testid="link-program-operations"><LayoutGrid size={16} aria-hidden="true" /><span>{t(primaryRole === 'coordinator' ? 'Admin workspace' : 'Program staff workspace')}</span></Link></DropdownMenuItem>}
             <DropdownMenuSeparator />
             <DropdownMenuItem asChild><Link href="/profile" aria-current={location === '/profile' ? 'page' : undefined} data-testid="link-role-profile"><UserRound size={16} aria-hidden="true" /><span>{t('Profile')}</span></Link></DropdownMenuItem>
           </DropdownMenuContent>
         </DropdownMenu>
         <span className="role-chip">{t(role)}</span><span className="role-user">{initials} <b>{name}</b></span><LanguageToggle /><button className="button button-quiet" onClick={() => { if (!beforeLeave || beforeLeave()) void signOut({ redirectUrl: basePath || '/' }); }} data-testid="button-role-signout"><LogOut size={15} /> {t('Sign out')}</button>
       </div>
    </header>
    <main className="role-main page-enter">
      {role === 'mentor' && <nav className="role-button-row" aria-label={t('Mentor navigation')}>
        <Link href="/mentor" className="button button-quiet" aria-current={location === '/mentor' ? 'page' : undefined}>{t('Mentor workspace')}</Link>
        <Link href="/mentor/settings" className="button button-quiet" aria-current={location === '/mentor/settings' ? 'page' : undefined} data-testid="link-mentor-settings">{t('Settings')}</Link>
      </nav>}
      {children}
    </main>
    <footer className="footer role-footer footer-brandless"><span>{t('ONE JOURNEY, IN VIEW')}</span></footer>
  </div>;
}

function Heading({ kicker, title, description, count }: { kicker: string; title: string; description: string; count?: string }) {
  return <header className="role-heading"><div><div className="eyebrow">{t(kicker)}</div><h1 className="app-title">{t(title)}</h1><p>{t(description)}</p></div>{count && <span className="role-count">{t(count.replace(/^\d+\s*/, '')) ? `${count.match(/^\d+/)?.[0] || ''} ${t(count.replace(/^\d+\s*/, ''))}` : count}</span>}</header>;
}
function LoadOrError({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  if (loading) return <div className="loading-panel"><div className="skeleton skeleton-wide" /><div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton skeleton-table" /></div>;
  if (error) return <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={20} /></span><h3>{t('This view couldn’t load.')}</h3><p>{t('Your work is safe. Reconnect to the program workspace and try again.')}</p><button className="button button-outline" onClick={retry} data-testid="button-role-retry">{t('Retry connection')}</button></div>;
  return null;
}
const invalid = (client: ReturnType<typeof useQueryClient>, key: readonly unknown[]) => void client.invalidateQueries({ queryKey: key });
const withId = (current: Set<number>, id: number, included: boolean) => {
  const next = new Set(current);
  if (included) next.add(id);
  else next.delete(id);
  return next;
};

export function StaffMentorMeetingReportsPage() {
  useAppLanguage();
  const client = useQueryClient();
  const resolveAdditionalSessionRequest = useResolveStaffMentorAdditionalSessionRequest();
  const retryAdditionalSessionRequestEmail = useRetryStaffMentorAdditionalSessionRequestEmail();
  const [approvedSessionCounts, setApprovedSessionCounts] = useState<Record<number, string>>({});
  const [resolvingAdditionalSessionRequestIds, setResolvingAdditionalSessionRequestIds] = useState<Set<number>>(() => new Set());
  const [additionalSessionRequestResolveErrorIds, setAdditionalSessionRequestResolveErrorIds] = useState<Set<number>>(() => new Set());
  const [retryingAdditionalSessionRequestIds, setRetryingAdditionalSessionRequestIds] = useState<Set<number>>(() => new Set());
  const [additionalSessionEmailRetryErrorIds, setAdditionalSessionEmailRetryErrorIds] = useState<Set<number>>(() => new Set());
  const [selection, setSelection] = useState<StaffMentorMeetingReportSelection>({
    programId: '',
    businessId: '',
    coachEmail: '',
  });
  const { programId: selectedProgramId, businessId: selectedBusinessId, coachEmail: selectedCoachEmail } = selection;
  const [meetingDateFrom, setMeetingDateFrom] = useState('');
  const [meetingDateTo, setMeetingDateTo] = useState('');
  const programsQuery = useListPrograms(undefined, {
    query: { queryKey: getListProgramsQueryKey(), refetchOnWindowFocus: true },
  });
  const programs = programsQuery.data ?? [];
  useEffect(() => {
    if (selectedProgramId === '' && programs.length > 0) {
      setSelection(current => current.programId === ''
        ? selectStaffMentorMeetingReportProgram(programs[0].id)
        : current);
    }
  }, [programs, selectedProgramId]);

  const businessParams = selectedProgramId === '' ? undefined : { programId: selectedProgramId };
  const businessesQuery = useListBusinesses(businessParams, {
    query: {
      queryKey: getListBusinessesQueryKey(businessParams),
      enabled: businessParams !== undefined,
    },
  });
  const { coachOptionsParams, reportParams } = getStaffMentorMeetingReportFilterParams(selection, meetingDateFrom, meetingDateTo);
  const selectedProgramName = programs.find(program => program.id === selectedProgramId)?.name ?? '';
  const selectedBusinessName = (businessesQuery.data ?? []).find(business => business.id === selectedBusinessId)?.businessName;
  const coachOptionsQuery = useGetStaffMentorMeetingReportCoaches(coachOptionsParams, {
    query: {
      queryKey: getGetStaffMentorMeetingReportCoachesQueryKey(coachOptionsParams),
      enabled: selectedProgramId !== '',
      refetchOnWindowFocus: true,
    },
  });
  const selectedCoachName = (coachOptionsQuery.data ?? []).find(coach => coach.coachEmail === selectedCoachEmail)?.coachName;
  const reportsQuery = useGetStaffMentorMeetingReports(reportParams, {
    query: {
      queryKey: getGetStaffMentorMeetingReportsQueryKey(reportParams),
      enabled: selectedProgramId !== '',
      refetchOnWindowFocus: true,
    },
  });
  const additionalSessionRequestParams = { programId: selectedProgramId || programs[0]?.id || 1 };
  const additionalSessionRequestsQuery = useGetStaffMentorAdditionalSessionRequests(additionalSessionRequestParams, {
    query: {
      queryKey: getGetStaffMentorAdditionalSessionRequestsQueryKey(additionalSessionRequestParams),
      enabled: selectedProgramId !== '',
      refetchOnWindowFocus: true,
    },
  });
  const retry = () => {
    void programsQuery.refetch();
    void businessesQuery.refetch();
    void coachOptionsQuery.refetch();
    void reportsQuery.refetch();
    void additionalSessionRequestsQuery.refetch();
  };
  const printCoachReports = () => printReportSheet('print-coach-meeting-reports');

  return <>
    <Heading
      kicker="MENTORING / REPORTS"
      title="Mentor meeting reports"
      description="Review submitted session notes, agreed actions, achievements and recommendations by program, business, mentor and meeting date."
      count={reportsQuery.data ? `${reportsQuery.data.length} reports` : undefined}
    />
    <section className="role-section role-assignment-section" data-testid="staff-mentor-meeting-report-filters">
      <div className="role-section-title"><div><div className="eyebrow">{t('FIND REPORTS')}</div><h2>{t('Choose a program, business, mentor and date range')}</h2></div></div>
      {programsQuery.isLoading ? <p role="status">{t('Loading programs…')}</p> : programsQuery.isError ? <div className="role-inline-note" role="alert">
        <p>{t('Programs could not load.')}</p>
        <Button type="button" className="button button-quiet" onClick={() => void programsQuery.refetch()}>{t('Retry')}</Button>
      </div> : programs.length === 0 ? <p className="role-inline-note">{t('No active programs are assigned to this account.')}</p> : <div className="role-form-grid">
        <label className="field">{t('Program')}
          <select className="form-control" value={selectedProgramId} onChange={event => {
            const programId = event.currentTarget.value ? Number(event.currentTarget.value) : '';
            setSelection(() => selectStaffMentorMeetingReportProgram(programId));
          }} data-testid="select-staff-report-program">
            {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label className="field">{t('Business')}
          <select className="form-control" value={selectedBusinessId} onChange={event => {
            const businessId = event.currentTarget.value ? Number(event.currentTarget.value) : '';
            setSelection(current => selectStaffMentorMeetingReportBusiness(current, businessId));
          }}
            disabled={selectedProgramId === '' || businessesQuery.isLoading || businessesQuery.isError}
            data-testid="select-staff-report-business">
            <option value="">{t('All businesses')}</option>
            {(businessesQuery.data ?? []).map(business => <option key={business.id} value={business.id}>{business.businessName}</option>)}
          </select>
          {businessesQuery.isError && <span role="alert">{t('Business choices could not load.')}{' '}
            <Button type="button" className="button button-quiet" onClick={() => void businessesQuery.refetch()}>{t('Retry')}</Button>
          </span>}
        </label>
        <label className="field">{t('Mentor')}
          <select className="form-control" value={selectedCoachEmail} onChange={event => setSelection(current => ({ ...current, coachEmail: event.currentTarget.value }))}
            disabled={selectedProgramId === '' || coachOptionsQuery.isLoading || coachOptionsQuery.isError}
            data-testid="select-staff-report-coach">
            <option value="">{t('All mentors')}</option>
            {(coachOptionsQuery.data ?? []).map(coach => <option key={coach.coachEmail} value={coach.coachEmail}>{coach.coachName}</option>)}
          </select>
          {coachOptionsQuery.isLoading && <span role="status">{t('Loading mentor choices…')}</span>}
          {coachOptionsQuery.isError && <span role="alert">{t('Mentor choices could not load.')}{' '}
            <Button type="button" className="button button-quiet" onClick={() => void coachOptionsQuery.refetch()}>{t('Retry')}</Button>
          </span>}
        </label>
        <label className="field">{t('Meeting date from')}
          <input className="form-control" type="date" value={meetingDateFrom} max={meetingDateTo || undefined}
            onChange={event => setMeetingDateFrom(event.currentTarget.value)} data-testid="input-staff-report-date-from" />
        </label>
        <label className="field">{t('Meeting date to')}
          <input className="form-control" type="date" value={meetingDateTo} min={meetingDateFrom || undefined}
            onChange={event => setMeetingDateTo(event.currentTarget.value)} data-testid="input-staff-report-date-to" />
        </label>
      </div>}
    </section>
    <section className="role-section" data-testid="staff-additional-session-requests">
      <div className="role-section-title"><div><div className="eyebrow">{t('SESSION CAPACITY')}</div><h2>{t('Requests for additional 1:1 sessions')}</h2></div>
        <span>{additionalSessionRequestsQuery.data?.length ?? 0} {t('open requests')}</span>
      </div>
      {selectedProgramId === '' ? <p className="role-inline-note">{t('Choose a program to review session requests.')}</p>
        : additionalSessionRequestsQuery.isLoading ? <p className="role-inline-note" role="status">{t('Loading session requests…')}</p>
          : additionalSessionRequestsQuery.isError ? <div className="role-inline-note" role="alert"><p>{t('Session requests could not load.')}</p><Button type="button" className="button button-quiet" onClick={() => void additionalSessionRequestsQuery.refetch()}>{t('Retry')}</Button></div>
            : (additionalSessionRequestsQuery.data ?? []).length === 0 ? <div className="empty-panel"><h3>{t('No open requests.')}</h3><p>{t('New requests from assigned mentors will appear here.')}</p></div>
              : <div className="answer-list">{additionalSessionRequestsQuery.data?.map(request => {
                const approvedCount = Number(approvedSessionCounts[request.id] ?? 1);
                const validApprovedCount = Number.isInteger(approvedCount) && approvedCount >= 1 && approvedCount <= 1000;
                const resolveRequest = (decision: 'approved' | 'declined') => {
                  setAdditionalSessionRequestResolveErrorIds(current => withId(current, request.id, false));
                  setResolvingAdditionalSessionRequestIds(current => withId(current, request.id, true));
                  resolveAdditionalSessionRequest.mutate({
                    id: request.id,
                    data: {
                      decision,
                      ...(decision === 'approved' ? { approvedAdditionalSessions: approvedCount } : {}),
                    },
                  }, {
                    onSuccess: () => {
                      setAdditionalSessionRequestResolveErrorIds(current => withId(current, request.id, false));
                      void client.invalidateQueries({ queryKey: getGetStaffMentorAdditionalSessionRequestsQueryKey(additionalSessionRequestParams) });
                      void client.invalidateQueries({ queryKey: getGetMentorDashboardQueryKey() });
                    },
                    onError: () => setAdditionalSessionRequestResolveErrorIds(current => withId(current, request.id, true)),
                    onSettled: () => setResolvingAdditionalSessionRequestIds(current => withId(current, request.id, false)),
                  });
                };
                return <article className="answer-card" key={request.id} data-testid={`additional-session-request-${request.id}`}>
                  <div className="answer-meta"><div><b>{request.businessName}</b><span>{request.mentorName} · {request.mentorEmail} · {request.programName}</span></div><span className="role-date">{dateText(request.createdAt)}</span></div>
                  <p>{t('Reported sessions')}: {request.reportedSessionsAtRequest} / {request.sessionTargetAtRequest}</p>
                  <p className={request.emailNotificationStatus === 'delivered' ? 'form-success' : request.emailNotificationStatus === 'failed' ? 'form-error' : ''} role="status">
                    {request.emailNotificationStatus === 'delivered' ? t('Email notification sent.') : request.emailNotificationStatus === 'pending' ? t('Notification is being sent.') : t('The request is recorded, but its email notification failed.')}
                  </p>
                  {request.canRetryEmail && <div className="role-button-row">
                    <Button type="button" className="button button-quiet" disabled={retryingAdditionalSessionRequestIds.has(request.id)} onClick={() => {
                      setAdditionalSessionEmailRetryErrorIds(current => withId(current, request.id, false));
                      setRetryingAdditionalSessionRequestIds(current => withId(current, request.id, true));
                      retryAdditionalSessionRequestEmail.mutate({ id: request.id }, {
                        onSuccess: () => void client.invalidateQueries({ queryKey: getGetStaffMentorAdditionalSessionRequestsQueryKey(additionalSessionRequestParams) }),
                        onError: () => setAdditionalSessionEmailRetryErrorIds(current => withId(current, request.id, true)),
                        onSettled: () => setRetryingAdditionalSessionRequestIds(current => withId(current, request.id, false)),
                      });
                    }}>{retryingAdditionalSessionRequestIds.has(request.id) ? t('Retrying email…') : t('Retry email notification')}</Button>
                    {additionalSessionEmailRetryErrorIds.has(request.id) && <p className="form-error" role="alert">{t('The email retry could not be completed. Please retry.')}</p>}
                  </div>}
                  <label className="field">{t('Additional sessions to approve')}
                    <input className="form-control" type="number" min={1} max={1000} step={1} value={approvedSessionCounts[request.id] ?? '1'}
                      onChange={event => setApprovedSessionCounts(current => ({ ...current, [request.id]: event.currentTarget.value }))}
                      aria-label={`${t('Additional sessions to approve')} — ${request.businessName}`} />
                  </label>
                  <div className="role-button-row">
                    <Button type="button" className="button button-primary" disabled={resolvingAdditionalSessionRequestIds.has(request.id) || !validApprovedCount} onClick={() => resolveRequest('approved')}>
                      {resolvingAdditionalSessionRequestIds.has(request.id) ? t('Saving…') : t('Approve additional sessions')}
                    </Button>
                    <Button type="button" className="button button-quiet" disabled={resolvingAdditionalSessionRequestIds.has(request.id)} onClick={() => resolveRequest('declined')}>
                      {t('Decline request')}
                    </Button>
                  </div>
                  {additionalSessionRequestResolveErrorIds.has(request.id) && <p className="form-error" role="alert">{t('The request could not be updated. Please retry.')}</p>}
                </article>;
              })}</div>}
    </section>
    {selectedProgramId !== '' && (reportsQuery.isLoading || businessesQuery.isLoading)
      ? <p className="role-inline-note" role="status">{t('Loading mentor meeting reports…')}</p>
      : reportsQuery.isError ? <div className="role-inline-note" role="alert">
        <p>{t('Mentor meeting reports could not load.')}</p>
        <Button type="button" className="button button-quiet" onClick={retry}>{t('Retry')}</Button>
      </div>
      : reportsQuery.data && (reportsQuery.data.length === 0
        ? <div className="empty-panel" data-testid="staff-meeting-reports-empty"><h3>{t('No meeting reports found.')}</h3><p>{t('Try changing the mentor, business or meeting-date range.')}</p></div>
        : <section className="role-section" aria-label={t('Submitted mentor meeting reports')} data-testid="staff-mentor-meeting-reports">
           <div className="role-section-title meeting-report-sheet-heading">
             <div><div className="eyebrow">{t('SUBMITTED REPORTS')}</div><h2>{t('Session history')}</h2><p>{t('One row per report. Scroll horizontally to see every field.')}</p></div>
             <div className="meeting-report-export-actions">
               <span className="role-count">{reportsQuery.data.length}</span>
               <Button type="button" className="button button-quiet" onClick={() => { if (selectedProgramId !== '') downloadStaffMentorMeetingReportsCsv(selectedProgramId, reportsQuery.data); }} data-testid="button-export-coach-reports-csv"><Download size={14} />{t('Export spreadsheet (CSV)')}</Button>
               <Button type="button" className="button button-quiet" onClick={printCoachReports} data-testid="button-export-coach-reports-pdf"><Printer size={14} />{t('Print / Save PDF')}</Button>
             </div>
           </div>
           <div className="meeting-report-sheet-scroll" role="region" aria-label={t('Meeting report spreadsheet')} tabIndex={0} data-testid="meeting-report-sheet">
             <table className="meeting-report-sheet">
               <thead><tr>
                 <th scope="col">{t('Meeting date')}</th><th scope="col">{t('Program')}</th><th scope="col">{t('Business')}</th>
                  <th scope="col">{t('Mentor name')}</th><th scope="col">{t('Mentor email')}</th>
                 <th scope="col">{t('Team members who attended the session')}</th><th scope="col">{t('Meeting occurrence')}</th>
                 <th scope="col">{t('Topics, session highlights, connections made, and other notes')}</th>
                 <th scope="col">{t('SMART Grow actions recommended and agreed with the team until the next call')}</th>
                  <th scope="col">{t('Key achievements and opportunities resulting from your mentoring')}</th>
                 <th scope="col">{t('Recommendations to the program team for further support')}</th>
                 <th scope="col">{t('Submitted')}</th>
               </tr></thead>
               <tbody>{reportsQuery.data.map(report => <tr key={report.id} data-testid={`staff-meeting-report-${report.id}`}>
                 <td>{dateText(report.meetingDate)}</td><td>{report.programName}</td><td>{report.businessName}</td>
                 <td>{report.coachName}</td><td>{report.coachEmail}</td>
                 <td>{report.attendees.length ? report.attendees.join(', ') : t('No attendees recorded')}</td>
                 <td>{report.meetingProvider === 'manual' ? t('Manual meeting') : report.meetingProvider === 'calendly' ? t('Calendly') : t('Google Calendar')}</td>
                 <td>{report.sessionSummary}</td><td>{report.smartGrowActions}</td><td>{report.achievementsAndOpportunities}</td>
                 <td>{report.teamRecommendations || '—'}</td><td>{dateText(report.submittedAt)}</td>
               </tr>)}</tbody>
             </table>
           </div>
           <section className="meeting-report-print-sheet" aria-hidden="true">
             <header>
               <p className="eyebrow">{t('SUBMITTED REPORTS')}</p>
                <h1>{t('Mentor meeting reports')}</h1>
                <p>{t('Program')}: {selectedProgramName || '—'} · {t('Business')}: {selectedBusinessName ?? t('All businesses')} · {t('Mentor')}: {selectedCoachName ?? t('All mentors')}</p>
               <p>{t('Meeting date from')}: {meetingDateFrom || '—'} · {t('Meeting date to')}: {meetingDateTo || '—'} · {reportsQuery.data.length} {t('reports')}</p>
             </header>
             {reportsQuery.data.map(report => <article className="meeting-report-print-record" key={report.id}>
               <h2>{dateText(report.meetingDate)} · {report.businessName}</h2>
                <p>{report.programName} · {report.coachName} · {report.coachEmail}</p>
               <dl>
                 <div><dt>{t('Team members who attended the session')}</dt><dd dir="auto">{report.attendees.join(', ') || t('No attendees recorded')}</dd></div>
                 <div><dt>{t('Meeting occurrence')}</dt><dd>{report.meetingProvider === 'manual' ? t('Manual meeting') : report.meetingProvider === 'calendly' ? t('Calendly') : t('Google Calendar')}</dd></div>
                 <div><dt>{t('Topics, session highlights, connections made, and other notes')}</dt><dd dir="auto">{report.sessionSummary}</dd></div>
                 <div><dt>{t('SMART Grow actions recommended and agreed with the team until the next call')}</dt><dd dir="auto">{report.smartGrowActions}</dd></div>
                  <div><dt>{t('Key achievements and opportunities resulting from your mentoring')}</dt><dd dir="auto">{report.achievementsAndOpportunities}</dd></div>
                 <div><dt>{t('Recommendations to the program team for further support')}</dt><dd dir="auto">{report.teamRecommendations || '—'}</dd></div>
               </dl>
               <footer>{t('Submitted')} {dateText(report.submittedAt)}</footer>
             </article>)}
           </section>
        </section>)}
  </>;
}

export function TrainerDashboardPage({ name, availableRoles, primaryRole }: { name: string; availableRoles?: string[]; primaryRole?: string }) {
  useAppLanguage();
  const query = useGetTrainerDashboard({ query: { queryKey: getGetTrainerDashboardQueryKey(), refetchOnWindowFocus: true } });
  const attendanceQuery = useGetTrainerAttendanceReports({
    query: { queryKey: getGetTrainerAttendanceReportsQueryKey(), refetchOnWindowFocus: true, refetchInterval: 15_000 },
  });
  const client = useQueryClient();
  const create = useCreateTrainingAssignment();
  const review = useReviewTrainingAnswer();
  const reply = useReplyTrainingQuestion();
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentPublished, setAssignmentPublished] = useState(false);
  const [assignmentProgramId, setAssignmentProgramId] = useState<number | ''>('');
  const [assignmentSessionId, setAssignmentSessionId] = useState<number | ''>('');
  const [feedbacks, setFeedbacks] = useState<Record<number, { score: string; feedback: string }>>({});
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [reviewPendingIds, setReviewPendingIds] = useState<Set<number>>(() => new Set());
  const [reviewErrorIds, setReviewErrorIds] = useState<Set<number>>(() => new Set());
  const [replyPendingIds, setReplyPendingIds] = useState<Set<number>>(() => new Set());
  const [replyErrorIds, setReplyErrorIds] = useState<Set<number>>(() => new Set());
  const dashboard = query.data;
  const sessions = dashboard?.sessions || [];
  const attendanceEmptyState = getTrainerAttendanceEmptyState(sessions.length, attendanceQuery.data?.length || 0);
  const programs = trainerProgramOptions(dashboard?.programs || [], t('Program name unavailable'));
  const assignmentSessions = trainerSessionOptions(sessions, assignmentProgramId === '' ? null : assignmentProgramId);
  const attendanceRows = attendanceQuery.data ? buildTrainerAttendanceSheetRows(attendanceQuery.data) : [];
  const attendanceStatusText = (status: string) => status === 'present' ? t('Present')
    : status === 'absent' ? t('Absent')
      : status === 'excused' ? t('Excused')
        : status === 'Needs review' ? t('Needs review')
          : status === 'Not recorded' ? t('Not recorded') : '—';
  const attendanceStatusTone = (status: string) => status === 'present' ? 'good'
    : status === 'absent' || status === 'Needs review' ? 'warm' : 'neutral';
  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAssignmentPublished(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const programId = Number(form.get('programId'));
    const title = String(form.get('title') || '').trim();
    const instructions = String(form.get('instructions') || '').trim();
    if (!programId || title.length < 2 || instructions.length < 10) { setAssignmentError('Choose a cohort and add a title and clear instructions.'); return; }
    const data: TrainingAssignmentInput = { programId, title, instructions, dueDate: String(form.get('dueDate') || '') || null, sessionId: form.get('sessionId') ? Number(form.get('sessionId')) : null };
    create.mutate({ data }, { onSuccess: () => { invalid(client, getGetTrainerDashboardQueryKey()); formElement.reset(); setAssignmentProgramId(''); setAssignmentSessionId(''); setAssignmentError(''); setAssignmentPublished(true); } });
  };
  const saveReview = async (event: FormEvent<HTMLFormElement>, id: number) => {
    event.preventDefault();
    const values = feedbacks[id] || { score: '', feedback: '' };
    const score = values.score === '' ? null : Number(values.score);
    if (score !== null && (score < 0 || score > 100)) return;
    const data: TrainingAnswerReview = { score, feedback: values.feedback.trim() || null };
    setReviewPendingIds(current => updateTrainerIdSet(current, id, true));
    setReviewErrorIds(current => updateTrainerIdSet(current, id, false));
    try {
      await review.mutateAsync({ id, data });
      invalid(client, getGetTrainerDashboardQueryKey());
    } catch {
      setReviewErrorIds(current => updateTrainerIdSet(current, id, true));
    } finally {
      setReviewPendingIds(current => updateTrainerIdSet(current, id, false));
    }
  };
  const sendReply = async (event: FormEvent<HTMLFormElement>, id: number) => {
    event.preventDefault();
    const answer = (replies[id] || '').trim();
    if (!answer) return;
    const data: TrainingQuestionReply = { reply: answer };
    setReplyPendingIds(current => updateTrainerIdSet(current, id, true));
    setReplyErrorIds(current => updateTrainerIdSet(current, id, false));
    try {
      await reply.mutateAsync({ id, data });
      invalid(client, getGetTrainerDashboardQueryKey());
      setReplies(current => ({ ...current, [id]: '' }));
    } catch {
      setReplyErrorIds(current => updateTrainerIdSet(current, id, true));
    } finally {
      setReplyPendingIds(current => updateTrainerIdSet(current, id, false));
    }
  };
  const printAttendanceReports = () => printReportSheet('print-trainer-attendance-reports');
  return <RoleFrame role="trainer" name={name} availableRoles={availableRoles} primaryRole={primaryRole}>
    <Heading kicker="COHORT DELIVERY / TRAINER DESK" title="The work, in motion." description="Your sessions, participant answers and open questions — together." count={`${sessions.length} assigned sessions`} />
    <LoadOrError loading={query.isLoading} error={query.isError || !dashboard} retry={() => void query.refetch()} />
    {dashboard && <>
      <section className="role-feature-grid">
        <article className="role-feature"><div className="eyebrow">{t('UP NEXT')}</div><h2>{sessions[0]?.title || t('No sessions assigned yet')}</h2><p>{sessions[0] ? `${dateText(sessions[0].scheduledDate)} · ${sessions[0].startTime || t('Time to be confirmed')} · ${word(sessions[0].deliveryMode)}` : t('An admin can attach you to a session from Program Operations.')}</p>{sessions[0]?.zoomUrl && <a className="button button-primary" href={sessions[0].zoomUrl} target="_blank" rel="noreferrer"><Video size={15} /> {t('Join session')}</a>}</article>
        <article className="role-note"><ClipboardList size={18} /><div><b>{dashboard.submissions.length} {t('participant responses')}</b><span>{t('Read every answer. Leave a score and useful next-step feedback.')}</span></div></article>
      </section>
      <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('TEACHING CALENDAR')}</div><h2>{t('Assigned sessions')}</h2></div></div>
         {sessions.length === 0 ? <div className="empty-panel"><h3>{t('No sessions assigned.')}</h3><p>{t('Your admin will attach you to a cohort session.')}</p></div> : <div className="role-list">{sessions.map(session => <article className="role-row" key={session.id} data-testid={`trainer-session-${session.id}`}><span className="role-date"><CalendarDays size={17} /></span><div className="role-row-copy"><b>{session.title}</b><span>{dateText(session.scheduledDate)} · {word(session.type)} · {session.startTime || t('Time TBD')}</span>{session.recordingUrl && <SessionRecordingPlayer url={session.recordingUrl} title={session.title} />}</div><span className={`badge badge-${session.status === 'scheduled' ? 'good' : 'neutral'}`}><span />{word(session.status)}</span>{session.zoomUrl && <a href={session.zoomUrl} target="_blank" rel="noreferrer" className="text-link">{t('Join')} <ArrowRight size={13} /></a>}</article>)}</div>}
      </section>
      <section className="role-section" data-testid="trainer-attendance-reports">
          <div className="role-section-title attendance-sheet-heading">
            <div><div className="eyebrow">{t('SESSION REPORTS')}</div><h2>{t('Training attendance')}</h2></div>
            {attendanceQuery.data?.length ? <div className="attendance-sheet-actions">
              <span className="role-count">{attendanceQuery.data.length} {t('sessions')}</span>
              <Button type="button" className="button button-quiet" onClick={() => { if (attendanceQuery.data) downloadTrainerAttendanceCsv(attendanceQuery.data); }} data-testid="button-export-attendance-csv"><Download size={14} />{t('Export spreadsheet (CSV)')}</Button>
              <Button type="button" className="button button-quiet" onClick={printAttendanceReports} data-testid="button-export-attendance-pdf"><Printer size={14} />{t('Print / Save PDF')}</Button>
            </div> : null}
          </div>
         <p>{t('Zoom attendance is limited to sessions assigned to you. Unmatched attendees are flagged for admin review.')}</p>
        {attendanceQuery.isLoading ? <div className="role-inline-note">{t('Loading attendance reports…')}</div> : attendanceQuery.isError ? <div className="role-inline-note" role="alert">{t('Attendance reports could not be loaded. Refresh the page to try again.')}</div> : attendanceQuery.data?.length ? <div className="role-list">
           <div className="attendance-sheet-scroll" role="region" aria-label={t('Attendance report spreadsheet')} tabIndex={0} data-testid="trainer-attendance-sheet">
             <table className="attendance-sheet">
               <thead><tr>
                 <th scope="col">{t('Session ID')}</th><th scope="col">{t('Session')}</th><th scope="col">{t('Scheduled date')}</th><th scope="col">{t('Record type')}</th>
                 <th scope="col">{t('Business')}</th><th scope="col">{t('Participant')}</th><th scope="col">{t('Unmatched attendee email')}</th>
                 <th scope="col">{t('Attendance status')}</th><th scope="col">{t('Attendance source')}</th><th scope="col">{t('Minutes attended')}</th>
                 <th scope="col">{t('First joined at')}</th><th scope="col">{t('Last left at')}</th><th scope="col">{t('Attendance notes')}</th>
                 <th scope="col">{t('Zoom sync status')}</th><th scope="col">{t('Zoom participants')}</th><th scope="col">{t('Matched Zoom participants')}</th>
                 <th scope="col">{t('Unmatched Zoom participants')}</th><th scope="col">{t('Sync attempts')}</th><th scope="col">{t('Last Zoom sync attempt')}</th><th scope="col">{t('Zoom synced at')}</th>
               </tr></thead>
                <tbody>{attendanceRows.map((row, index) => {
                  return <tr key={`${row.sessionId}-${row.recordType}-${index}`} data-testid={`trainer-attendance-row-${row.sessionId}-${index}`}>
                   <td>{row.sessionId}</td><td>{row.sessionTitle}</td><td>{dateText(row.scheduledDate)}</td><td>{t(row.recordType)}</td>
                   <td>{row.businessName || '—'}</td><td>{row.participantName || '—'}</td><td dir="auto">{row.unmatchedEmail || '—'}</td>
                    <td>{attendanceStatusText(row.status)}</td><td>{row.source === 'zoom' ? t('Zoom') : row.source === 'manual' ? t('Manual') : '—'}</td>
                   <td>{row.minutesAttended === '' ? '—' : row.minutesAttended}</td><td>{dateTimeText(row.firstJoinedAt)}</td><td>{dateTimeText(row.lastLeftAt)}</td>
                   <td dir="auto">{row.notes || '—'}</td><td>{row.zoomSyncStatus ? word(row.zoomSyncStatus) : t('Waiting')}</td>
                   <td>{row.zoomParticipantCount === '' ? '—' : row.zoomParticipantCount}</td><td>{row.zoomMatchedCount === '' ? '—' : row.zoomMatchedCount}</td>
                   <td>{row.zoomUnmatchedCount === '' ? '—' : row.zoomUnmatchedCount}</td><td>{row.zoomSyncAttempts === '' ? '—' : row.zoomSyncAttempts}</td><td>{dateTimeText(row.zoomLastAttemptAt)}</td><td>{dateTimeText(row.zoomSyncedAt)}</td>
                 </tr>;
               })}</tbody>
             </table>
           </div>
            <div className="attendance-mobile-cards" data-testid="trainer-attendance-mobile-cards">
              {attendanceRows.map((row, index) => <details className="attendance-mobile-card" key={`mobile-${row.sessionId}-${row.recordType}-${index}`} data-testid={`trainer-attendance-mobile-row-${row.sessionId}-${index}`}>
                <summary>
                  <span className="attendance-mobile-primary">
                    <b>{row.sessionTitle}</b>
                    <span>{dateText(row.scheduledDate)} · {t(row.recordType)}</span>
                    <span>{row.businessName || '—'}{row.participantName ? ` · ${row.participantName}` : ''}</span>
                  </span>
                  <span className={`badge badge-${attendanceStatusTone(row.status)}`}><span />{attendanceStatusText(row.status)}</span>
                </summary>
                <dl className="attendance-mobile-details">
                  <div><dt>{t('Session ID')}</dt><dd>{row.sessionId}</dd></div>
                  <div><dt>{t('Unmatched attendee email')}</dt><dd dir="auto">{row.unmatchedEmail || '—'}</dd></div>
                  <div><dt>{t('Attendance source')}</dt><dd>{row.source === 'zoom' ? t('Zoom') : row.source === 'manual' ? t('Manual') : '—'}</dd></div>
                  <div><dt>{t('Minutes attended')}</dt><dd>{row.minutesAttended === '' ? '—' : row.minutesAttended}</dd></div>
                  <div><dt>{t('First joined at')}</dt><dd>{dateTimeText(row.firstJoinedAt)}</dd></div>
                  <div><dt>{t('Last left at')}</dt><dd>{dateTimeText(row.lastLeftAt)}</dd></div>
                  <div><dt>{t('Attendance notes')}</dt><dd dir="auto">{row.notes || '—'}</dd></div>
                  <div><dt>{t('Zoom sync status')}</dt><dd>{row.zoomSyncStatus ? word(row.zoomSyncStatus) : t('Waiting')}</dd></div>
                  <div><dt>{t('Zoom participants')}</dt><dd>{row.zoomParticipantCount === '' ? '—' : row.zoomParticipantCount}</dd></div>
                  <div><dt>{t('Matched Zoom participants')}</dt><dd>{row.zoomMatchedCount === '' ? '—' : row.zoomMatchedCount}</dd></div>
                  <div><dt>{t('Unmatched Zoom participants')}</dt><dd>{row.zoomUnmatchedCount === '' ? '—' : row.zoomUnmatchedCount}</dd></div>
                  <div><dt>{t('Sync attempts')}</dt><dd>{row.zoomSyncAttempts === '' ? '—' : row.zoomSyncAttempts}</dd></div>
                  <div><dt>{t('Last Zoom sync attempt')}</dt><dd>{dateTimeText(row.zoomLastAttemptAt)}</dd></div>
                  <div><dt>{t('Zoom synced at')}</dt><dd>{dateTimeText(row.zoomSyncedAt)}</dd></div>
                </dl>
              </details>)}
            </div>
           <section className="trainer-attendance-print-sheet" aria-hidden="true">
             <header>
               <p className="eyebrow">{t('SESSION REPORTS')}</p><h1>{t('Training attendance')}</h1>
               <p>{attendanceQuery.data.length} {t('sessions')} · {buildTrainerAttendanceSheetRows(attendanceQuery.data).length} {t('attendance rows')}</p>
             </header>
             {attendanceQuery.data.map(report => <article className="trainer-attendance-print-session" key={report.sessionId}>
               <h2>{report.sessionTitle} · {dateText(report.scheduledDate)}</h2>
               <p>{t('Session ID')}: {report.sessionId} · {t('Zoom sync')}: {report.zoomSync ? word(report.zoomSync.status) : t('Waiting')} · {report.zoomSync?.participantCount ?? 0} {t('Zoom participants')} · {report.zoomSync?.matchedCount ?? 0} {t('matched')} · {report.zoomSync?.unmatchedCount ?? report.unmatchedParticipants.length} {t('to review')} · {t('Sync attempts')}: {report.zoomSync?.attempts ?? 0} · {t('Last Zoom sync attempt')}: {dateTimeText(report.zoomSync?.lastAttemptAt)} · {t('Zoom synced at')}: {dateTimeText(report.zoomSync?.syncedAt)}</p>
               <table>
                 <thead><tr><th>{t('Record type')}</th><th>{t('Business')}</th><th>{t('Participant')}</th><th>{t('Unmatched attendee email')}</th><th>{t('Attendance status')}</th><th>{t('Minutes attended')}</th><th>{t('Attendance source')}</th><th>{t('First joined at')}</th><th>{t('Last left at')}</th><th>{t('Attendance notes')}</th></tr></thead>
                 <tbody>{buildTrainerAttendanceSheetRows([report]).map((row, index) => <tr key={`${row.recordType}-${index}`}>
                    <td>{t(row.recordType)}</td><td>{row.businessName || '—'}</td><td>{row.participantName || '—'}</td><td dir="auto">{row.unmatchedEmail || '—'}</td>
                    <td>{attendanceStatusText(row.status)}</td>
                   <td>{row.minutesAttended === '' ? '—' : row.minutesAttended}</td><td>{row.source === 'zoom' ? t('Zoom') : row.source === 'manual' ? t('Manual') : '—'}</td>
                   <td>{dateTimeText(row.firstJoinedAt)}</td><td>{dateTimeText(row.lastLeftAt)}</td><td dir="auto">{row.notes || '—'}</td>
                 </tr>)}</tbody>
               </table>
             </article>)}
           </section>
         </div> : attendanceEmptyState === 'no-assigned-sessions' ? <div className="empty-panel" data-testid="trainer-attendance-empty-no-sessions"><h3>{t('No assigned training sessions.')}</h3><p>{t('Attendance reports appear after a session is assigned to you.')}</p></div> : <div className="empty-panel" data-testid="trainer-attendance-empty-no-records"><h3>{t('No attendance recorded yet.')}</h3><p>{t('Attendance reports will appear when attendance is recorded for one of your assigned sessions.')}</p></div>}
      </section>
      <section className="role-section role-assignment-section"><div className="role-section-title"><div><div className="eyebrow">{t('MAKE THE LEARNING PRACTICAL')}</div><h2>{t('Create a cohort assignment')}</h2></div></div>
        {programs.length === 0 ? <div className="role-inline-note">{t('Assignments become available after a program is assigned to your trainer account.')}</div> : <form className="role-form-grid" onSubmit={submitAssignment}>
          <label className="field">{t('Cohort')}<select className="form-control" name="programId" value={assignmentProgramId} onChange={event => { setAssignmentProgramId(event.currentTarget.value ? Number(event.currentTarget.value) : ''); setAssignmentSessionId(''); }} required data-testid="select-assignment-cohort"><option value="">{t('Choose cohort')}</option>{programs.map(program => <option key={program.id} value={program.id}>{program.label}</option>)}</select></label>
          <label className="field">{t('Linked session')}<select className="form-control" name="sessionId" value={assignmentSessionId} onChange={event => setAssignmentSessionId(event.currentTarget.value ? Number(event.currentTarget.value) : '')} data-testid="select-assignment-session"><option value="">{t('No specific session')}</option>{assignmentSessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label>
          <label className="field">{t('Assignment title')}<input className="form-control" name="title" minLength={2} required placeholder={t('e.g. Customer discovery notes')} data-testid="input-assignment-title" /></label>
          <label className="field">{t('Due date')}<input className="form-control" name="dueDate" type="date" data-testid="input-assignment-due-date" /></label>
          <label className="field field-wide">{t('Instructions')}<textarea className="form-control" name="instructions" minLength={10} required rows={4} placeholder={t('What should participants explore, prepare or share?')} data-testid="input-assignment-instructions" /></label>
          {(assignmentError || create.isError) && <p className="form-error field-wide" role="alert">{assignmentError || t('Assignment could not be created. Try again.')}</p>}
          {assignmentPublished && <p className="form-success field-wide" role="status" data-testid="assignment-publish-success">{t('Assignment published successfully.')}</p>}
          <div className="field-wide"><button className="button button-primary" disabled={create.isPending} data-testid="button-create-assignment">{create.isPending ? t('Publishing…') : t('Publish assignment')}</button></div>
        </form>}
      </section>
      <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('PARTICIPANT WORK')}</div><h2>{t('Answers to review')}</h2></div><span className="role-count">{dashboard.submissions.length}</span></div>
        {!dashboard.submissions.length ? <div className="empty-panel"><h3>{t('No answers waiting.')}</h3><p>{t('Participant responses appear here as they submit cohort assignments.')}</p></div> : <div className="answer-list">{dashboard.submissions.map(answer => {
          const value = feedbacks[answer.id] || { score: answer.score == null ? '' : String(answer.score), feedback: answer.feedback || '' };
           const isPending = reviewPendingIds.has(answer.id);
           return <article className="answer-card" key={answer.id} data-testid={`card-trainer-answer-${answer.id}`}><div className="answer-meta"><div><b>{answer.founderName}</b><span>{answer.businessName} · {answer.programName} · {answer.assignmentTitle}</span></div><span className={`badge badge-${answer.status === 'reviewed' ? 'good' : 'warm'}`}><span />{word(answer.status)}</span></div><blockquote>{answer.answer}</blockquote><form className="role-form-grid compact" onSubmit={event => saveReview(event, answer.id)}><label className="field">{t('Score / 100')}<input className="form-control" type="number" min="0" max="100" value={value.score} onChange={event => setFeedbacks(old => ({ ...old, [answer.id]: { ...value, score: event.target.value } }))} required data-testid={`input-answer-score-${answer.id}`} /></label><label className="field field-wide">{t('Feedback')}<textarea className="form-control" rows={2} value={value.feedback} onChange={event => setFeedbacks(old => ({ ...old, [answer.id]: { ...value, feedback: event.target.value } }))} placeholder={t('A clear next step will help this founder move forward.')} data-testid={`input-answer-feedback-${answer.id}`} /></label><div className="field-wide">{reviewErrorIds.has(answer.id) && <span className="form-error" role="alert" data-testid={`error-review-answer-${answer.id}`}>{t('Review not saved. Please retry.')}</span>}<button className="button button-primary" disabled={isPending} data-testid={`button-review-answer-${answer.id}`}>{isPending ? t('Saving…') : t('Save review')}</button></div></form></article>;
        })}</div>}
      </section>
      <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('OPEN CHANNEL')}</div><h2>{t('Participant questions')}</h2></div><MessageCircle size={18} /></div>
         {!dashboard.questions.length ? <div className="empty-panel"><h3>{t('Nothing needs a reply.')}</h3><p>{t('Participant questions related to your cohorts will appear here.')}</p></div> : <div className="answer-list">{dashboard.questions.map(question => {
           const isPending = replyPendingIds.has(question.id);
           return <article className="answer-card question-card" key={question.id} data-testid={`card-trainer-question-${question.id}`}><div className="answer-meta"><div><b>{question.founderName} · {question.businessName}</b><span>{question.programName}{question.sessionTitle ? ` · ${question.sessionTitle}` : ''}{question.assignmentTitle ? ` · ${question.assignmentTitle}` : ''}</span></div><span className={`badge badge-${question.reply ? 'good' : 'warm'}`}><span />{question.reply ? t('Answered') : t('Needs reply')}</span></div><blockquote>{question.question}</blockquote>{question.reply && <p className="role-reply"><b>{t('Your reply')}</b>{question.reply}</p>}{!question.reply && <form className="role-reply-form" onSubmit={event => sendReply(event, question.id)}><label className="sr-only" htmlFor={`reply-${question.id}`}>{t('Reply to')} {question.founderName}</label><textarea id={`reply-${question.id}`} className="form-control" rows={2} value={replies[question.id] || ''} onChange={event => setReplies(old => ({ ...old, [question.id]: event.target.value }))} required maxLength={3000} placeholder={t('Write a thoughtful reply…')} data-testid={`input-reply-question-${question.id}`} />{replyErrorIds.has(question.id) && <p className="form-error field-wide" role="alert" data-testid={`error-reply-question-${question.id}`}>{t('Reply not sent. Please retry.')}</p>}<button className="button button-primary" disabled={isPending} data-testid={`button-send-reply-${question.id}`}>{isPending ? t('Sending…') : t('Send reply')}</button></form>}</article>;
         })}</div>}
      </section>
    </>}
  </RoleFrame>;
}

export function MentorDashboardPage({ name, availableRoles, primaryRole, settingsOnly = false }: { name: string; availableRoles?: string[]; primaryRole?: string; settingsOnly?: boolean }) {
  useAppLanguage();
  const query = useGetMentorDashboard({ query: { queryKey: getGetMentorDashboardQueryKey(), refetchOnWindowFocus: true } });
  const client = useQueryClient();
  const createAdditionalSessionRequest = useCreateMentorAdditionalSessionRequest();
  const withdrawAdditionalSessionRequest = useWithdrawMentorAdditionalSessionRequest();
  const [additionalSessionRequestPendingIds, setAdditionalSessionRequestPendingIds] = useState<Set<number>>(() => new Set());
  const [additionalSessionRequestErrorIds, setAdditionalSessionRequestErrorIds] = useState<Set<number>>(() => new Set());
  const [additionalSessionRequestWithdrawPendingIds, setAdditionalSessionRequestWithdrawPendingIds] = useState<Set<number>>(() => new Set());
  const [additionalSessionRequestWithdrawErrorIds, setAdditionalSessionRequestWithdrawErrorIds] = useState<Set<number>>(() => new Set());
  const connectCalendly = useStartCalendlyConnection();
  const connectGoogleCalendar = useStartGoogleCalendarConnection();
  const disconnectGoogleCalendar = useDisconnectGoogleCalendar();
  const saveBookingSettings = useUpdateMentorBookingSettings();
  const bookingUrlInput = useRef<HTMLInputElement>(null);
  const bookingSaveError = saveBookingSettings.isError ? mentorBookingSaveError(saveBookingSettings.error) : null;
  const { bookingProvider, googleCalendarBookingUrl, setBookingProvider, setGoogleCalendarBookingUrl, isDirty, confirmLeave, markSaved } = useMentorBookingDraft(query.data, saveBookingSettings.isPending);
  const [drafts, setDrafts] = useState<Record<number, MentorEngagementDraft>>({});
  const [bookingNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const calendly = params.get('calendly');
    if (calendly === 'connected') return 'Calendly booking link connected.';
    if (calendly === 'cancelled') return 'Calendly authorization was cancelled.';
    if (calendly === 'error') return 'Calendly could not be connected. Try again or ask an admin to check the setup.';
    const googleCalendar = params.get('googleCalendar');
    if (googleCalendar === 'connected') return 'Google account connected. Manage your appointment-schedule link in Settings.';
    if (googleCalendar === 'cancelled') return 'Google authorization was cancelled.';
    if (googleCalendar === 'error') return 'Google Calendar could not be connected. Try again or ask an admin to check the setup.';
    return '';
  });
  const dashboard = query.data;
  const bookingConnected = Boolean(dashboard?.googleCalendarConnected || dashboard?.calendlyBookingUrl);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('calendly') || params.has('googleCalendar')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  const engagements = query.data?.engagements || [];
  const saveBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data: MentorBookingSettingsInput = {
      bookingProvider,
      googleCalendarBookingUrl: googleCalendarBookingUrl.trim() || null,
    };
    saveBookingSettings.mutate({ data }, {
      onSuccess: saved => { markSaved(saved); invalid(client, getGetMentorDashboardQueryKey()); },
      onError: error => {
        if (mentorBookingSaveError(error).field === 'url') bookingUrlInput.current?.focus();
      },
    });
  };
  return <RoleFrame role="mentor" name={name} availableRoles={availableRoles} primaryRole={primaryRole} beforeLeave={confirmLeave}>
    {settingsOnly
      ? <Heading kicker="MENTOR SETTINGS" title="Booking settings" description="Manage your connected booking accounts and appointment-schedule link." />
      : <Heading kicker="FOUNDER ENABLEMENT / MENTOR DESK" title="Support, with context." description="Your assigned engagements and the next useful step for each founder." count={`${engagements.length} engagements`} />}
    <LoadOrError loading={query.isLoading} error={query.isError || !query.data} retry={() => void query.refetch()} />
    {!settingsOnly && dashboard && !query.isError && bookingConnected && <section className="role-section" data-testid="mentor-booking-connected">
      <div className="role-section-title"><h2>{t('Booking account connected')}</h2><Link href="/mentor/settings" className="text-link">{t('Manage booking settings')} <ArrowRight size={14} /></Link></div>
      <p>{[dashboard.googleCalendarConnected && 'Google Calendar', dashboard.calendlyBookingUrl && 'Calendly'].filter(Boolean).join(' · ')}</p>
      {bookingNotice && <p role="status">{t(bookingNotice)}</p>}
      {dashboard.googleCalendarConnected && !dashboard.googleCalendarBookingUrl && <p>{t('Add your appointment-schedule link in Settings so founders can book with you.')}</p>}
    </section>}
    {dashboard && !query.isError && (settingsOnly || !bookingConnected) && <section className="role-section" data-testid="mentor-booking-settings">
      <div className="role-section-title"><div><div className="eyebrow">{t('SESSION BOOKING')}</div><h2>{t('Choose your booking platform')}</h2></div></div>
      <p>{t('Connect your own account, then choose where founders should book time with you.')}</p>
      {bookingNotice && <p role="status" className="form-success">{t(bookingNotice)}</p>}
      {(connectCalendly.isError || connectGoogleCalendar.isError) && <p className="form-error" role="alert">{t('Authorization could not be started. Try again or ask an admin to check the setup.')}</p>}
      {disconnectGoogleCalendar.isError && <p className="form-error" role="alert">{t('Google Calendar could not be disconnected. Please try again.')}</p>}
      {disconnectGoogleCalendar.isSuccess && <p className="form-success" role="status">{t('Google Calendar disconnected. Your booking platform was updated.')}</p>}
      <div className="role-form-grid compact">
        <div className="field field-wide">
          <b>{t('Connect an account')}</b>
          <p data-testid="google-calendar-privacy-disclosure">{t('Bookings sync every five minutes using read-only access to calendars you own. The system checks event times and guest/organizer email to match assigned founders. Event titles, descriptions, locations, meeting links and guest names are not collected. OAuth tokens are encrypted and retained only to keep this sync active.')}</p>
          <div className="role-button-row">
            <button
              type="button"
              className="button button-outline"
               disabled={connectCalendly.isPending || saveBookingSettings.isPending}
               onClick={() => { if (!confirmLeave()) return; connectCalendly.mutate({ data: {} }, {
                onSuccess: result => window.location.assign(result.authorizationUrl),
               }); }}
              data-testid="button-connect-calendly"
            >{connectCalendly.isPending ? t('Connecting…') : dashboard?.calendlyBookingUrl ? t('Reconnect Calendly') : t('Connect Calendly')}</button>
            <button
              type="button"
              className="button button-outline"
               disabled={connectGoogleCalendar.isPending || disconnectGoogleCalendar.isPending || saveBookingSettings.isPending}
               onClick={() => { if (!confirmLeave()) return; connectGoogleCalendar.mutate({ data: {} }, {
                onSuccess: result => window.location.assign(result.authorizationUrl),
               }); }}
              data-testid="button-connect-google-calendar"
            >{connectGoogleCalendar.isPending ? t('Connecting…') : dashboard?.googleCalendarConnected ? t('Reconnect Google Calendar') : t('Connect Google Calendar')}</button>
            {dashboard?.googleCalendarConnected && <button
              type="button"
              className="button button-outline"
               disabled={disconnectGoogleCalendar.isPending || connectGoogleCalendar.isPending || saveBookingSettings.isPending}
               onClick={() => { if (!confirmLeave()) return; disconnectGoogleCalendar.mutate(undefined, {
                 onSuccess: saved => { markSaved(saved); invalid(client, getGetMentorDashboardQueryKey()); },
               }); }}
              data-testid="button-disconnect-google-calendar"
            >{disconnectGoogleCalendar.isPending ? t('Disconnecting…') : t('Disconnect Google Calendar')}</button>}
          </div>
          {dashboard?.googleCalendarConnected && <small className="field-wide">{t('Disconnecting clears your Google Calendar appointment-schedule link. You can connect another account anytime.')}</small>}
        </div>
        {dashboard?.calendlyBookingUrl && <p className="field-wide"><a href={dashboard.calendlyBookingUrl} target="_blank" rel="noreferrer">{t('Open your Calendly booking page')} <ArrowRight size={14} /></a></p>}
        <form className="role-form-grid compact field-wide" onSubmit={saveBooking}>
           <fieldset className="field field-wide" disabled={saveBookingSettings.isPending || disconnectGoogleCalendar.isPending}>
            <legend>{t('Founders will book through')}</legend>
            <label className="mentor-booking-choice">
              <input type="radio" name="bookingProvider" value="calendly" checked={bookingProvider === 'calendly'} disabled={!dashboard?.calendlyBookingUrl} onChange={() => { setBookingProvider('calendly'); saveBookingSettings.reset(); }} data-testid="radio-booking-calendly" />
              <span><b>Calendly</b><small>{dashboard?.calendlyBookingUrl ? t('Connected') : t('Connect Calendly first')}</small></span>
            </label>
            <label className="mentor-booking-choice">
              <input type="radio" name="bookingProvider" value="google_calendar" checked={bookingProvider === 'google_calendar'} disabled={!dashboard?.googleCalendarConnected} onChange={() => { setBookingProvider('google_calendar'); saveBookingSettings.reset(); }} data-testid="radio-booking-google-calendar" />
              <span><b>Google Calendar</b><small>{dashboard?.googleCalendarConnected ? t('Account connected') : t('Connect Google Calendar first')}</small></span>
            </label>
          </fieldset>
          {bookingProvider === 'google_calendar' && <label className="field field-wide">
            {t('Google Calendar appointment-schedule link')}
            <input ref={bookingUrlInput} className="form-control" type="url" value={googleCalendarBookingUrl} disabled={saveBookingSettings.isPending || disconnectGoogleCalendar.isPending} onChange={event => { setGoogleCalendarBookingUrl(event.target.value); saveBookingSettings.reset(); }} aria-invalid={bookingSaveError?.field === 'url' || undefined} aria-describedby={`mentor-booking-url-help${bookingSaveError?.field === 'url' ? ' mentor-booking-url-error' : ''}`} placeholder="https://calendar.google.com/calendar/appointments/schedules/…" required data-testid="input-google-calendar-booking-url" />
            <small id="mentor-booking-url-help">{t('Create an appointment schedule in Google Calendar, then paste its public link here.')}</small>
            {bookingSaveError?.field === 'url' && <span id="mentor-booking-url-error" className="form-error" role="alert">{t(bookingSaveError.message)}</span>}
          </label>}
          {bookingSaveError && bookingSaveError.field !== 'url' && <p className="form-error field-wide" role="alert" data-testid="booking-save-error">{t(bookingSaveError.message)}</p>}
          {saveBookingSettings.isSuccess && <p className="form-success field-wide" role="status">{t('Booking platform saved.')}</p>}
          <div className="field-wide role-button-row"><button className="button button-primary" disabled={saveBookingSettings.isPending || disconnectGoogleCalendar.isPending || !dashboard || (bookingProvider === 'google_calendar' && !dashboard.googleCalendarConnected)} data-testid="button-save-booking-settings">{saveBookingSettings.isPending ? t('Saving…') : t('Save booking platform')}</button>{isDirty && <><span role="status">{t('Unsaved changes')}</span><button type="button" className="button button-quiet" disabled={saveBookingSettings.isPending} onClick={() => { if (confirmLeave()) saveBookingSettings.reset(); }} data-testid="button-discard-booking-draft">{t('Discard changes')}</button></>}</div>
        </form>
      </div>
    </section>}
    {!settingsOnly && query.data && (engagements.length === 0 ? <div className="empty-panel"><span className="empty-icon">J</span><h3>{t('No engagements assigned yet.')}</h3><p>{t('Your admin will connect you with a founder when the right support need comes into view.')}</p></div> : <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('YOUR FOUNDER ENGAGEMENTS')}</div><h2>{t('Keep the next step visible')}</h2></div></div><div className="answer-list">{engagements.map(item => {
      const draft = drafts[item.id] || { date: item.scheduledDate || '', status: item.status, notes: item.notes || '' };
      const reported = item.reportedOneToOneSessions;
      const target = item.mentorSessionsPerBusiness;
      const targetReached = target > 0 && reported >= target;
      const hasOpenRequest = item.openAdditionalSessionsEmailStatus !== null;
      return <div className="mentor-engagement-progress-wrap" key={item.id}>
        <section className="mentor-session-progress" aria-label={`${t('1:1 session report progress')} — ${item.businessName}`} data-testid={`mentor-session-progress-${item.businessId}`}>
          <div className="mentor-session-progress-heading"><b>{t('1:1 session reports')}</b><span>{reported} / {target}</span></div>
          <progress value={target > 0 ? Math.min(reported, target) : 0} max={target || 1} aria-label={t('Reported sessions compared with the program target')} />
          <p>{target > 0 ? t('Reports submitted for this business compared with its program target.') : t('The session target has not been set for this program.')}</p>
          {targetReached && (hasOpenRequest
            ? <p className={item.openAdditionalSessionsEmailStatus === 'delivered' ? 'form-success' : 'form-error'} role="status">{item.openAdditionalSessionsEmailStatus === 'delivered' ? t('The team has been notified and will review your request.') : t('Your request is recorded, but the email notification failed. The team can still see it in the requests list.')}</p>
            : <Button type="button" className="button button-quiet" disabled={additionalSessionRequestPendingIds.has(item.id)} data-testid={`button-request-more-sessions-${item.businessId}`} onClick={() => {
              setAdditionalSessionRequestErrorIds(current => withId(current, item.id, false));
              setAdditionalSessionRequestPendingIds(current => withId(current, item.id, true));
              createAdditionalSessionRequest.mutate({ id: item.id }, {
                onSuccess: () => {
                  setAdditionalSessionRequestErrorIds(current => withId(current, item.id, false));
                  invalid(client, getGetMentorDashboardQueryKey());
                },
                onError: () => setAdditionalSessionRequestErrorIds(current => withId(current, item.id, true)),
                onSettled: () => setAdditionalSessionRequestPendingIds(current => withId(current, item.id, false)),
              });
            }}>{additionalSessionRequestPendingIds.has(item.id) ? t('Sending request…') : t('Request additional sessions')}</Button>)}
          {additionalSessionRequestErrorIds.has(item.id) && <p className="form-error" role="alert">{t('Your request could not be sent. Check the connection and try again.')}</p>}
        </section>
        {item.additionalSessionRequests.length > 0 && <section className="mentor-session-progress" aria-label={t('Additional session request history')} data-testid={`additional-session-history-${item.businessId}`}>
          <div className="mentor-session-progress-heading"><b>{t('Additional session request history')}</b></div>
          {item.additionalSessionRequests.map(request => <div className="mentor-session-history-entry" key={request.id} data-testid={`additional-session-history-item-${request.id}`}>
            <span>{dateTimeText(request.createdAt)} · {request.decision === 'approved'
              ? `${t('Approved')}: ${request.approvedAdditionalSessions} ${t('additional sessions')}`
              : request.decision === 'declined'
                ? t('Request declined.')
                : request.decision === 'withdrawn'
                  ? t('Request withdrawn.')
                : request.status === 'open'
                  ? t('Request awaiting review.')
                  : t('Request reviewed.')}</span>
            {request.status === 'open' && request.decision === null && <Button
              type="button"
              className="button button-quiet"
              disabled={additionalSessionRequestWithdrawPendingIds.has(request.id)}
              data-testid={`button-withdraw-additional-session-request-${request.id}`}
              onClick={() => {
                setAdditionalSessionRequestWithdrawErrorIds(current => withId(current, request.id, false));
                setAdditionalSessionRequestWithdrawPendingIds(current => withId(current, request.id, true));
                withdrawAdditionalSessionRequest.mutate({ id: request.id }, {
                  onSuccess: () => invalid(client, getGetMentorDashboardQueryKey()),
                  onError: () => setAdditionalSessionRequestWithdrawErrorIds(current => withId(current, request.id, true)),
                  onSettled: () => setAdditionalSessionRequestWithdrawPendingIds(current => withId(current, request.id, false)),
                });
              }}
            >{additionalSessionRequestWithdrawPendingIds.has(request.id) ? t('Withdrawing…') : t('Withdraw request')}</Button>}
            {additionalSessionRequestWithdrawErrorIds.has(request.id) && <span className="form-error" role="alert">{t('The request could not be withdrawn. It may have already been reviewed. Please refresh and try again.')}</span>}
          </div>)}
        </section>}
        <MentorEngagementCard item={item} draft={draft} onDraftChange={next => setDrafts(old => ({ ...old, [item.id]: next }))} />
      </div>;
    })}</div></section>)}
  </RoleFrame>;
}

export function JudgeDashboardPage({ name, availableRoles, primaryRole }: { name: string; availableRoles?: string[]; primaryRole?: string }) {
  useAppLanguage();
  const query = useGetJudgeDashboard({ query: { queryKey: getGetJudgeDashboardQueryKey(), refetchOnWindowFocus: true } });
  const client = useQueryClient();
  const submit = useSubmitJudgeScorecard();
  const [scores, setScores] = useState<Record<number, { score: string; feedback: string }>>({});
  const pitches = query.data?.pitches || [];
  const save = (event: FormEvent<HTMLFormElement>, pitch: typeof pitches[number]) => {
    event.preventDefault();
    const values = scores[pitch.assignmentId] || { score: pitch.score == null ? '' : String(pitch.score), feedback: pitch.feedback || '' };
    const score = Number(values.score);
    if (!Number.isFinite(score) || score < 0 || score > 100 || values.feedback.trim().length < 3) return;
    const data: JudgeScorecardInput = { score, feedback: values.feedback.trim() };
    submit.mutate({ id: pitch.assignmentId, data }, { onSuccess: () => invalid(client, getGetJudgeDashboardQueryKey()) });
  };
  return <RoleFrame role="judge" name={name} availableRoles={availableRoles} primaryRole={primaryRole}>
    <Heading kicker="PITCH & DEMO DAY / JUDGE DESK" title="A fair read, clearly scored." description="Review the ventures assigned to you and submit an individual scorecard for each." count={`${pitches.length} assigned ventures`} />
    <LoadOrError loading={query.isLoading} error={query.isError || !query.data} retry={() => void query.refetch()} />
    {query.data && (pitches.length === 0 ? <div className="empty-panel"><span className="empty-icon">J</span><h3>{t('No pitch assignments yet.')}</h3><p>{t('Assigned founder presentations will appear here ahead of pitch or demo day.')}</p></div> : <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('YOUR SCORECARDS')}</div><h2>{t('Founder presentations')}</h2></div></div><div className="answer-list">{pitches.map(pitch => {
      const values = scores[pitch.assignmentId] || { score: pitch.score == null ? '' : String(pitch.score), feedback: pitch.feedback || '' };
      return <article className="answer-card judge-card" key={pitch.assignmentId} data-testid={`card-judge-pitch-${pitch.assignmentId}`}><div className="answer-meta"><div><b>{pitch.businessName}</b><span>{pitch.industry || t('Industry not specified')} · {word(pitch.eventType)}</span></div><span className="role-date"><CalendarDays size={16} />{dateText(pitch.eventDate)}</span></div><form className="role-form-grid compact" onSubmit={event => save(event, pitch)}><label className="field">{t('Your score / 100')}<input className="form-control" type="number" min="0" max="100" step="1" value={values.score} onChange={event => setScores(old => ({ ...old, [pitch.assignmentId]: { ...values, score: event.target.value } }))} required data-testid={`input-judge-score-${pitch.assignmentId}`} /></label><label className="field field-wide">{t('Evaluation feedback')}<textarea className="form-control" minLength={3} maxLength={3000} rows={4} value={values.feedback} onChange={event => setScores(old => ({ ...old, [pitch.assignmentId]: { ...values, feedback: event.target.value } }))} required placeholder={t('Note the strengths, risks and promise you see.')} data-testid={`input-judge-feedback-${pitch.assignmentId}`} /></label><div className="field-wide score-submit-row"><span>{pitch.submittedAt ? `${t('Last submitted')} ${dateText(pitch.submittedAt)}` : t('Your scorecard is private until submitted.')}</span><button className="button button-primary" disabled={submit.isPending} data-testid={`button-submit-scorecard-${pitch.assignmentId}`}>{submit.isPending ? t('Submitting…') : pitch.submittedAt ? t('Update scorecard') : t('Submit scorecard')}</button></div>{submit.isError && <span className="form-error field-wide">{t('Scorecard not submitted. Please try again.')}</span>}</form></article>;
    })}</div></section>)}
  </RoleFrame>;
}

export function RoleNotFound({ role }: { role: StaffMember['role'] }) {
  return <main className="auth-status-page"><div className="eyebrow">{t('PRIVATE WORKSPACE')}</div><h1 className="app-title">{t('This view is not part of your role.')}</h1><p>{t('Your account can only open its assigned program workspace.')}</p><Link className="button button-primary" href={`/${role}`}>{t('Go to my workspace')} <ArrowRight size={15} /></Link></main>;
}
