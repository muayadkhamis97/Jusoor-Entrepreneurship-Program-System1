import { currentLanguage, t, useAppLanguage } from './language';
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetParticipantDashboardQueryKey, getListAnnouncementsQueryKey, getListProgramsQueryKey, useCreateAnnouncement, useDeleteAnnouncement, useListAnnouncements, useListPrograms, useMarkAnnouncementRead } from '@workspace/api-client-react';
import type { Announcement, AnnouncementInput, ParticipantAnnouncement } from '@workspace/api-client-react';
import { AlertCircle, Bell, CalendarClock, Check, CheckCheck, Clock3, Megaphone, Plus, Trash2, Video } from 'lucide-react';
import { SessionRecordingPlayer } from './session-recording-player';
import './calendar-communications.css';

const fmtDate = (value: string) => new Date(value).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function CommunicationsPage() {
  useAppLanguage();
  const announcementsQuery = useListAnnouncements({ query: { queryKey: getListAnnouncementsQueryKey() } });
  const programsQuery = useListPrograms(undefined, { query: { queryKey: getListProgramsQueryKey() } });
  const create = useCreateAnnouncement();
  const remove = useDeleteAnnouncement();
  const client = useQueryClient();
  const [kind, setKind] = useState<'update' | 'reminder'>('update');
  const [cohort, setCohort] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'scheduled'>('all');
  const [notice, setNotice] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const now = new Date();
  const announcements = announcementsQuery.data || [];
  const visible = useMemo(() => announcements.filter(item => filter === 'all' || item.status === filter).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)), [announcements, filter]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    const input: AnnouncementInput = {
      ...(cohort ? { programId: Number(cohort) } : { programId: null }),
      kind,
      title: title.trim(),
      body: body.trim(),
      ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
    };
    create.mutate({ data: input }, {
      onSuccess: result => {
        setTitle(''); setBody(''); setScheduledFor('');
        setNotice(result.status === 'scheduled' ? 'Reminder scheduled for the selected cohort.' : 'Announcement published to the cohort.');
        void Promise.all([
          client.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }),
          client.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() }),
        ]);
      },
    });
  };
  const deleteAnnouncement = (item: Announcement) => {
    remove.mutate({ id: item.id }, { onSuccess: () => {
      setConfirmingDelete(null);
      void Promise.all([client.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }), client.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() })]);
    } });
  };
  const programs = programsQuery.data || [];

  return <main className="communications-page">
    <div className="page-heading"><div><div className="eyebrow">{t('COHORT CARE / COORDINATOR BROADCASTS')}</div><h1 className="app-title">{t('Communications')}</h1><p>{t('Keep every cohort informed with one clear update at a time.')}</p></div></div>
    <section className="communications-intro"><span className="communications-emblem"><Megaphone size={19} /></span><div><div className="eyebrow">{t('IN-APP ONLY')}</div><b>{t('One reliable place for what founders need to know.')}</b><p>{t('Published notes appear in the private participant portal. Share an update now or schedule a message for later.')}</p></div><span className="privacy-mark">{t('PRIVATE')}<br />{t('PORTAL')}</span></section>
    <div className="communications-layout">
      <section className="compose-panel panel">
        <header className="panel-heading"><div><div className="eyebrow">{t('WRITE TO A COHORT')}</div><h2 className="app-title">{t('New announcement')}</h2></div><span className="compose-index">01</span></header>
        <form className="announcement-form" onSubmit={save}>
          <label className="field"><span>{t('Audience')}</span><select className="form-control" value={cohort} onChange={event => setCohort(event.target.value)} disabled={programsQuery.isLoading} data-testid="select-announcement-cohort"><option value="">{t('All cohorts')}</option>{programs.map(program => <option value={String(program.id)} key={program.id}>{program.name}</option>)}</select><small>{t(programsQuery.isError ? 'Cohort choices could not load. Retry to target a specific cohort.' : 'Choose one cohort or share with every cohort.')}</small>{programsQuery.isError && <button type="button" className="text-link" onClick={() => void programsQuery.refetch()}>{t('Retry cohort list')}</button>}</label>
          <fieldset className="kind-choice"><legend>{t('Message type')}</legend><label className={kind === 'update' ? 'selected' : ''}><input type="radio" name="announcement-kind" value="update" checked={kind === 'update'} onChange={() => setKind('update')} /><Megaphone size={15} /><span><b>{t('Update')}</b><small>{t('News and important context')}</small></span></label><label className={kind === 'reminder' ? 'selected' : ''}><input type="radio" name="announcement-kind" value="reminder" checked={kind === 'reminder'} onChange={() => setKind('reminder')} /><Bell size={15} /><span><b>{t('Reminder')}</b><small>{t('A date or action to remember')}</small></span></label></fieldset>
          <label className="field"><span>{t('Title')} <i>*</i></span><input className="form-control" value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={180} placeholder={t('A clear subject line')} data-testid="input-announcement-title" /></label>
          <label className="field"><span>{t('Message')} <i>*</i></span><textarea className="form-control" value={body} onChange={event => setBody(event.target.value)} required minLength={5} maxLength={5000} rows={5} placeholder={t('Share the details founders need. Keep it useful and specific.')} data-testid="input-announcement-body" /><small>{body.length} / {t('5,000 characters')}</small></label>
          <label className="field"><span>{t('Schedule for later')} <small className="optional-label">{t('optional')}</small></span><input className="form-control" type="datetime-local" min={localDateTime(now)} value={scheduledFor} onChange={event => setScheduledFor(event.target.value)} data-testid="input-announcement-schedule" /><small>{t('Leave blank to publish immediately.')}</small></label>
          {create.isError && <div className="form-error" role="alert"><AlertCircle size={15} />{t('Could not save this message. Check the fields and try again.')}</div>}
          {notice && <div className="communication-success" role="status"><Check size={16} />{notice}</div>}
          <button type="submit" className="button button-primary announcement-submit" disabled={create.isPending || programsQuery.isLoading} data-testid="button-publish-announcement">{create.isPending ? t('Saving message…') : <>{scheduledFor ? <CalendarClock size={15} /> : <Plus size={15} />}{scheduledFor ? t(`Schedule ${kind}`) : t('Publish to portal')}</>}</button>
        </form>
      </section>
      <section className="announcement-list-panel">
        <header className="panel-heading"><div><div className="eyebrow">COHORT NOTICEBOARD</div><h2 className="app-title">Recent messages</h2></div><span className="badge badge-neutral">{announcements.length} total</span></header>
        <div className="communication-filters" role="group" aria-label="Filter announcements">{(['all', 'published', 'scheduled'] as const).map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value} data-testid={`button-announcement-filter-${value}`}>{value === 'all' ? 'All' : value === 'published' ? 'Published' : 'Scheduled'}</button>)}</div>
        {announcementsQuery.isLoading ? <div className="loading-panel"><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
          : announcementsQuery.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><AlertCircle size={20} /></span><h3>Messages could not load.</h3><p>Your cohort notices are unchanged. Try again.</p><button className="button button-outline" onClick={() => void announcementsQuery.refetch()} data-testid="button-retry-announcements">Retry messages</button></div>
          : !visible.length ? <div className="empty-panel communications-empty"><span className="empty-icon"><Megaphone size={20} /></span><h3>{announcements.length ? 'Nothing in this view.' : 'The noticeboard is clear.'}</h3><p>{announcements.length ? 'Switch the filter to see other messages.' : 'Publish an update or schedule a reminder to keep founders in the loop.'}</p></div>
          : <div className="announcement-list">{visible.map(item => <article className="announcement-card" key={item.id} data-testid={`card-announcement-${item.id}`}><div className={`announcement-kind-mark ${item.kind}`} aria-hidden="true">{item.kind === 'reminder' ? <Bell size={15} /> : <Megaphone size={15} />}</div><div className="announcement-copy"><div className="announcement-meta"><span className={`announcement-status ${item.status}`}>{item.status === 'scheduled' ? 'Scheduled' : 'Published'}</span><span>{item.kind === 'reminder' ? 'Reminder' : 'Update'}</span><span>{item.programName || 'All cohorts'}</span></div><h3>{item.title}</h3><p>{item.body}</p><small><Clock3 size={12} />{item.status === 'scheduled' ? 'Goes live ' : 'Shared '}{fmtDate(item.scheduledFor)}</small>{confirmingDelete === item.id && <div className="announcement-confirm" role="group" aria-label={`Confirm removing ${item.title}`}><span>Remove this announcement?</span><button type="button" className="button button-quiet" onClick={() => setConfirmingDelete(null)}>Keep</button><button type="button" className="button button-danger" onClick={() => deleteAnnouncement(item)} disabled={remove.isPending} data-testid={`button-confirm-delete-announcement-${item.id}`}>{remove.isPending ? 'Removing…' : 'Remove'}</button></div>}{remove.isError && confirmingDelete === item.id && <div className="form-error" role="alert">Could not remove this message. Please try again.</div>}</div>{confirmingDelete !== item.id && <button type="button" className="icon-button icon-danger announcement-delete" onClick={() => setConfirmingDelete(item.id)} aria-label={`Remove ${item.title}`} data-testid={`button-delete-announcement-${item.id}`}><Trash2 size={15} /></button>}</article>)}</div>}
      </section>
    </div>
    <p className="communications-privacy"><CheckCheck size={14} /> Only published announcements are visible to participants. Scheduled messages remain in coordinator view until their release time.</p>
  </main>;
}

export function ParticipantAnnouncements({ announcements }: { announcements: ParticipantAnnouncement[] }) {
  useAppLanguage();
  const markRead = useMarkAnnouncementRead();
  const client = useQueryClient();
  const [openRecordingId, setOpenRecordingId] = useState<number | null>(null);
  const published = announcements.filter(item => new Date(item.scheduledFor).getTime() <= Date.now()).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  const unread = published.filter(item => !item.readAt).length;
  const readOne = (item: ParticipantAnnouncement) => {
    if (item.readAt || markRead.isPending) return;
    markRead.mutate({ id: item.id }, { onSuccess: () => {
      void client.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
    } });
  };
  return <section className="participant-section participant-announcements" data-testid="participant-announcements">
    <div className="participant-section-head"><div><div className="eyebrow">{t('FROM YOUR PROGRAM TEAM')}</div><h2>{t('Updates & reminders')}</h2><p>{t('Important notes from your cohort, gathered here.')}</p></div><span className={`badge ${unread ? 'badge-warm' : 'badge-good'}`}>{unread ? `${unread} ${t('unread')}` : t('All caught up')}</span></div>
    {markRead.isError && <div className="form-error" role="alert"><AlertCircle size={15} />{t('We couldn’t update read status. Try again.')}</div>}
    {!published.length ? <div className="empty-panel participant-announcement-empty"><span className="empty-icon"><Megaphone size={19} /></span><h3>{t('No announcements just yet.')}</h3><p>{t('When your coordinators share a cohort update or reminder, you’ll find it here.')}</p></div>
      : <div className="participant-announcement-list">{published.map(item => <article key={item.id} className={`participant-announcement ${item.readAt ? 'is-read' : 'is-unread'}`} data-testid={`participant-announcement-${item.id}`}>
        <span className={`participant-announcement-icon ${item.kind}`}>{item.kind === 'reminder' ? <Bell size={16} /> : <Megaphone size={16} />}</span>
        <div className="participant-announcement-copy">
          <div className="announcement-meta"><span>{t(item.sessionId ? 'Recording' : item.kind === 'reminder' ? 'Reminder' : 'Cohort update')}</span><span>{item.programName || t('All cohorts')}</span></div>
          <h3>{item.title}</h3><p>{item.body}</p>
          {item.sessionId && item.sessionTitle && item.sessionDate && <p className="recording-session-details">{item.sessionTitle} · {new Date(`${item.sessionDate}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
          <time dateTime={item.scheduledFor}>{fmtDate(item.scheduledFor)}</time>
          {item.sessionId && item.recordingUrl && item.sessionTitle && <div className="participant-recording-action">
            <button type="button" className="button button-outline" aria-expanded={openRecordingId === item.id} onClick={() => setOpenRecordingId(openRecordingId === item.id ? null : item.id)} data-testid={`button-watch-recording-${item.id}`}>
              <Video size={14} />{openRecordingId === item.id ? t('Close recording') : t('Watch recording')}
            </button>
            {openRecordingId === item.id && <SessionRecordingPlayer url={item.recordingUrl} title={item.sessionTitle} />}
          </div>}
        </div>
        {item.readAt ? <span className="read-indicator"><Check size={14} /> {t('Read')}</span> : <button type="button" className="button button-quiet mark-read-button" onClick={() => readOne(item)} disabled={markRead.isPending} data-testid={`button-mark-announcement-read-${item.id}`}>{markRead.isPending ? t('Saving…') : t('Mark as read')}</button>}
      </article>)}</div>}
  </section>;
}
