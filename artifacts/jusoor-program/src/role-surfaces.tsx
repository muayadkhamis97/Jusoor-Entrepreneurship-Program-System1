import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClerk } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import {
  getGetTrainerDashboardQueryKey, getGetMentorDashboardQueryKey, getGetJudgeDashboardQueryKey,
  getGetTrainerAttendanceReportsQueryKey, useGetTrainerAttendanceReports,
  useGetTrainerDashboard, useCreateTrainingAssignment, useReviewTrainingAnswer,
  useReplyTrainingQuestion, useGetMentorDashboard, useUpdateAssignedMentoring,
  useGetJudgeDashboard, useSubmitJudgeScorecard, useStartCalendlyConnection,
  useStartGoogleCalendarConnection, useUpdateMentorBookingSettings,
  getGetProgramBrandingQueryKey, useGetProgramBranding,
} from '@workspace/api-client-react';
import type {
  TrainingAssignmentInput, TrainingAnswerReview, TrainingQuestionReply,
  MentorEngagementUpdate, JudgeScorecardInput, StaffMember,
  MentorBookingProvider, MentorBookingSettingsInput,
} from '@workspace/api-client-react';
import { ArrowRight, BookOpen, CalendarDays, CircleAlert, ClipboardList, Clock3, LogOut, MessageCircle, Video } from 'lucide-react';
import { SessionRecordingPlayer } from './session-recording-player';
import './attendance-reports.css';
import { LanguageToggle, currentLanguage, t, useAppLanguage } from './language';
import { trainerProgramOptions } from './trainer-program-options';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const word = (value?: string | null) => value ? t(value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())) : '—';
const dateText = (date?: string | null) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('Not scheduled');

export function RoleFrame({ role, name, children, availableRoles = [], primaryRole }: { role: string; name: string; children: ReactNode; availableRoles?: string[]; primaryRole?: string }) {
  useAppLanguage();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const branding = brandingQuery.data;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'J';
  const otherRoles = availableRoles.filter(availableRole => availableRole !== role);
  return <div className="role-workspace">
    <header className="role-topbar">
      <Link href={`/${role}`} className="brand" data-testid="link-role-brand">{branding?.logoUrl ? <img className="brand-logo" src={branding.logoUrl} alt="" /> : <span className="brand-mark">{branding?.brandName?.slice(0, 1) || 'J'}</span>}<span><b>{branding?.brandName || 'Jusoor'}</b><small>{t('PROGRAM HUB')}</small></span></Link>
       <div className="role-top-actions">{role === 'trainer' && <><Link href={location === '/trainer/sessions' ? '/trainer' : '/trainer/sessions'} className="button button-quiet" data-testid="link-trainer-sessions"><CalendarDays size={14} />{t(location === '/trainer/sessions' ? 'Training workspace' : 'Live sessions')}</Link><Link href={location === '/trainer/courses' ? '/trainer' : '/trainer/courses'} className="button button-quiet" data-testid="link-trainer-learning"><BookOpen size={14} />{t(location === '/trainer/courses' ? 'Training workspace' : 'Course learning')}</Link></>}{otherRoles.map(availableRole => <Link key={availableRole} href={`/${availableRole}`} className="button button-quiet" data-testid={`link-role-${availableRole}`}>{t(`Open ${availableRole} workspace`)}</Link>)}{(primaryRole === 'coordinator' || primaryRole === 'staff') && <Link href="/" className="button button-quiet" data-testid="link-program-operations">{t(primaryRole === 'coordinator' ? 'Admin workspace' : 'Program staff workspace')}</Link>}<Link href="/profile" className="button button-quiet" data-testid="link-role-profile">{t('Profile')}</Link><span className="role-chip">{t(role)}</span><span className="role-user">{initials} <b>{name}</b></span><LanguageToggle /><button className="button button-quiet" onClick={() => void signOut({ redirectUrl: basePath || '/' })} data-testid="button-role-signout"><LogOut size={15} /> {t('Sign out')}</button></div>
    </header>
    <main className="role-main page-enter">{children}</main>
    <footer className="footer role-footer"><span>{t('JUSOOR ENTREPRENEURSHIP PROGRAM')}</span><span>{t('ONE JOURNEY, IN VIEW')}</span></footer>
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
  const [feedbacks, setFeedbacks] = useState<Record<number, { score: string; feedback: string }>>({});
  const [replies, setReplies] = useState<Record<number, string>>({});
  const dashboard = query.data;
  const sessions = dashboard?.sessions || [];
  const programs = trainerProgramOptions(dashboard?.programs || [], t('Program name unavailable'));
  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const programId = Number(form.get('programId'));
    const title = String(form.get('title') || '').trim();
    const instructions = String(form.get('instructions') || '').trim();
    if (!programId || title.length < 2 || instructions.length < 10) { setAssignmentError('Choose a cohort and add a title and clear instructions.'); return; }
    const data: TrainingAssignmentInput = { programId, title, instructions, dueDate: String(form.get('dueDate') || '') || null, sessionId: form.get('sessionId') ? Number(form.get('sessionId')) : null };
    create.mutate({ data }, { onSuccess: () => { invalid(client, getGetTrainerDashboardQueryKey()); formElement.reset(); setAssignmentError(''); } });
  };
  const saveReview = (event: FormEvent<HTMLFormElement>, id: number) => {
    event.preventDefault();
    const values = feedbacks[id] || { score: '', feedback: '' };
    const score = values.score === '' ? null : Number(values.score);
    if (score !== null && (score < 0 || score > 100)) return;
    const data: TrainingAnswerReview = { score, feedback: values.feedback.trim() || null };
    review.mutate({ id, data }, { onSuccess: () => invalid(client, getGetTrainerDashboardQueryKey()) });
  };
  const sendReply = (event: FormEvent<HTMLFormElement>, id: number) => {
    event.preventDefault();
    const answer = (replies[id] || '').trim();
    if (!answer) return;
    const data: TrainingQuestionReply = { reply: answer };
    reply.mutate({ id, data }, { onSuccess: () => { invalid(client, getGetTrainerDashboardQueryKey()); setReplies(current => ({ ...current, [id]: '' })); } });
  };
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
         <div className="role-section-title"><div><div className="eyebrow">{t('SESSION REPORTS')}</div><h2>{t('Training attendance')}</h2></div></div>
         <p>{t('Zoom attendance is limited to sessions assigned to you. Unmatched attendees are flagged for admin review.')}</p>
        {attendanceQuery.isLoading ? <div className="role-inline-note">{t('Loading attendance reports…')}</div> : attendanceQuery.isError ? <div className="role-inline-note" role="alert">{t('Attendance reports could not be loaded. Refresh the page to try again.')}</div> : attendanceQuery.data?.length ? <div className="role-list">
          {attendanceQuery.data.map(report => {
            const present = report.attendance.filter(person => person.status === 'present').length;
            const unknown = report.unmatchedParticipants.length;
            return <article className="role-row role-attendance-row" key={report.sessionId} data-testid={`trainer-attendance-${report.sessionId}`}>
              <span className="role-date"><Clock3 size={17} /></span>
              <div className="role-row-copy">
                <b>{report.sessionTitle}</b>
                <span>{dateText(report.scheduledDate)} · {present} {t('businesses present')}</span>
                {report.zoomSync ? <small>{t('Zoom sync')}: {word(report.zoomSync.status)} · {report.zoomSync.matchedCount} {t('matched')} · {report.zoomSync.unmatchedCount} {t('to review')}</small> : <small>{t('Waiting for a Zoom attendance report.')}</small>}
                {unknown > 0 && <div className="role-unmatched-list"><b>{unknown} {t(unknown === 1 ? 'attendee needs review' : 'attendees need review')}</b>{report.unmatchedParticipants.map(attendee => <span key={attendee.id}>{attendee.displayName}{attendee.email ? ` · ${attendee.email}` : ''} · {Math.round(attendee.durationSeconds / 60)} {t('min')}</span>)}</div>}
              </div>
              <span className={`badge badge-${report.zoomSync?.status === 'completed' && unknown === 0 ? 'good' : 'neutral'}`}><span />{report.zoomSync ? word(report.zoomSync.status) : t('Waiting')}</span>
            </article>;
          })}
        </div> : <div className="empty-panel"><h3>{t('No assigned training sessions.')}</h3><p>{t('Attendance reports appear after a Zoom session is assigned to you.')}</p></div>}
      </section>
      <section className="role-section role-assignment-section"><div className="role-section-title"><div><div className="eyebrow">{t('MAKE THE LEARNING PRACTICAL')}</div><h2>{t('Create a cohort assignment')}</h2></div></div>
        {programs.length === 0 ? <div className="role-inline-note">{t('Assignments become available after a session is assigned to your trainer account.')}</div> : <form className="role-form-grid" onSubmit={submitAssignment}>
          <label className="field">{t('Cohort')}<select className="form-control" name="programId" defaultValue="" required data-testid="select-assignment-cohort"><option value="">{t('Choose cohort')}</option>{programs.map(program => <option key={program.id} value={program.id}>{program.label}</option>)}</select></label>
          <label className="field">{t('Linked session')}<select className="form-control" name="sessionId" defaultValue="" data-testid="select-assignment-session"><option value="">{t('No specific session')}</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
          <label className="field">{t('Assignment title')}<input className="form-control" name="title" minLength={2} required placeholder={t('e.g. Customer discovery notes')} data-testid="input-assignment-title" /></label>
          <label className="field">{t('Due date')}<input className="form-control" name="dueDate" type="date" data-testid="input-assignment-due-date" /></label>
          <label className="field field-wide">{t('Instructions')}<textarea className="form-control" name="instructions" minLength={10} required rows={4} placeholder={t('What should participants explore, prepare or share?')} data-testid="input-assignment-instructions" /></label>
          {(assignmentError || create.isError) && <p className="form-error field-wide" role="alert">{assignmentError || t('Assignment could not be created. Try again.')}</p>}
          <div className="field-wide"><button className="button button-primary" disabled={create.isPending} data-testid="button-create-assignment">{create.isPending ? t('Publishing…') : t('Publish assignment')}</button></div>
        </form>}
      </section>
      <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('PARTICIPANT WORK')}</div><h2>{t('Answers to review')}</h2></div><span className="role-count">{dashboard.submissions.length}</span></div>
        {!dashboard.submissions.length ? <div className="empty-panel"><h3>{t('No answers waiting.')}</h3><p>{t('Participant responses appear here as they submit cohort assignments.')}</p></div> : <div className="answer-list">{dashboard.submissions.map(answer => {
          const value = feedbacks[answer.id] || { score: answer.score == null ? '' : String(answer.score), feedback: answer.feedback || '' };
          return <article className="answer-card" key={answer.id} data-testid={`card-trainer-answer-${answer.id}`}><div className="answer-meta"><div><b>{answer.founderName}</b><span>{answer.businessName} · {answer.programName} · {answer.assignmentTitle}</span></div><span className={`badge badge-${answer.status === 'reviewed' ? 'good' : 'warm'}`}><span />{word(answer.status)}</span></div><blockquote>{answer.answer}</blockquote><form className="role-form-grid compact" onSubmit={event => saveReview(event, answer.id)}><label className="field">{t('Score / 100')}<input className="form-control" type="number" min="0" max="100" value={value.score} onChange={event => setFeedbacks(old => ({ ...old, [answer.id]: { ...value, score: event.target.value } }))} required data-testid={`input-answer-score-${answer.id}`} /></label><label className="field field-wide">{t('Feedback')}<textarea className="form-control" rows={2} value={value.feedback} onChange={event => setFeedbacks(old => ({ ...old, [answer.id]: { ...value, feedback: event.target.value } }))} placeholder={t('A clear next step will help this founder move forward.')} data-testid={`input-answer-feedback-${answer.id}`} /></label><div className="field-wide">{review.isError && <span className="form-error">{t('Review not saved. Please retry.')}</span>}<button className="button button-primary" disabled={review.isPending} data-testid={`button-review-answer-${answer.id}`}>{review.isPending ? t('Saving…') : t('Save review')}</button></div></form></article>;
        })}</div>}
      </section>
      <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('OPEN CHANNEL')}</div><h2>{t('Participant questions')}</h2></div><MessageCircle size={18} /></div>
        {!dashboard.questions.length ? <div className="empty-panel"><h3>{t('Nothing needs a reply.')}</h3><p>{t('Participant questions related to your cohorts will appear here.')}</p></div> : <div className="answer-list">{dashboard.questions.map(question => <article className="answer-card question-card" key={question.id} data-testid={`card-trainer-question-${question.id}`}><div className="answer-meta"><div><b>{question.founderName} · {question.businessName}</b><span>{question.programName}{question.sessionTitle ? ` · ${question.sessionTitle}` : ''}{question.assignmentTitle ? ` · ${question.assignmentTitle}` : ''}</span></div><span className={`badge badge-${question.reply ? 'good' : 'warm'}`}><span />{question.reply ? t('Answered') : t('Needs reply')}</span></div><blockquote>{question.question}</blockquote>{question.reply && <p className="role-reply"><b>{t('Your reply')}</b>{question.reply}</p>}{!question.reply && <form className="role-reply-form" onSubmit={event => sendReply(event, question.id)}><label className="sr-only" htmlFor={`reply-${question.id}`}>{t('Reply to')} {question.founderName}</label><textarea id={`reply-${question.id}`} className="form-control" rows={2} value={replies[question.id] || ''} onChange={event => setReplies(old => ({ ...old, [question.id]: event.target.value }))} required maxLength={3000} placeholder={t('Write a thoughtful reply…')} data-testid={`input-reply-question-${question.id}`} /><button className="button button-primary" disabled={reply.isPending} data-testid={`button-send-reply-${question.id}`}>{reply.isPending ? t('Sending…') : t('Send reply')}</button></form>}</article>)}</div>}
      </section>
    </>}
  </RoleFrame>;
}

export function MentorDashboardPage({ name, availableRoles, primaryRole }: { name: string; availableRoles?: string[]; primaryRole?: string }) {
  useAppLanguage();
  const query = useGetMentorDashboard({ query: { queryKey: getGetMentorDashboardQueryKey(), refetchOnWindowFocus: true } });
  const client = useQueryClient();
  const update = useUpdateAssignedMentoring();
  const connectCalendly = useStartCalendlyConnection();
  const connectGoogleCalendar = useStartGoogleCalendarConnection();
  const saveBookingSettings = useUpdateMentorBookingSettings();
  const [bookingProvider, setBookingProvider] = useState<MentorBookingProvider>('calendly');
  const [googleCalendarBookingUrl, setGoogleCalendarBookingUrl] = useState('');
  const [drafts, setDrafts] = useState<Record<number, { date: string; status: string; notes: string }>>({});
  const [bookingNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const calendly = params.get('calendly');
    if (calendly === 'connected') return 'Calendly booking link connected.';
    if (calendly === 'cancelled') return 'Calendly authorization was cancelled.';
    if (calendly === 'error') return 'Calendly could not be connected. Try again or ask an admin to check the setup.';
    const googleCalendar = params.get('googleCalendar');
    if (googleCalendar === 'connected') return 'Google account connected. Add your appointment-schedule link below to receive founder bookings.';
    if (googleCalendar === 'cancelled') return 'Google authorization was cancelled.';
    if (googleCalendar === 'error') return 'Google Calendar could not be connected. Try again or ask an admin to check the setup.';
    return '';
  });
  const dashboard = query.data;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('calendly') || params.has('googleCalendar')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (dashboard) {
      setBookingProvider(dashboard.bookingProvider);
      setGoogleCalendarBookingUrl(dashboard.googleCalendarBookingUrl || '');
    }
  }, [dashboard?.bookingProvider, dashboard?.googleCalendarBookingUrl]);
  const engagements = query.data?.engagements || [];
  const saveBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data: MentorBookingSettingsInput = {
      bookingProvider,
      googleCalendarBookingUrl: googleCalendarBookingUrl.trim() || null,
    };
    saveBookingSettings.mutate({ data }, {
      onSuccess: () => invalid(client, getGetMentorDashboardQueryKey()),
    });
  };
  const save = (event: FormEvent<HTMLFormElement>, id: number) => {
    event.preventDefault();
    const values = drafts[id] || (() => {
      const current = engagements.find(item => item.id === id);
      return { date: current?.scheduledDate || '', status: current?.status || 'requested', notes: current?.notes || '' };
    })();
    const data: MentorEngagementUpdate = { scheduledDate: values.date || null, status: values.status as MentorEngagementUpdate['status'], notes: values.notes.trim() || null };
    update.mutate({ id, data }, { onSuccess: () => invalid(client, getGetMentorDashboardQueryKey()) });
  };
  return <RoleFrame role="mentor" name={name} availableRoles={availableRoles} primaryRole={primaryRole}>
    <Heading kicker="FOUNDER ENABLEMENT / MENTOR DESK" title="Support, with context." description="Your assigned engagements and the next useful step for each founder." count={`${engagements.length} engagements`} />
    <LoadOrError loading={query.isLoading} error={query.isError || !query.data} retry={() => void query.refetch()} />
    <section className="role-section" data-testid="mentor-booking-settings">
      <div className="role-section-title"><div><div className="eyebrow">{t('SESSION BOOKING')}</div><h2>{t('Choose your booking platform')}</h2></div></div>
      <p>{t('Connect your own account, then choose where founders should book time with you.')}</p>
      {bookingNotice && <p role="status" className="form-success">{t(bookingNotice)}</p>}
      {(connectCalendly.isError || connectGoogleCalendar.isError) && <p className="form-error" role="alert">{t('Authorization could not be started. Try again or ask an admin to check the setup.')}</p>}
      <div className="role-form-grid compact">
        <div className="field field-wide">
          <b>{t('Connect an account')}</b>
          <div className="role-button-row">
            <button
              type="button"
              className="button button-outline"
              disabled={connectCalendly.isPending}
              onClick={() => connectCalendly.mutate({ data: {} }, {
                onSuccess: result => window.location.assign(result.authorizationUrl),
              })}
              data-testid="button-connect-calendly"
            >{connectCalendly.isPending ? t('Connecting…') : dashboard?.calendlyBookingUrl ? t('Reconnect Calendly') : t('Connect Calendly')}</button>
            <button
              type="button"
              className="button button-outline"
              disabled={connectGoogleCalendar.isPending}
              onClick={() => connectGoogleCalendar.mutate({ data: {} }, {
                onSuccess: result => window.location.assign(result.authorizationUrl),
              })}
              data-testid="button-connect-google-calendar"
            >{connectGoogleCalendar.isPending ? t('Connecting…') : dashboard?.googleCalendarConnected ? t('Reconnect Google Calendar') : t('Connect Google Calendar')}</button>
          </div>
        </div>
        {dashboard?.calendlyBookingUrl && <p className="field-wide"><a href={dashboard.calendlyBookingUrl} target="_blank" rel="noreferrer">{t('Open your Calendly booking page')} <ArrowRight size={14} /></a></p>}
        <form className="role-form-grid compact field-wide" onSubmit={saveBooking}>
          <fieldset className="field field-wide">
            <legend>{t('Founders will book through')}</legend>
            <label className="mentor-booking-choice">
              <input type="radio" name="bookingProvider" value="calendly" checked={bookingProvider === 'calendly'} disabled={!dashboard?.calendlyBookingUrl} onChange={() => setBookingProvider('calendly')} data-testid="radio-booking-calendly" />
              <span><b>Calendly</b><small>{dashboard?.calendlyBookingUrl ? t('Connected') : t('Connect Calendly first')}</small></span>
            </label>
            <label className="mentor-booking-choice">
              <input type="radio" name="bookingProvider" value="google_calendar" checked={bookingProvider === 'google_calendar'} disabled={!dashboard?.googleCalendarConnected} onChange={() => setBookingProvider('google_calendar')} data-testid="radio-booking-google-calendar" />
              <span><b>Google Calendar</b><small>{dashboard?.googleCalendarConnected ? t('Account connected') : t('Connect Google Calendar first')}</small></span>
            </label>
          </fieldset>
          {bookingProvider === 'google_calendar' && <label className="field field-wide">
            {t('Google Calendar appointment-schedule link')}
            <input className="form-control" type="url" value={googleCalendarBookingUrl} onChange={event => setGoogleCalendarBookingUrl(event.target.value)} placeholder="https://calendar.google.com/calendar/appointments/schedules/…" required data-testid="input-google-calendar-booking-url" />
            <small>{t('Create an appointment schedule in Google Calendar, then paste its public link here. Jusoor does not read your calendar events.')}</small>
          </label>}
          {saveBookingSettings.isError && <p className="form-error field-wide" role="alert">{t('Booking settings could not be saved. Confirm the selected account is connected and the schedule link is valid.')}</p>}
          {saveBookingSettings.isSuccess && <p className="form-success field-wide" role="status">{t('Booking platform saved.')}</p>}
          <div className="field-wide"><button className="button button-primary" disabled={saveBookingSettings.isPending || !dashboard || (bookingProvider === 'google_calendar' && !dashboard.googleCalendarConnected)} data-testid="button-save-booking-settings">{saveBookingSettings.isPending ? t('Saving…') : t('Save booking platform')}</button></div>
        </form>
      </div>
    </section>
    {query.data && (engagements.length === 0 ? <div className="empty-panel"><span className="empty-icon">J</span><h3>{t('No engagements assigned yet.')}</h3><p>{t('Your admin will connect you with a founder when the right support need comes into view.')}</p></div> : <section className="role-section"><div className="role-section-title"><div><div className="eyebrow">{t('YOUR FOUNDER ENGAGEMENTS')}</div><h2>{t('Keep the next step visible')}</h2></div></div><div className="answer-list">{engagements.map(item => {
      const draft = drafts[item.id] || { date: item.scheduledDate || '', status: item.status, notes: item.notes || '' };
      return <article className="answer-card mentor-card" key={item.id} data-testid={`card-mentor-engagement-${item.id}`}><div className="answer-meta"><div><b>{item.founderName} · {item.businessName}</b><span>{item.programName} · {word(item.type)}</span></div><span className={`badge badge-${item.status === 'completed' ? 'good' : 'warm'}`}><span />{word(item.status)}</span></div><h3>{item.topic}</h3><p className="mentor-provider">{item.provider}</p><form className="role-form-grid compact" onSubmit={event => save(event, item.id)}><label className="field">{t('Next meeting')}<input className="form-control" type="date" value={draft.date} onChange={event => setDrafts(old => ({ ...old, [item.id]: { ...draft, date: event.target.value } }))} data-testid={`input-mentor-date-${item.id}`} /></label><label className="field">{t('Engagement status')}<select className="form-control" value={draft.status} onChange={event => setDrafts(old => ({ ...old, [item.id]: { ...draft, status: event.target.value } }))} data-testid={`select-mentor-status-${item.id}`}><option value="requested">{t('Requested')}</option><option value="matched">{t('Matched')}</option><option value="scheduled">{t('Scheduled')}</option><option value="completed">{t('Completed')}</option></select></label><label className="field field-wide">{t('Working notes')}<textarea className="form-control" rows={3} value={draft.notes} onChange={event => setDrafts(old => ({ ...old, [item.id]: { ...draft, notes: event.target.value } }))} placeholder={t('Capture agreed actions and useful context.')} data-testid={`input-mentor-notes-${item.id}`} /></label><div className="field-wide">{update.isError && <span className="form-error">{t('Could not update this engagement.')}</span>}<button className="button button-primary" disabled={update.isPending} data-testid={`button-save-mentor-${item.id}`}>{update.isPending ? t('Saving…') : t('Save engagement')}</button></div></form></article>;
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
  return <main className="auth-status-page"><div className="eyebrow">{t('JUSOOR / PRIVATE WORKSPACE')}</div><h1 className="app-title">{t('This view is not part of your role.')}</h1><p>{t('Your account can only open its assigned program workspace.')}</p><Link className="button button-primary" href={`/${role}`}>{t('Go to my workspace')} <ArrowRight size={15} /></Link></main>;
}
