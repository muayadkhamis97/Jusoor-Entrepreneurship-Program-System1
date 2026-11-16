import { useState } from 'react';
import { CalendarDays, Handshake, MapPin, Video } from 'lucide-react';
import type { ParticipantEnrollment } from '@workspace/api-client-react';
import { Button as EditorialButton } from '@workspace/program-editorial/components/ui/button';
import { SessionCalendar } from './session-calendar';
import { SessionRecordingPlayer } from './session-recording-player';
import { ParticipantSessionInteractions } from './session-interactions';
import { t, currentLanguage } from './language';
import {
  ParticipantPageError,
  ParticipantRouteHeading,
  participantDateText,
  participantStatusClass,
  participantWord,
  useParticipantEnrollments,
} from './participant-page-shared';

export function ParticipantSchedulePage() {
  const query = useParticipantEnrollments();
  const accepted = (query.data?.applications || []).filter(enrollment => enrollment.applicationStatus === 'accepted');
  return <div className="participant-wrap participant-route-page page-enter">
    <ParticipantRouteHeading title="Schedule" summary="Sessions planned for your cohort, with mentoring appointments alongside them." />
    {query.isLoading ? <div className="loading-panel" role="status" aria-busy="true"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <ParticipantPageError retry={() => void query.refetch()} />
        : !accepted.length ? <div id="participant-sessions" className="empty-panel"><span className="empty-icon"><CalendarDays size={20} /></span><h2>{t('Your schedule is being prepared.')}</h2><p>{t('Sessions and mentoring will appear here when you are accepted into a program.')}</p></div>
          : <div className="participant-route-stack">
            <section id="participant-sessions" className="participant-route-section"><div className="participant-route-section-title"><h2>{t('Sessions')}</h2><p>{t('Sessions planned for your cohort.')}</p></div>{accepted.map(enrollment => <ParticipantSessionsSection key={enrollment.applicationId} enrollment={enrollment} />)}</section>
            <section id="participant-mentoring" className="participant-route-section"><div className="participant-route-section-title"><h2>{t('Mentoring')}</h2><p>{t('Bookings with your assigned mentor.')}</p></div>{accepted.map(enrollment => <ParticipantMentoringSection key={enrollment.applicationId} enrollment={enrollment} />)}</section>
          </div>}
  </div>;
}

function ParticipantSessionsSection({ enrollment }: { enrollment: ParticipantEnrollment }) {
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const scheduled = enrollment.sessions.filter(session => session.status === 'scheduled').sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate));
  const displayedSessions = calendarDate
    ? enrollment.sessions.filter(session => session.scheduledDate.slice(0, 10) === calendarDate)
    : enrollment.sessions;
  return <section className="participant-section participant-sessions-section" data-testid={`participant-sessions-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('What’s coming up')}</h2><p>{t('Sessions planned for your cohort.')}</p></div><span className="badge badge-neutral">{scheduled.length} {t('upcoming')}</span></div>
    {enrollment.sessions.length === 0
      ? <div className="participant-empty-line" data-testid={`participant-sessions-empty-${enrollment.applicationId}`}><CalendarDays size={17} aria-hidden="true" /><p>{t('No sessions yet. Your cohort schedule will appear here.')}</p></div>
      : <div className="participant-grid"><div className="participant-card">
        <h3>{t('Sessions')}</h3>
        <SessionCalendar sessions={enrollment.sessions} selectedDate={calendarDate} onSelectDate={setCalendarDate} />
        {!displayedSessions.length
          ? <p className="session-info">{t('No sessions are scheduled for this date. Choose another day or show all dates.')}</p>
          : displayedSessions.map(session => <div className="participant-entry" id={`participant-session-${session.id}`} key={session.id} data-testid={`session-participant-${session.id}`}>
            <div className="date-block"><b>{new Date(`${session.scheduledDate}T12:00:00`).getDate()}</b><span>{new Date(`${session.scheduledDate}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: 'short' }).toUpperCase()}</span></div>
            <div className="participant-entry-copy"><b>{session.title}</b><span>{participantWord(session.type)} · {participantWord(session.deliveryMode)}{session.startTime ? ` · ${session.startTime}` : ''}{session.facilitator ? ` · ${session.facilitator}` : ''}</span>{session.location && <span><MapPin size={11} /> {session.location}</span>}<div className="participant-entry-links">{session.zoomUrl && session.status === 'scheduled' && <EditorialButton asChild variant="primary" size="md" className="participant-session-join min-h-11"><a href={session.zoomUrl} target="_blank" rel="noopener noreferrer"><Video size={16} aria-hidden="true" /> {t('Join session')}</a></EditorialButton>}</div><SessionRecordingPlayer url={session.recordingUrl} title={session.title} /><ParticipantSessionInteractions sessionId={session.id} programId={enrollment.program.id} businessName={enrollment.business?.businessName} /></div>
            <span className={`badge ${participantStatusClass(session.status)}`}>{participantWord(session.status)}</span>
          </div>)}
      </div></div>}
  </section>;
}

function meetingDateTime(value: string, timezone?: string | null) {
  const date = new Date(value);
  const locale = currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
}

function ParticipantMentoringSection({ enrollment }: { enrollment: ParticipantEnrollment }) {
  const meetings = [...enrollment.calendlyMeetings.map(meeting => ({ ...meeting, bookingProvider: 'Calendly' })), ...enrollment.googleCalendarMeetings.map(meeting => ({ ...meeting, bookingProvider: 'Google Calendar' }))]
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const mentorSupport = enrollment.support.filter(item => item.type === 'mentor');
  const bookingUrl = mentorSupport.find(item => item.mentorBookingUrl)?.mentorBookingUrl;
  return <section className="participant-section" data-testid={`calendly-meetings-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Mentoring appointments')}</h2><p>{t('Bookings with your assigned mentor.')}</p></div></div>
    {meetings.length === 0 && mentorSupport.length === 0
      ? <div className="participant-card"><div className="participant-empty-line" data-testid={`participant-mentoring-empty-${enrollment.applicationId}`}><Handshake size={17} aria-hidden="true" /><p>{t('No mentoring sessions or mentor support are arranged yet.')}</p></div></div>
      : <div className="participant-grid">
        <div className="participant-card"><h3>{t('Booked mentoring sessions')}</h3>{meetings.length === 0
          ? <div className="participant-empty-line"><CalendarDays size={17} aria-hidden="true" /><p>{t('No mentoring sessions are booked yet.')}</p>{bookingUrl && <a href={bookingUrl} target="_blank" rel="noreferrer"><CalendarDays size={13} />{t('Book mentoring session')}</a>}</div>
          : meetings.map(meeting => <div className="participant-entry" key={`${meeting.bookingProvider}-${meeting.id}`} data-testid={`meeting-participant-${meeting.bookingProvider}-${meeting.id}`}><div className="calendar-icon"><CalendarDays size={16} /></div><div className="participant-entry-copy"><b>{t(meeting.eventName)}</b><span>{meetingDateTime(meeting.startsAt, meeting.timezone)} – {meetingDateTime(meeting.endsAt, meeting.timezone)}</span><span>{meeting.bookingProvider}</span>{meeting.timezone && <span>{meeting.timezone}</span>}</div><span className={`badge ${participantStatusClass(meeting.status)}`}>{participantWord(meeting.status)}</span></div>)}</div>
        <div className="participant-card"><h3>{t('Mentor support')}</h3>{mentorSupport.length
          ? mentorSupport.map(item => <div className="participant-entry" key={item.id} data-testid={`support-participant-${item.id}`}><div className="calendar-icon"><Handshake size={16} /></div><div className="participant-entry-copy"><b>{item.topic}</b><span>{participantWord(item.type)} {t('with')} {item.provider}{item.scheduledDate ? ` · ${participantDateText(item.scheduledDate)}` : ''}</span>{item.mentorBookingUrl && <div className="participant-entry-links"><a href={item.mentorBookingUrl} target="_blank" rel="noreferrer"><CalendarDays size={12} /> {t('Book mentoring session')}</a></div>}</div><span className={`badge ${participantStatusClass(item.status)}`}>{participantWord(item.status)}</span></div>)
          : <div className="participant-empty-line"><Handshake size={17} aria-hidden="true" /><p>{t('No mentor support is scheduled yet.')}</p></div>}</div>
      </div>}
  </section>;
}
