import './workspace.css';
import './role-workspace.css';
import './role-access.css';
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  getGetAuthMeQueryKey, getGetBusinessQueryKey, getGetDashboardQueryKey, getGetMentorBookingStatusQueryKey, getGetZoomStatusQueryKey, getListBusinessesQueryKey,
  getListPitchesQueryKey, getListProgramsQueryKey, getListSessionsQueryKey, getListStaffQueryKey, getListPitchJudgesQueryKey,
  getListSupportQueryKey, useCreateBusiness, useCreatePitch, useCreateProgram,
  useCreateOrUpdateZoomMeeting, useCreateSession, useCreateStaff, useCreateSupport, useDeleteBusiness, useDeletePitch,
  useDeleteProgram, useDeleteSession, useDeleteSupport, useGetBusiness,
  useDeleteStaff, useDisconnectZoom, useGetAuthMe, useGetDashboard, useGetZoomStatus, useListBusinesses, useListPitches, useListPrograms,
  useListSessions, useListStaff, useListSupport, useGetMentorBookingStatus, useUpdateBusiness, useUpdatePitch,
  useStartZoomConnection, useSyncZoomRecording, useUpdateProgram, useUpdateSession, useUpdateSupport,
  useUpdateStaff, useAssignPitchJudge, useRemovePitchJudge, useListPitchJudges,
} from '@workspace/api-client-react';
import type {
  Business, BusinessInput, BusinessStage, BusinessUpdate, PitchInput,
  PitchRecord, PitchUpdate, Program, ProgramInput, ProgramUpdate,
  Session, SessionInput, SessionUpdate, SupportEngagement, SupportInput,
  StaffInput, StaffMember, StaffUpdate, SupportUpdate,
} from '@workspace/api-client-react';
import {
  Activity, ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness,
  CalendarCheck, CalendarDays, Check, ChevronDown, CircleAlert, ExternalLink, LogOut, RefreshCw,
  FileText, Filter, Handshake, LayoutDashboard, MapPin,
  Pencil, Plus, Search, Shield, Sparkles, Trash2, Trophy, UserPlus, Users, Video, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ApplicationsReviewPage, ApplyPage, ParticipantDashboardPage } from './intake-surfaces';
import { CourseManagementPage } from './course-surfaces';
import { JudgeDashboardPage, MentorDashboardPage, RoleFrame, RoleNotFound, TrainerDashboardPage } from './role-surfaces';
import { RoleAccessPage } from './role-access';
import { SessionCalendar } from './session-calendar';
import { CommunicationsPage } from './communications-surfaces';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

type Field = { name: string; label: string; kind?: 'text' | 'email' | 'date' | 'time' | 'number' | 'url' | 'textarea' | 'select'; options?: { value: string; label: string }[]; required?: boolean; wide?: boolean; placeholder?: string; min?: number; max?: number; step?: number };
type Values = Record<string, string>;

const stageNames: Record<string, string> = {
  application: 'Application', bootcamp: 'Bootcamp', incubator: 'Incubation',
  pitch: 'Pitch day', demo_day: 'Demo day', grant_awarded: 'Grant awarded',
  alumni: 'Alumni', declined: 'Declined',
};
const businessStages: BusinessStage[] = ['application', 'bootcamp', 'incubator', 'pitch', 'demo_day', 'grant_awarded', 'alumni', 'declined'];
const dateLabel = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const money = (value?: number | null) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
const display = (v?: string | null) => v ? v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';
const statusTone = (status: string) => {
  if (['active', 'completed', 'scheduled', 'awarded', 'grant_awarded', 'incubator'].includes(status)) return 'good';
  if (['declined', 'cancelled', 'not_awarded'].includes(status)) return 'bad';
  if (['planning', 'outreach', 'requested', 'pending', 'application'].includes(status)) return 'warm';
  return 'neutral';
};

function invalidate(queryClient: ReturnType<typeof useQueryClient>, keys: readonly (readonly unknown[])[]) {
  keys.forEach(queryKey => { void queryClient.invalidateQueries({ queryKey }); });
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object' || !('data' in error)) return fallback;
  const data = error.data;
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  return fallback;
}

function FieldControl({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  const common = { value, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value), required: field.required, placeholder: field.placeholder, 'data-testid': `input-${field.name}` };
  if (field.kind === 'textarea') return <textarea {...common} rows={3} className="form-control resize-y" />;
  if (field.kind === 'select') return <select {...common} className="form-control"><option value="">Choose…</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  return <input {...common} type={field.kind || 'text'} min={field.min ?? (field.kind === 'number' ? '0' : undefined)} max={field.max} step={field.step} className="form-control" />;
}

function FormDialog({ title, description, fields, initial, loading, onClose, onSubmit, error }: {
  title: string; description?: string; fields: Field[]; initial?: Values; loading?: boolean;
  onClose: () => void; onSubmit: (values: Values) => void; error?: string;
}) {
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map(f => [f.name, initial?.[f.name] ?? ''])));
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modal-head"><div><div className="eyebrow">PROGRAM HUB / RECORD</div><h2 id="dialog-title" className="app-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose} data-testid="button-close-dialog"><X size={18} /></button></div>
      <form onSubmit={e => { e.preventDefault(); onSubmit(values); }} className="modal-form">
        <div className="form-grid">{fields.map(field => <label key={field.name} className={`field ${field.wide ? 'field-wide' : ''}`}><span>{field.label}{field.required && <i> *</i>}</span><FieldControl field={field} value={values[field.name] || ''} onChange={value => setValues(previous => ({ ...previous, [field.name]: value }))} /></label>)}</div>
        {error && <div className="form-error"><CircleAlert size={16} />{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} data-testid="button-cancel">Cancel</button><button className="button button-primary" type="submit" disabled={loading} data-testid="button-save">{loading ? 'Saving…' : <><Check size={16} /> Save record</>}</button></div>
      </form>
    </section>
  </div>;
}

function ConfirmDialog({ item, onCancel, onConfirm, loading, error }: { item: string; onCancel: () => void; onConfirm: () => void; loading?: boolean; error?: string }) {
  return <div className="modal-backdrop" role="presentation"><section className="confirm-card" role="alertdialog" aria-modal="true">
    <div className="confirm-symbol"><Trash2 size={20} /></div><h2 className="app-title">Remove this record?</h2><p><strong>{item}</strong> will be permanently removed from the workspace. This cannot be undone.</p>
    {error && <div className="form-error"><CircleAlert size={16} />{error}</div>}
    <div className="modal-actions"><button className="button button-quiet" onClick={onCancel} data-testid="button-keep-record">Keep record</button><button className="button button-danger" onClick={onConfirm} disabled={loading} data-testid="button-confirm-delete">{loading ? 'Removing…' : 'Remove record'}</button></div>
  </section></div>;
}

function Shell({ children, staff, displayName }: { children: ReactNode; staff: StaffMember; displayName: string }) {
  const [path] = useLocation();
  const { signOut } = useClerk();
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/businesses', label: 'Businesses', icon: BriefcaseBusiness },
    { href: '/programs', label: 'Programs', icon: Activity },
    { href: '/sessions', label: 'Sessions', icon: CalendarDays },
    ...(staff.role === 'coordinator' ? [{ href: '/communications', label: 'Communications', icon: Activity }] : []),
    { href: '/support', label: 'Support', icon: Handshake },
    { href: '/pitches', label: 'Pitch & grants', icon: Trophy },
    ...(staff.role === 'coordinator' ? [{ href: '/courses', label: 'Learning', icon: BookOpen }, { href: '/applications', label: 'Applications', icon: FileText }, { href: '/mentor-booking', label: 'Mentor booking', icon: CalendarCheck }, { href: '/team', label: 'Team access', icon: Shield }, { href: '/access', label: 'Role access', icon: Shield }] : []),
  ];
  const label = nav.find(item => item.href === path)?.label || 'Workspace';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'J';
  return <div className="workspace noise">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark">J</span><span><b>Jusoor</b><small>PROGRAM HUB</small></span></Link>
      <div className="workspace-tag"><span className="live-dot" /> PROGRAM OPERATIONS</div>
      <nav className="side-nav" aria-label="Main navigation">{nav.map(item => {
        const Icon = item.icon; const active = path === item.href;
        return <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.href === '/businesses' && <span className="nav-rail" />}</Link>;
      })}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Sparkles size={15} /><div><b>One journey, in view.</b><span>Move each founder forward.</span></div></div>
        <div className="profile"><div className="profile-avatar">{initials}</div><div className="profile-copy"><b>{displayName}</b><small>{staff.role === 'coordinator' ? 'Jusoor coordinator' : 'Program staff'}</small></div><button type="button" className="profile-signout" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label="Sign out"><LogOut size={15} /></button></div>
      </div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="crumb"><span>JUSOOR</span><span className="crumb-slash">/</span><b>{label}</b></div><div className="topbar-actions"><span className="today-label"><CalendarDays size={14} /> {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="role-chip">{staff.role === 'coordinator' ? 'COORDINATOR' : 'STAFF'}</span></div></header>
      <div className="mobile-nav">{nav.map(item => <Link href={item.href} key={item.href} className={path === item.href ? 'mobile-active' : ''} aria-label={item.label}><item.icon size={18} /></Link>)}<button type="button" className="mobile-signout" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label="Sign out"><LogOut size={17} /></button></div>
      <div className="page-content page-enter">{children}</div>
      <footer className="footer"><span>JUSOOR ENTREPRENEURSHIP PROGRAM</span><span>PROGRAM OPERATIONS <i /> FIELD NOTES</span></footer>
    </main>
  </div>;
}

function PageHeading({ kicker, title, summary, action }: { kicker: string; title: string; summary: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1 className="app-title">{title}</h1><p>{summary}</p></div>{action}</div>;
}

function LoadingState({ label = 'Loading program records' }: { label?: string }) {
  return <div className="loading-panel" aria-label={label}><div className="skeleton skeleton-wide" /><div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <div className="empty-panel error-panel"><div className="empty-icon"><CircleAlert size={22} /></div><h3>We couldn't load this view.</h3><p>Your records are safe. Try connecting again.</p><button className="button button-outline" onClick={retry} data-testid="button-retry"><Activity size={15} /> Retry connection</button></div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-panel"><div className="empty-icon"><FileText size={21} /></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`badge badge-${statusTone(value)}`}><span />{label || display(value)}</span>;
}

function Metric({ label, value, hint, icon: Icon, accent, trend }: { label: string; value: string | number; hint: string; icon: typeof Users; accent?: string; trend?: string }) {
  return <article className={`metric-card ${accent || ''}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div><strong className="metric-value">{value}</strong><div className="metric-bottom"><span>{hint}</span>{trend && <span className="metric-trend"><ArrowUpRight size={13} />{trend}</span>}</div></article>;
}

function Overview() {
  const query = useGetDashboard(); const dashboard = query.data;
  const stages = dashboard?.stageCounts || [];
  const max = Math.max(1, ...stages.map(stage => stage.count));
  if (query.isLoading) return <><PageHeading kicker="OPERATIONS / LIVE VIEW" title="Good work, moving." summary="A clear view of the founders, milestones and next moments in your program." /><LoadingState /></>;
  if (query.isError || !dashboard) return <><PageHeading kicker="OPERATIONS / LIVE VIEW" title="Good work, moving." summary="A clear view of the founders, milestones and next moments in your program." /><ErrorState retry={() => void query.refetch()} /></>;
  return <>
    <PageHeading kicker="OPERATIONS / LIVE VIEW" title="Good work, moving." summary="A clear view of the founders, milestones and next moments in your program." action={<Link href="/businesses" className="button button-primary"><Plus size={16} /> Add a business</Link>} />
    <section className="metric-grid">
      <Metric label="Active programs" value={dashboard.programs} hint="Cohorts in motion" icon={Activity} trend="across formats" />
      <Metric label="Applications" value={dashboard.applications} hint="In the pipeline" icon={Users} accent="metric-coral" />
      <Metric label="In incubation" value={dashboard.incubatorBusinesses} hint="Building with support" icon={BriefcaseBusiness} accent="metric-sand" />
      <Metric label="Support in progress" value={dashboard.supportInProgress} hint="Engagements underway" icon={Handshake} />
      <Metric label="Grants awarded" value={dashboard.grantsAwarded} hint={money(dashboard.totalGrantAmount) + ' committed'} icon={Trophy} accent="metric-coral" />
    </section>
    <div className="overview-grid">
      <section className="panel stage-panel"><div className="panel-heading"><div><div className="eyebrow">FOUNDER JOURNEY</div><h2 className="app-title">Where the work is</h2></div><Link href="/businesses" className="text-link">Open pipeline <ArrowRight size={14} /></Link></div>
        {stages.length ? <div className="stage-list">{businessStages.map((key, index) => {
          const entry = stages.find(item => item.stage === key); const count = entry?.count || 0;
          return <div className="stage-row" key={key}><span className="stage-number mono">{String(index + 1).padStart(2, '0')}</span><span className="stage-name">{stageNames[key]}</span><div className="stage-track"><div className={`stage-fill stage-fill-${index % 5}`} style={{ width: `${Math.max(count ? 8 : 0, count / max * 100)}%` }} /></div><span className="stage-count mono">{count}</span></div>;
        })}</div> : <EmptyState title="The journey starts here." body="Once founders enter the pipeline, their progress will appear across every stage." action={<Link href="/businesses" className="text-link">Add your first business <ArrowRight size={14} /></Link>} />}
        <div className="journey-foot"><span><span className="live-dot" /> THE FULL JOURNEY, AT A GLANCE</span><span>{dashboard.applications + dashboard.incubatorBusinesses} founders tracked</span></div>
      </section>
      <section className="panel upcoming-panel"><div className="panel-heading"><div><div className="eyebrow">ON THE CALENDAR</div><h2 className="app-title">Upcoming sessions</h2></div><Link href="/sessions" className="text-link">All sessions <ArrowRight size={14} /></Link></div>
        <div className="session-preview-list">{dashboard.upcomingSessions.length ? dashboard.upcomingSessions.slice(0, 5).map(session => {
          const hasZoom = session.deliveryMode !== 'in_person' && Boolean(session.zoomUrl);
          return <div className="session-preview" key={session.id}><div className="date-block"><b>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).getDate()}</b><span>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</span></div><div className="session-info"><b>{session.title}</b><span>{display(session.type)} · {display(session.deliveryMode)}{session.startTime ? ` · ${session.startTime}` : ''}{session.location ? ` · ${session.location}` : ''}</span></div>{hasZoom ? <a href={session.zoomUrl!} target="_blank" rel="noreferrer" className="session-join" aria-label={`Join ${session.title} on Zoom`}><Video size={15} /></a> : <span className="session-join disabled" aria-label={session.deliveryMode === 'in_person' ? 'In-person session' : 'No Zoom link available'}><Video size={15} /></span>}</div>;
        }) : <EmptyState title="Nothing on the calendar yet." body="Schedule a bootcamp, training or pitch event to give the cohort its next milestone." action={<Link href="/sessions" className="text-link">Plan a session <ArrowRight size={14} /></Link>} />}</div>
      </section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><div className="eyebrow">LATEST MOVEMENT</div><h2 className="app-title">Recently added businesses</h2></div><Link href="/businesses" className="text-link">View pipeline <ArrowRight size={14} /></Link></div>
      {dashboard.recentBusinesses.length ? <div className="table-wrap"><table><thead><tr><th>BUSINESS / FOUNDER</th><th>INDUSTRY</th><th>STAGE</th><th>APPLIED</th><th /></tr></thead><tbody>{dashboard.recentBusinesses.slice(0, 5).map(business => <tr key={business.id}><td><div className="company-cell"><span className="company-monogram">{business.businessName.slice(0, 1).toUpperCase()}</span><span><b>{business.businessName}</b><small>{business.founderName}</small></span></div></td><td>{business.industry || '—'}</td><td><Badge value={business.stage} label={stageNames[business.stage]} /></td><td>{dateLabel(business.applicationDate)}</td><td><Link href="/businesses" className="row-arrow" aria-label={`View ${business.businessName}`}><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title="No businesses added yet." body="Applications and founder records will appear here as the program gets underway." action={<Link href="/businesses" className="text-link">Add a founder <ArrowRight size={14} /></Link>} />}
    </section>
    <div className="dashboard-note"><span className="note-mark">J</span><span><b>The work is the journey.</b> Outreach to grant decision — keep every next step visible.</span><Link href="/programs">Program setup <ArrowRight size={14} /></Link></div>
  </>;
}

const programFields: Field[] = [
  { name: 'name', label: 'Program name', required: true, wide: true, placeholder: 'e.g. Spring Venture Bootcamp' },
  { name: 'format', label: 'Format', kind: 'select', required: true, options: [{ value: 'bootcamp', label: 'Bootcamp' }, { value: 'hackathon', label: 'Hackathon' }] },
  { name: 'status', label: 'Status', kind: 'select', options: ['planning', 'outreach', 'active', 'completed'].map(v => ({ value: v, label: display(v) })) },
  { name: 'applicationDeadline', label: 'Application deadline', kind: 'date' },
  { name: 'startDate', label: 'Start date', kind: 'date' },
  { name: 'endDate', label: 'End date', kind: 'date' },
  { name: 'description', label: 'Program description', kind: 'textarea', wide: true, placeholder: 'What will founders work toward?' },
];
const businessFields = (programs: Program[]): Field[] => [
  { name: 'businessName', label: 'Business name', required: true },
  { name: 'founderName', label: 'Founder name', required: true },
  { name: 'email', label: 'Email address', kind: 'email', required: true },
  { name: 'phone', label: 'Phone' },
  { name: 'programId', label: 'Program cohort', kind: 'select', required: true, options: programs.map(p => ({ value: String(p.id), label: p.name })) },
  { name: 'industry', label: 'Industry' },
  { name: 'stage', label: 'Pipeline stage', kind: 'select', options: businessStages.map(v => ({ value: v, label: stageNames[v] })) },
  { name: 'applicationDate', label: 'Application date', kind: 'date' },
  { name: 'needs', label: 'Support needs', kind: 'textarea', wide: true, placeholder: 'What would help this business progress?' },
  { name: 'notes', label: 'Coordinator notes', kind: 'textarea', wide: true },
];
const sessionFields = (programs: Program[], trainers: StaffMember[] = [], includeTrainer = false): Field[] => [
  { name: 'title', label: 'Session title', required: true, wide: true },
  { name: 'type', label: 'Session type', kind: 'select', required: true, options: ['bootcamp', 'hackathon', 'training', 'pitch_day', 'demo_day', 'other'].map(v => ({ value: v, label: display(v) })) },
  { name: 'deliveryMode', label: 'Delivery mode', kind: 'select', required: true, options: [{ value: 'online', label: 'Online' }, { value: 'in_person', label: 'In person' }, { value: 'hybrid', label: 'Hybrid' }] },
  { name: 'programId', label: 'Program cohort', kind: 'select', options: programs.map(p => ({ value: String(p.id), label: p.name })) },
  { name: 'status', label: 'Status', kind: 'select', options: ['scheduled', 'completed', 'cancelled'].map(v => ({ value: v, label: display(v) })) },
  { name: 'scheduledDate', label: 'Date', kind: 'date', required: true },
  { name: 'startTime', label: 'Start time', kind: 'time' },
  { name: 'durationMinutes', label: 'Duration (minutes)', kind: 'number', min: 15, max: 480, step: 15, required: true },
  { name: 'facilitator', label: 'Facilitator' },
  ...(includeTrainer ? [{ name: 'trainerStaffId', label: 'Assigned trainer', kind: 'select' as const, options: trainers.map(person => ({ value: String(person.id), label: person.email })) }] : []),
  { name: 'location', label: 'Location', wide: true, placeholder: 'Venue, room or meeting space' },
  { name: 'zoomUrl', label: 'Zoom meeting link', kind: 'url', wide: true, placeholder: 'https://…' },
  { name: 'recordingUrl', label: 'Recording link', kind: 'url', wide: true, placeholder: 'https://…' },
];
const supportFields = (businesses: Business[], mentors: StaffMember[] = [], includeMentor = false): Field[] => [
  { name: 'businessId', label: 'Business', kind: 'select', required: true, options: businesses.map(b => ({ value: String(b.id), label: `${b.businessName} — ${b.founderName}` })) },
  { name: 'type', label: 'Engagement type', kind: 'select', required: true, options: ['mentor', 'subject_expert', 'branding', 'technical'].map(v => ({ value: v, label: display(v) })) },
  { name: 'provider', label: 'Provider / specialist', required: true },
  ...(includeMentor ? [{ name: 'mentorStaffId', label: 'Assigned mentor', kind: 'select' as const, options: mentors.map(person => ({ value: String(person.id), label: person.email })) }] : []),
  { name: 'topic', label: 'Topic', required: true },
  { name: 'status', label: 'Status', kind: 'select', options: ['requested', 'matched', 'scheduled', 'completed'].map(v => ({ value: v, label: display(v) })) },
  { name: 'scheduledDate', label: 'Scheduled date', kind: 'date' },
  { name: 'notes', label: 'Engagement notes', kind: 'textarea', wide: true },
];
const pitchFields = (businesses: Business[]): Field[] => [
  { name: 'businessId', label: 'Business', kind: 'select', required: true, options: businesses.map(b => ({ value: String(b.id), label: b.businessName })) },
  { name: 'eventType', label: 'Event', kind: 'select', required: true, options: [{ value: 'pitch_day', label: 'Pitch day' }, { value: 'demo_day', label: 'Demo day' }] },
  { name: 'eventDate', label: 'Event date', kind: 'date', required: true },
  { name: 'score', label: 'Score (0–100)', kind: 'number' },
  { name: 'judges', label: 'Judges', wide: true, placeholder: 'Names separated by commas' },
  { name: 'grantDecision', label: 'Grant decision', kind: 'select', options: ['pending', 'awarded', 'not_awarded'].map(v => ({ value: v, label: display(v) })) },
  { name: 'grantAmount', label: 'Grant amount (USD)', kind: 'number' },
  { name: 'feedback', label: 'Evaluation feedback', kind: 'textarea', wide: true },
];
const staffRoleOptions = [
  { value: 'staff', label: 'Program staff' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'judge', label: 'Judge' },
];
const staffInviteFields: Field[] = [
  { name: 'email', label: 'Approved staff email', kind: 'email', required: true, wide: true },
  { name: 'role', label: 'Access role', kind: 'select', required: true, options: staffRoleOptions },
];
const staffRoleFields: Field[] = [
  { name: 'role', label: 'Access role', kind: 'select', required: true, options: staffRoleOptions },
];
const valueOf = (value?: string | number | null) => value == null ? '' : String(value).slice(0, 10);

function ProgramsPage() {
  const query = useListPrograms(); const programs = query.data || []; const client = useQueryClient();
  const create = useCreateProgram(); const update = useUpdateProgram(); const remove = useDeleteProgram();
  const [editing, setEditing] = useState<Program | null | undefined>(undefined); const [deleting, setDeleting] = useState<Program | null>(null);
  const save = (v: Values) => {
    const data: ProgramInput = { name: v.name.trim(), format: (v.format || 'bootcamp') as ProgramInput['format'], status: (v.status || 'planning') as ProgramInput['status'], description: v.description || null, startDate: v.startDate || null, endDate: v.endDate || null, applicationDeadline: v.applicationDeadline || null };
    const done = () => { invalidate(client, [getListProgramsQueryKey(), getGetDashboardQueryKey()]); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as ProgramUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const confirmRemove = () => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => { invalidate(client, [getListProgramsQueryKey(), getGetDashboardQueryKey()]); setDeleting(null); } });
  return <>
    <PageHeading kicker="PROGRAM MANAGEMENT / COHORTS" title="Programs" summary="Set the shape of each cohort, from first call to final milestone." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-program"><Plus size={16} /> New program</button>} />
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : programs.length === 0 ? <EmptyState title="A good program starts with a clear plan." body="Create your first cohort to define its format, application window and key dates." action={<button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> Create a program</button>} /> :
    <><div className="section-strip"><span><b>{programs.length}</b> cohorts in the workspace</span><span><span className="live-dot" /> Keep cohort dates current</span></div><div className="program-grid">{programs.map((program, index) => <article className="program-card" key={program.id} data-testid={`card-program-${program.id}`}><div className="program-card-top"><div className={`program-symbol program-symbol-${index % 3}`}>{program.format === 'bootcamp' ? 'B' : 'H'}</div><Badge value={program.status} /><div className="row-actions"><button className="icon-button" onClick={() => setEditing(program)} aria-label={`Edit ${program.name}`} data-testid={`button-edit-program-${program.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(program)} aria-label={`Delete ${program.name}`} data-testid={`button-delete-program-${program.id}`}><Trash2 size={15} /></button></div></div><div className="eyebrow">{display(program.format)} COHORT</div><h2 className="app-title">{program.name}</h2><p className="program-description">{program.description || 'A founder-focused program moving ideas into their next stage.'}</p><div className="program-dates"><div><span>APPLICATION DEADLINE</span><b>{dateLabel(program.applicationDeadline)}</b></div><div><span>PROGRAM WINDOW</span><b>{dateLabel(program.startDate)} <i>→</i> {dateLabel(program.endDate)}</b></div></div><Link href="/businesses" className="program-link">View businesses <ArrowRight size={15} /></Link></article>)}</div></>}
    {editing !== undefined && <FormDialog title={editing ? 'Edit program' : 'Create a program'} description="A cohort is the backbone of the founder journey." fields={programFields} initial={editing ? { name: editing.name, format: editing.format, status: editing.status, description: editing.description || '', startDate: valueOf(editing.startDate), endDate: valueOf(editing.endDate), applicationDeadline: valueOf(editing.applicationDeadline) } : { format: 'bootcamp', status: 'planning' }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={(create.error || update.error) ? 'Could not save this program. Check required fields and try again.' : undefined} />}
    {deleting && <ConfirmDialog item={deleting.name} onCancel={() => setDeleting(null)} onConfirm={confirmRemove} loading={remove.isPending} />}
  </>;
}

function BusinessEditDialog({ business, programs, onClose, onSave, loading, error }: { business: Business; programs: Program[]; onClose: () => void; onSave: (values: Values) => void; loading: boolean; error?: string }) {
  const record = useGetBusiness(business.id, { query: { queryKey: getGetBusinessQueryKey(business.id) } });
  const source = record.data || business;
  return <FormDialog title="Edit business" description={record.isLoading ? 'Refreshing founder record…' : 'Keep the founder profile and next stage up to date.'} fields={businessFields(programs)} initial={{ businessName: source.businessName, founderName: source.founderName, email: source.email, phone: source.phone || '', programId: String(source.programId), industry: source.industry || '', stage: source.stage, applicationDate: valueOf(source.applicationDate), needs: source.needs || '', notes: source.notes || '' }} loading={loading || record.isLoading} onClose={onClose} onSubmit={onSave} error={error || (record.isError ? 'Showing the latest available list record.' : undefined)} />;
}

function BusinessesPage() {
  const [search, setSearch] = useState(''); const [stage, setStage] = useState(''); const [editing, setEditing] = useState<Business | null | undefined>(undefined); const [deleting, setDeleting] = useState<Business | null>(null);
  const params = useMemo(() => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(stage ? { stage: stage as BusinessStage } : {}) }), [search, stage]);
  const query = useListBusinesses(params); const programsQuery = useListPrograms(); const programs = programsQuery.data || []; const businesses = query.data || []; const client = useQueryClient();
  const create = useCreateBusiness(); const update = useUpdateBusiness(); const remove = useDeleteBusiness();
  const save = (v: Values) => {
    const data: BusinessInput = { programId: Number(v.programId), businessName: v.businessName.trim(), founderName: v.founderName.trim(), email: v.email.trim(), phone: v.phone || null, industry: v.industry || null, stage: (v.stage || 'application') as BusinessStage, applicationDate: v.applicationDate || null, needs: v.needs || null, notes: v.notes || null };
    const done = () => { invalidate(client, [getListBusinessesQueryKey(), getGetDashboardQueryKey()]); if (editing) invalidate(client, [getGetBusinessQueryKey(editing.id)]); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as BusinessUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const confirmRemove = () => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => { invalidate(client, [getListBusinessesQueryKey(), getGetDashboardQueryKey()]); setDeleting(null); } });
  return <>
    <PageHeading kicker="FOUNDER JOURNEY / PIPELINE" title="Businesses" summary="Every founder, application and next stage — in one working view." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-business"><Plus size={16} /> Add business</button>} />
    <section className="pipeline-ribbon"><div className="ribbon-heading"><div className="eyebrow">JUSOOR JOURNEY</div><span>Follow progress, not just applications.</span></div><div className="ribbon-stages">{businessStages.slice(0, 7).map((s, i) => <div className="ribbon-stage" key={s}><span className={`ribbon-dot dot-${i}`} />{stageNames[s]}{i < 6 && <i />}</div>)}</div></section>
    <section className="list-panel panel"><div className="toolbar"><div className="search-box"><Search size={16} /><input type="search" aria-label="Search businesses" placeholder="Search business, founder, email…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-businesses" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</div><label className="filter-select"><Filter size={15} /><select value={stage} aria-label="Filter businesses by stage" onChange={e => setStage(e.target.value)} data-testid="select-business-stage"><option value="">All stages</option>{businessStages.map(s => <option key={s} value={s}>{stageNames[s]}</option>)}</select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{businesses.length}</b> records</div></div>
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : businesses.length === 0 ? <EmptyState title={search || stage ? 'No matching businesses.' : 'The founder pipeline is ready.'} body={search || stage ? 'Try a different search or clear the stage filter.' : 'Add a business or applicant and start tracking the next step.'} action={search || stage ? <button className="button button-outline" onClick={() => { setSearch(''); setStage(''); }}>Clear filters</button> : <button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> Add a business</button>} /> :
      <div className="table-wrap"><table><thead><tr><th>BUSINESS / FOUNDER</th><th>PROGRAM</th><th>INDUSTRY</th><th>STAGE</th><th>APPLIED</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{businesses.map(business => <tr key={business.id} data-testid={`row-business-${business.id}`}><td><div className="company-cell"><span className="company-monogram">{business.businessName.slice(0, 1).toUpperCase()}</span><span><b>{business.businessName}</b><small>{business.founderName} · {business.email}</small></span></div></td><td>{programs.find(p => p.id === business.programId)?.name || `Program ${business.programId}`}</td><td>{business.industry || '—'}</td><td><Badge value={business.stage} label={stageNames[business.stage]} /></td><td>{dateLabel(business.applicationDate)}</td><td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(business)} aria-label={`Edit ${business.businessName}`} data-testid={`button-edit-business-${business.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(business)} aria-label={`Delete ${business.businessName}`} data-testid={`button-delete-business-${business.id}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
    </section>
    <div className="list-footnote"><span><Users size={15} /> People first, stage second.</span><span>Use notes to keep the context behind the numbers.</span></div>
    {editing !== undefined && (editing ? <BusinessEditDialog business={editing} programs={programs} onClose={() => setEditing(undefined)} onSave={save} loading={update.isPending} error={update.error ? 'Could not update this business. Please try again.' : undefined} /> : <FormDialog title="Add a business" description="Start a founder record and make the next step visible." fields={businessFields(programs)} initial={{ stage: 'application', ...(programs[0] ? { programId: String(programs[0].id) } : {}) }} loading={create.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={create.error ? 'Could not create this business. Check the required fields.' : undefined} />)}
    {deleting && <ConfirmDialog item={deleting.businessName} onCancel={() => setDeleting(null)} onConfirm={confirmRemove} loading={remove.isPending} />}
  </>;
}

function SessionsPage({ coordinator = false }: { coordinator?: boolean }) {
  const [type, setType] = useState('');
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<Session | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [zoomActionMessage, setZoomActionMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [zoomCallbackResult] = useState(() => new URLSearchParams(window.location.search).get('zoom'));
  const params = useMemo(() => type ? { type: type as Session['type'] } : undefined, [type]);
  const query = useListSessions(params, { query: { queryKey: getListSessionsQueryKey(params) } });
  const programsQuery = useListPrograms({ query: { queryKey: getListProgramsQueryKey() } });
  const programs = programsQuery.data || [];
  const sessions = query.data || [];
  const displayedSessions = calendarDate ? sessions.filter(session => session.scheduledDate.slice(0, 10) === calendarDate) : sessions;
  const client = useQueryClient();
  const zoomStatus = useGetZoomStatus({ query: { queryKey: getGetZoomStatusQueryKey(), enabled: coordinator } });
  const connectZoom = useStartZoomConnection();
  const disconnectZoom = useDisconnectZoom();
  const createZoomMeeting = useCreateOrUpdateZoomMeeting();
  const syncZoomRecording = useSyncZoomRecording();
  const staffQuery = useListStaff({ query: { queryKey: getListStaffQueryKey(), enabled: coordinator } });
  const trainers = coordinator ? (staffQuery.data || []).filter(person => person.role === 'trainer' && person.status === 'active') : [];
  const create = useCreateSession();
  const update = useUpdateSession();
  const remove = useDeleteSession();

  useEffect(() => {
    if (!zoomCallbackResult) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('zoom');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [zoomCallbackResult]);

  const refreshZoomViews = () => {
    invalidate(client, [getListSessionsQueryKey(), getGetDashboardQueryKey(), getGetZoomStatusQueryKey()]);
  };
  const save = (v: Values) => {
    const data: SessionInput = {
      title: v.title.trim(),
      type: (v.type || 'training') as SessionInput['type'],
      programId: v.programId ? Number(v.programId) : null,
      scheduledDate: v.scheduledDate,
      startTime: v.startTime || null,
      durationMinutes: Number(v.durationMinutes || 60),
      facilitator: v.facilitator || null,
      ...(coordinator ? { trainerStaffId: v.trainerStaffId ? Number(v.trainerStaffId) : null } : {}),
      deliveryMode: (v.deliveryMode || 'online') as SessionInput['deliveryMode'],
      location: v.location || null,
      zoomUrl: v.zoomUrl || null,
      recordingUrl: v.recordingUrl || null,
      status: (v.status || 'scheduled') as SessionInput['status'],
    };
    const done = () => {
      invalidate(client, [getListSessionsQueryKey(), getGetDashboardQueryKey()]);
      setEditing(undefined);
    };
    if (editing) update.mutate({ id: editing.id, data: data as SessionUpdate }, { onSuccess: done });
    else create.mutate({ data }, { onSuccess: done });
  };
  const removeRecord = () => deleting && remove.mutate({ id: deleting.id }, {
    onSuccess: () => {
      invalidate(client, [getListSessionsQueryKey(), getGetDashboardQueryKey()]);
      setDeleting(null);
    },
  });
  const startZoomConnect = () => {
    setZoomActionMessage(null);
    connectZoom.mutate({ data: {} }, {
      onSuccess: response => window.location.assign(response.authorizationUrl),
      onError: error => setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, 'Could not start Zoom authorization.') }),
    });
  };
  const disconnectZoomAccount = () => disconnectZoom.mutate({ data: {} }, {
    onSuccess: () => {
      setConfirmDisconnect(false);
      setZoomActionMessage({ tone: 'good', text: 'Zoom was disconnected. Existing session links and recordings remain available.' });
      refreshZoomViews();
    },
    onError: error => setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, 'Could not disconnect Zoom.') }),
  });
  const manageMeeting = (session: Session) => {
    setZoomActionMessage(null);
    createZoomMeeting.mutate({ id: session.id }, {
      onSuccess: updated => {
        setZoomActionMessage({ tone: 'good', text: `Zoom meeting saved for “${updated.title}”. Trainers and participants can now use its session link.` });
        refreshZoomViews();
      },
      onError: error => setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, `Could not create a Zoom meeting for “${session.title}”.`) }),
    });
  };
  const updateRecording = (session: Session) => {
    setZoomActionMessage(null);
    syncZoomRecording.mutate({ id: session.id }, {
      onSuccess: updated => {
        setZoomActionMessage({ tone: 'good', text: `Recording link saved for “${updated.title}”. It is now available with the session.` });
        refreshZoomViews();
      },
      onError: error => setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, `Could not sync the recording for “${session.title}”.`) }),
    });
  };
  const zoomNotice = zoomCallbackResult === 'connected'
    ? 'Zoom authorization is complete.'
    : zoomCallbackResult === 'cancelled'
      ? 'Zoom authorization was cancelled.'
      : zoomCallbackResult === 'error'
        ? 'Zoom could not be connected. Check the Zoom app settings and try again.'
        : null;

  return <>
    <PageHeading kicker="PROGRAM DELIVERY / SESSIONS" title="Sessions" summary="Bootcamps, hackathons and online moments that move the cohort forward." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-session"><Plus size={16} /> Schedule session</button>} />
    {coordinator && staffQuery.isError && <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>Trainer assignments are temporarily unavailable.</b><span>Reload the page to retry team access records before assigning a trainer.</span></div><button className="button button-quiet" onClick={() => void staffQuery.refetch()} data-testid="button-retry-trainers">Retry</button></div>}
    {coordinator && <section className="team-callout zoom-connect-panel" data-testid="zoom-connection-panel" aria-live="polite">
      <Video size={18} />
      <div className="zoom-connect-copy">
        <b>{zoomStatus.isLoading ? 'Checking Zoom setup…' : zoomStatus.data?.connected ? 'Zoom account connected' : 'Connect Zoom for online sessions'}</b>
        <span>Coordinators can create and update Zoom meetings here. Trainers and participants will see the join link and any synced recording in their session views.</span>
        {zoomCallbackResult && zoomNotice && <span className={zoomCallbackResult === 'error' ? 'zoom-status-error' : 'zoom-status-success'}>{zoomNotice}</span>}
        {zoomActionMessage && <span className={zoomActionMessage.tone === 'bad' ? 'zoom-status-error' : 'zoom-status-success'} role={zoomActionMessage.tone === 'bad' ? 'alert' : 'status'}>{zoomActionMessage.text}</span>}
        {zoomStatus.isError && <span className="zoom-status-error">Zoom connection status could not be loaded.</span>}
        {!zoomStatus.data?.clientConfigured && <span>Before connecting, add the Zoom OAuth Client ID and Client Secret to Replit Secrets as <code>ZOOM_CLIENT_ID</code> and <code>ZOOM_CLIENT_SECRET</code>.</span>}
        {zoomStatus.data?.callbackUrl && <span>Register this exact OAuth redirect URL in the Zoom app: <code className="zoom-callback-url">{zoomStatus.data.callbackUrl}</code></span>}
        <span>Enable these Zoom OAuth scopes: <code>meeting:write:meeting</code> and <code>cloud_recording:read:list_recording_files</code>. New meetings are 60 minutes and use the connected Zoom account’s time zone.</span>
        {zoomStatus.data?.connected && <span>Connected by {zoomStatus.data.connectedBy || 'a coordinator'}{zoomStatus.data.connectedAt ? ` on ${dateLabel(zoomStatus.data.connectedAt)}` : ''}.</span>}
        {confirmDisconnect && <span className="zoom-disconnect-confirm">Disconnect Zoom? Existing session links and recordings remain, but meeting and recording sync will stop until it is reconnected.</span>}
      </div>
      <div className="zoom-connect-actions">
        {zoomStatus.isError ? <button className="button button-quiet" onClick={() => void zoomStatus.refetch()} data-testid="button-retry-zoom-status">Retry</button> : <>
          {zoomStatus.data?.connected && <button className="button button-quiet" onClick={() => setConfirmDisconnect(value => !value)} data-testid="button-disconnect-zoom">{confirmDisconnect ? 'Cancel' : 'Disconnect'}</button>}
          {confirmDisconnect && <button className="button button-outline" onClick={disconnectZoomAccount} disabled={disconnectZoom.isPending} data-testid="button-confirm-disconnect-zoom">{disconnectZoom.isPending ? 'Disconnecting…' : 'Confirm disconnect'}</button>}
          <button className="button button-primary" onClick={startZoomConnect} disabled={!zoomStatus.data?.clientConfigured || connectZoom.isPending} data-testid="button-connect-zoom">{connectZoom.isPending ? 'Opening Zoom…' : zoomStatus.data?.connected ? 'Reconnect Zoom' : 'Connect Zoom'}</button>
        </>}
      </div>
    </section>}
    <div className="calendar-summary"><div className="calendar-icon"><CalendarDays size={20} /></div><div><b>Make each moment count.</b><span>Keep joining details and recordings close to the agenda.</span></div><span className="calendar-endnote"><Video size={15} /> LIVE + ON-DEMAND</span></div>
    <div className="toolbar standalone-toolbar"><label className="filter-select"><Filter size={15} /><select value={type} aria-label="Filter sessions by type" onChange={e => { setType(e.target.value); setCalendarDate(null); }} data-testid="select-session-type"><option value="">All session types</option>{['bootcamp', 'hackathon', 'training', 'pitch_day', 'demo_day', 'other'].map(v => <option key={v} value={v}>{display(v)}</option>)}</select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{sessions.length}</b> sessions</div></div>
    <SessionCalendar sessions={sessions} selectedDate={calendarDate} onSelectDate={setCalendarDate} />
    {calendarDate && <div className="calendar-date-results" role="status"><span>Showing sessions for <b>{dateLabel(calendarDate)}</b></span><span>{displayedSessions.length} scheduled</span></div>}
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : sessions.length === 0 ? <EmptyState title="No sessions scheduled." body="Add the next bootcamp, hackathon, online training or pitch event to get the cohort together." action={<button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> Schedule a session</button>} /> :
    <div className="session-list">{displayedSessions.length === 0 ? <EmptyState title="No sessions on this date." body="Choose another day or clear the calendar selection to see the full schedule." action={<button className="button button-outline" onClick={() => setCalendarDate(null)}>Show all sessions</button>} /> : displayedSessions.map((session, i) => {
      const meetingPending = createZoomMeeting.isPending && createZoomMeeting.variables?.id === session.id;
      const recordingPending = syncZoomRecording.isPending && syncZoomRecording.variables?.id === session.id;
      return <article className="session-card" key={session.id} data-testid={`card-session-${session.id}`}>
        <div className="session-date"><span>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</span><b>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).getDate()}</b><small>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })}</small></div>
        <div className="session-card-main">
          <div className="session-label-row"><Badge value={session.type} /><Badge value={session.status} /><span className={`delivery-pill delivery-${session.deliveryMode}`}>{display(session.deliveryMode)}</span></div>
          <h2 className="app-title">{session.title}</h2>
          <p>{programs.find(p => p.id === session.programId)?.name || (session.programId ? `Program ${session.programId}` : 'All cohorts')}<span>·</span>{session.startTime || 'Time not set'}<span>·</span>{session.durationMinutes} min<span>·</span>{session.facilitator || 'Facilitator TBD'}</p>
          <div className="session-links"><span className="location-detail"><MapPin size={13} /> {session.location || 'Location not set'}</span>{session.deliveryMode !== 'in_person' && session.zoomUrl ? <a href={session.zoomUrl} target="_blank" rel="noreferrer" className="text-link"><Video size={14} /> Join Zoom <ExternalLink size={12} /></a> : <span className="disabled-link"><Video size={14} /> {session.deliveryMode === 'in_person' ? 'In-person session' : 'No meeting link'}</span>}{session.recordingUrl && <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="text-link"><ExternalLink size={13} /> Recording</a>}</div>
          {coordinator && session.deliveryMode !== 'in_person' && <div className="session-admin-actions">
            <button className="button button-quiet" onClick={() => manageMeeting(session)} disabled={!zoomStatus.data?.connected || createZoomMeeting.isPending} data-testid={`button-zoom-meeting-${session.id}`}><Video size={14} />{meetingPending ? 'Saving…' : session.zoomMeetingId ? 'Update Zoom meeting' : 'Create Zoom meeting'}</button>
            {session.zoomMeetingId && <button className="button button-quiet" onClick={() => updateRecording(session)} disabled={!zoomStatus.data?.connected || syncZoomRecording.isPending} data-testid={`button-sync-zoom-recording-${session.id}`}><RefreshCw size={14} />{recordingPending ? 'Syncing…' : 'Sync recording'}</button>}
          </div>}
        </div>
        <div className="session-card-actions"><button className="icon-button" onClick={() => setEditing(session)} aria-label={`Edit ${session.title}`} data-testid={`button-edit-session-${session.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(session)} aria-label={`Delete ${session.title}`} data-testid={`button-delete-session-${session.id}`}><Trash2 size={15} /></button></div>
        <span className={`session-index mono session-index-${i % 2}`}>SESSION / {String(i + 1).padStart(2, '0')}</span>
      </article>;
    })}</div>}
    {editing !== undefined && <FormDialog
      title={editing ? 'Edit session' : 'Schedule a session'}
      description="Use the Zoom controls on a session to create or update its meeting and sync a cloud recording. You can also paste a link manually."
      fields={sessionFields(programs, trainers, coordinator)}
      initial={editing ? {
        title: editing.title,
        type: editing.type,
        programId: editing.programId ? String(editing.programId) : '',
        scheduledDate: valueOf(editing.scheduledDate),
        startTime: editing.startTime || '',
        durationMinutes: String(editing.durationMinutes || 60),
        facilitator: editing.facilitator || '',
        trainerStaffId: editing.trainerStaffId ? String(editing.trainerStaffId) : '',
        deliveryMode: editing.deliveryMode,
        location: editing.location || '',
        zoomUrl: editing.zoomUrl || '',
        recordingUrl: editing.recordingUrl || '',
        status: editing.status,
      } : { type: 'training', deliveryMode: 'online', status: 'scheduled', durationMinutes: '60' }}
      loading={create.isPending || update.isPending}
      onClose={() => setEditing(undefined)}
      onSubmit={save}
      error={(create.error || update.error) ? 'Could not save this session. Check required details.' : undefined}
    />}
    {deleting && <ConfirmDialog item={deleting.title} onCancel={() => setDeleting(null)} onConfirm={removeRecord} loading={remove.isPending} />}
  </>;
}

function SupportPage({ coordinator = false }: { coordinator?: boolean }) {
  const [type, setType] = useState(''); const [editing, setEditing] = useState<SupportEngagement | null | undefined>(undefined); const [deleting, setDeleting] = useState<SupportEngagement | null>(null);
  const params = useMemo(() => type ? { type: type as SupportEngagement['type'] } : undefined, [type]);
  const query = useListSupport(params); const businessQuery = useListBusinesses(); const businesses = businessQuery.data || []; const engagements = query.data || []; const client = useQueryClient();
  const staffQuery = useListStaff({ query: { queryKey: getListStaffQueryKey(), enabled: coordinator } });
  const mentors = coordinator ? (staffQuery.data || []).filter(person => person.role === 'mentor' && person.status === 'active') : [];
  const create = useCreateSupport(); const update = useUpdateSupport(); const remove = useDeleteSupport();
  const save = (v: Values) => {
    const data: SupportInput = { businessId: Number(v.businessId), type: (v.type || 'mentor') as SupportInput['type'], provider: v.provider.trim(), ...(coordinator ? { mentorStaffId: v.mentorStaffId ? Number(v.mentorStaffId) : null } : {}), topic: v.topic.trim(), scheduledDate: v.scheduledDate || null, status: (v.status || 'requested') as SupportInput['status'], notes: v.notes || null };
    const done = () => { invalidate(client, [getListSupportQueryKey(), getGetDashboardQueryKey()]); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as SupportUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const removeRecord = () => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => { invalidate(client, [getListSupportQueryKey(), getGetDashboardQueryKey()]); setDeleting(null); } });
  return <>
    <PageHeading kicker="FOUNDER ENABLEMENT / ENGAGEMENTS" title="Support" summary="The right mentor, specialist or agency at the moment it matters." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-support"><Plus size={16} /> Log engagement</button>} />
    {coordinator && staffQuery.isError && <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>Mentor assignments are temporarily unavailable.</b><span>Retry team access records before assigning an engagement.</span></div><button className="button button-quiet" onClick={() => void staffQuery.refetch()} data-testid="button-retry-mentors">Retry</button></div>}
    <div className="support-callout"><div className="support-callout-icon"><Handshake size={20} /></div><div><div className="eyebrow">SUPPORT THAT MOVES THE NEEDLE</div><b>Match practical expertise to a founder's next milestone.</b><span>Mentoring · subject expertise · branding · technical agency</span></div><div className="support-total"><b>{engagements.filter(e => e.status !== 'completed').length}</b><span>IN MOTION</span></div></div>
    <div className="toolbar standalone-toolbar"><label className="filter-select"><Filter size={15} /><select value={type} aria-label="Filter support by type" onChange={e => setType(e.target.value)} data-testid="select-support-type"><option value="">All support types</option>{['mentor', 'subject_expert', 'branding', 'technical'].map(v => <option key={v} value={v}>{display(v)}</option>)}</select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{engagements.length}</b> engagements</div></div>
    {query.isLoading || businessQuery.isLoading ? <LoadingState /> : query.isError || businessQuery.isError ? <ErrorState retry={() => { void query.refetch(); void businessQuery.refetch(); }} /> : engagements.length === 0 ? <EmptyState title="Support begins with a conversation." body="Log a mentoring match, a specialist session or agency support against a business." action={<button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> Add an engagement</button>} /> :
    <section className="panel engagement-panel"><div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>SUPPORT</th><th>PROVIDER / TOPIC</th><th>DATE</th><th>STATUS</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{engagements.map(item => { const business = businesses.find(b => b.id === item.businessId); return <tr key={item.id} data-testid={`row-support-${item.id}`}><td><div className="company-cell"><span className="company-monogram monogram-teal">{business?.businessName?.slice(0, 1).toUpperCase() || 'B'}</span><span><b>{business?.businessName || `Business ${item.businessId}`}</b><small>{business?.founderName || 'Founder record'}</small></span></div></td><td><span className="type-mark">{display(item.type)}</span></td><td><div className="provider-cell"><b>{item.provider}</b><small>{item.topic}</small></div></td><td>{dateLabel(item.scheduledDate)}</td><td><Badge value={item.status} /></td><td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(item)} aria-label={`Edit ${item.topic}`} data-testid={`button-edit-support-${item.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(item)} aria-label={`Delete ${item.topic}`} data-testid={`button-delete-support-${item.id}`}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div></section>}
    {editing !== undefined && <FormDialog title={editing ? 'Edit engagement' : 'Log an engagement'} description="Tie every support moment to a business and a clear outcome." fields={supportFields(businesses, mentors, coordinator)} initial={editing ? { businessId: String(editing.businessId), type: editing.type, provider: editing.provider, mentorStaffId: editing.mentorStaffId ? String(editing.mentorStaffId) : '', topic: editing.topic, scheduledDate: valueOf(editing.scheduledDate), status: editing.status, notes: editing.notes || '' } : { type: 'mentor', status: 'requested', ...(businesses[0] ? { businessId: String(businesses[0].id) } : {}) }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={(create.error || update.error) ? 'Could not save this engagement. Check the required fields.' : undefined} />}
    {deleting && <ConfirmDialog item={`${deleting.type.replaceAll('_', ' ')} · ${deleting.topic}`} onCancel={() => setDeleting(null)} onConfirm={removeRecord} loading={remove.isPending} />}
  </>;
}

function PitchesPage({ coordinator = false }: { coordinator?: boolean }) {
  const [eventType, setEventType] = useState(''); const [editing, setEditing] = useState<PitchRecord | null | undefined>(undefined); const [deleting, setDeleting] = useState<PitchRecord | null>(null);
  const params = useMemo(() => eventType ? { eventType: eventType as PitchRecord['eventType'] } : undefined, [eventType]);
  const query = useListPitches(params); const businessQuery = useListBusinesses(); const businesses = businessQuery.data || []; const pitches = query.data || []; const client = useQueryClient();
  const staffQuery = useListStaff({ query: { queryKey: getListStaffQueryKey(), enabled: coordinator } });
  const judges = coordinator ? (staffQuery.data || []).filter(person => person.role === 'judge' && person.status === 'active') : [];
  const create = useCreatePitch(); const update = useUpdatePitch(); const remove = useDeletePitch();
  const save = (v: Values) => {
    const data: PitchInput = { businessId: Number(v.businessId), eventType: (v.eventType || 'pitch_day') as PitchInput['eventType'], eventDate: v.eventDate, judges: v.judges || null, score: v.score === '' ? null : Number(v.score), grantDecision: (v.grantDecision || 'pending') as PitchInput['grantDecision'], grantAmount: v.grantAmount === '' ? null : Number(v.grantAmount), feedback: v.feedback || null };
    const done = () => { invalidate(client, [getListPitchesQueryKey(), getGetDashboardQueryKey()]); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as PitchUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const removeRecord = () => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => { invalidate(client, [getListPitchesQueryKey(), getGetDashboardQueryKey()]); setDeleting(null); } });
  const awarded = pitches.filter(p => p.grantDecision === 'awarded');
  const awardedTotal = awarded.reduce((sum, pitch) => sum + (pitch.grantAmount || 0), 0);
  return <>
    <PageHeading kicker="PITCH DAY / DECISIONS" title="Pitch & grants" summary="Keep evaluations, judge feedback and funding decisions connected." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-pitch"><Plus size={16} /> Add evaluation</button>} />
    {coordinator && staffQuery.isError && <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>Judge assignments are temporarily unavailable.</b><span>Retry team access records before assigning scorecards.</span></div><button className="button button-quiet" onClick={() => void staffQuery.refetch()} data-testid="button-retry-judges">Retry</button></div>}
    <section className="grant-summary"><div className="grant-emblem"><Trophy size={21} /></div><div className="grant-copy"><div className="eyebrow">FROM THE STAGE TO THE NEXT CHAPTER</div><b>Make each decision legible and grounded.</b><span>Scores, feedback and grant outcomes stay with the founder record.</span></div><div className="grant-stat"><b>{awarded.length}</b><span>GRANTS AWARDED</span></div><div className="grant-stat grant-amount"><b>{money(awardedTotal)}</b><span>TRACKED HERE</span></div></section>
    <div className="toolbar standalone-toolbar"><label className="filter-select"><Filter size={15} /><select value={eventType} aria-label="Filter pitch evaluations by event" onChange={e => setEventType(e.target.value)} data-testid="select-pitch-event"><option value="">Pitch + demo day</option><option value="pitch_day">Pitch day</option><option value="demo_day">Demo day</option></select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{pitches.length}</b> evaluations</div></div>
    {query.isLoading || businessQuery.isLoading ? <LoadingState /> : query.isError || businessQuery.isError ? <ErrorState retry={() => { void query.refetch(); void businessQuery.refetch(); }} /> : pitches.length === 0 ? <EmptyState title="The stage is set for your first evaluation." body="Record a pitch or demo day score, capture judge notes and track the grant decision." action={<button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> Add an evaluation</button>} /> :
    <section className="panel pitch-panel"><div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>EVENT</th><th>JUDGES</th><th>SCORE</th><th>GRANT DECISION</th><th>AMOUNT</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{pitches.map(pitch => { const business = businesses.find(b => b.id === pitch.businessId); return <tr key={pitch.id} data-testid={`row-pitch-${pitch.id}`}><td><div className="company-cell"><span className="company-monogram monogram-coral">{business?.businessName?.slice(0, 1).toUpperCase() || 'B'}</span><span><b>{business?.businessName || `Business ${pitch.businessId}`}</b><small>{dateLabel(pitch.eventDate)}</small></span></div></td><td><span className="event-chip">{display(pitch.eventType)}</span></td><td><div className="judge-text">{pitch.judges || '—'}</div></td><td><span className="score-value">{pitch.score ?? '—'}{pitch.score !== null && pitch.score !== undefined && <small>/100</small>}</span></td><td><Badge value={pitch.grantDecision} /></td><td className="grant-value">{pitch.grantDecision === 'awarded' ? money(pitch.grantAmount) : '—'}</td><td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(pitch)} aria-label={`Edit ${business?.businessName || 'pitch evaluation'}`} data-testid={`button-edit-pitch-${pitch.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(pitch)} aria-label="Delete pitch evaluation" data-testid={`button-delete-pitch-${pitch.id}`}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>
      {coordinator && pitches.length > 0 && <div className="pitch-judge-controls"><div className="eyebrow">INDIVIDUAL JUDGE ASSIGNMENTS</div>{pitches.map(pitch => <PitchJudgeControl key={pitch.id} pitchId={pitch.id} pitchLabel={`${businesses.find(b => b.id === pitch.businessId)?.businessName || `Business ${pitch.businessId}`} · ${display(pitch.eventType)}`} judges={judges} client={client} />)}</div>}
      <div className="pitch-feedback">{pitches.filter(p => p.feedback).slice(0, 2).map(p => <div className="feedback-note" key={p.id}><span className="quote-mark">“</span><div><b>{businesses.find(b => b.id === p.businessId)?.businessName || `Business ${p.businessId}`}</b><p>{p.feedback}</p></div></div>)}</div>
    </section>}
    {editing !== undefined && <FormDialog title={editing ? 'Edit evaluation' : 'Record an evaluation'} description="Capture the room's view and the decision that follows." fields={pitchFields(businesses)} initial={editing ? { businessId: String(editing.businessId), eventType: editing.eventType, eventDate: valueOf(editing.eventDate), judges: editing.judges || '', score: valueOf(editing.score), grantDecision: editing.grantDecision, grantAmount: valueOf(editing.grantAmount), feedback: editing.feedback || '' } : { eventType: 'pitch_day', grantDecision: 'pending', ...(businesses[0] ? { businessId: String(businesses[0].id) } : {}) }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={(create.error || update.error) ? 'Could not save this evaluation. Check the required fields.' : undefined} />}
    {deleting && <ConfirmDialog item={`${display(deleting.eventType)} evaluation`} onCancel={() => setDeleting(null)} onConfirm={removeRecord} loading={remove.isPending} />}
  </>;
}

function PitchJudgeControl({ pitchId, pitchLabel, judges, client }: { pitchId: number; pitchLabel: string; judges: StaffMember[]; client: ReturnType<typeof useQueryClient> }) {
  const query = useListPitchJudges(pitchId, { query: { queryKey: getListPitchJudgesQueryKey(pitchId) } });
  const assign = useAssignPitchJudge();
  const remove = useRemovePitchJudge();
  const [judgeId, setJudgeId] = useState('');
  const assignments = query.data || [];
  const assignedIds = new Set(assignments.map(item => item.judgeStaffId));
  const add = () => {
    if (!judgeId) return;
    assign.mutate({ id: pitchId, data: { judgeStaffId: Number(judgeId) } }, { onSuccess: () => { invalidate(client, [getListPitchJudgesQueryKey(pitchId)]); setJudgeId(''); } });
  };
  const removeAssignment = (assignmentId: number) => remove.mutate({ id: assignmentId }, { onSuccess: () => invalidate(client, [getListPitchJudgesQueryKey(pitchId)]) });
  return <article className="judge-assignment-row" data-testid={`pitch-judge-assignment-${pitchId}`}><div><b>{pitchLabel}</b><span>{query.isLoading ? 'Loading judge assignments…' : assignments.length ? assignments.map(item => `${item.judgeName}${item.submittedAt ? ' · scored' : ''}`).join(' / ') : 'No individual judges assigned'}</span></div><div className="judge-assignment-actions"><label className="sr-only" htmlFor={`assign-judge-${pitchId}`}>Choose judge for {pitchLabel}</label><select id={`assign-judge-${pitchId}`} className="form-control" value={judgeId} onChange={event => setJudgeId(event.target.value)} data-testid={`select-judge-${pitchId}`}><option value="">Choose judge</option>{judges.filter(person => !assignedIds.has(person.id)).map(person => <option key={person.id} value={person.id}>{person.email}</option>)}</select><button className="button button-outline" onClick={add} disabled={!judgeId || assign.isPending} data-testid={`button-assign-judge-${pitchId}`}>{assign.isPending ? 'Assigning…' : 'Assign'}</button></div>{assignments.filter(item => !item.submittedAt).map(item => <button className="judge-remove" key={item.id} onClick={() => removeAssignment(item.id)} disabled={remove.isPending} aria-label={`Remove ${item.judgeName} from ${pitchLabel}`} data-testid={`button-remove-judge-${item.id}`}>Remove {item.judgeName}</button>)}{(assign.isError || remove.isError || query.isError) && <span className="form-error">Judge assignment could not be updated.</span>}</article>;
}

function MentorBookingStatusPage() {
  const query = useGetMentorBookingStatus({
    query: { queryKey: getGetMentorBookingStatusQueryKey(), refetchOnWindowFocus: true },
  });
  const mentors = query.data || [];
  const isSelectedProviderConnected = (mentor: typeof mentors[number]) => mentor.bookingProvider === 'google_calendar'
    ? mentor.googleCalendarConnected
    : mentor.calendlyConnected;
  const connectedCount = mentors.filter(isSelectedProviderConnected).length;
  const pendingCount = mentors.length - connectedCount;

  return <>
    <PageHeading
      kicker="MENTOR OPERATIONS / SESSION BOOKING"
      title="Mentor booking status"
      summary="See each mentor’s selected booking platform and whether its account is connected."
      action={<button className="button button-outline" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-mentor-booking">{query.isFetching ? 'Refreshing…' : <><RefreshCw size={14} /> Refresh status</>}</button>}
    />
    {query.isLoading ? <LoadingState label="Loading mentor booking status" /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : <>
      <section className="metric-grid mentor-booking-metrics">
        <Metric label="Mentors" value={mentors.length} hint="Invited and active accounts" icon={Users} />
        <Metric label="Connected" value={connectedCount} hint="Selected provider connected" icon={CalendarCheck} />
        <Metric label="Needs follow-up" value={pendingCount} hint="Selected provider not connected" icon={CircleAlert} accent="metric-sand" />
      </section>
      {mentors.length === 0 ? <EmptyState title="No mentors have been added yet." body="Mentor accounts will appear here after a coordinator adds them under Team access." /> :
        <section className="panel staff-panel">
          <div className="panel-heading">
            <div><div className="eyebrow">BOOKING READINESS</div><h2 className="app-title">Mentor accounts</h2></div>
            <span className="section-meta">{pendingCount} need{pendingCount === 1 ? 's' : ''} follow-up</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>MENTOR</th><th>JUSOOR ACCOUNT</th><th>BOOKING PROVIDER</th><th>CALENDLY</th><th>GOOGLE CALENDAR</th></tr></thead>
            <tbody>{mentors.map(mentor => <tr key={mentor.staffId} data-testid={`row-mentor-booking-${mentor.staffId}`}>
              <td><div className="staff-email"><span className="staff-avatar">{mentor.email.slice(0, 1).toUpperCase()}</span><b>{mentor.email}</b></div></td>
              <td><Badge value={mentor.status} label={mentor.status === 'active' ? 'Active' : 'Invitation pending'} /></td>
              <td><b>{mentor.bookingProvider === 'google_calendar' ? 'Google Calendar' : 'Calendly'}</b></td>
              <td><span className={`badge ${mentor.calendlyConnected ? 'badge-good' : 'badge-warm'}`} data-testid={`status-calendly-${mentor.staffId}`}><span />{mentor.calendlyConnected ? 'Connected' : 'Not connected'}</span></td>
              <td><span className={`badge ${mentor.googleCalendarConnected ? 'badge-good' : 'badge-warm'}`} data-testid={`status-google-calendar-${mentor.staffId}`}><span />{mentor.googleCalendarConnected ? 'Connected' : 'Not connected'}</span>{!mentor.googleCalendarConnected && mentor.status === 'invited' && <small className="mentor-booking-note">Waiting for account sign-in</small>}</td>
            </tr>)}</tbody>
          </table></div>
        </section>}
      <div className="dashboard-note"><span className="note-mark"><CalendarDays size={13} /></span><span><b>Connection status only.</b> This page shows provider selection and account status, not private calendar details or credentials.</span></div>
    </>}
  </>;
}

function TeamPage() {
  const query = useListStaff();
  const staff = query.data || [];
  const client = useQueryClient();
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const remove = useDeleteStaff();
  const [editing, setEditing] = useState<StaffMember | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const save = (values: Values) => {
    const role = (values.role || 'staff') as StaffInput['role'];
    const done = () => {
      invalidate(client, [getListStaffQueryKey()]);
      setEditing(undefined);
    };
    if (editing) {
      update.mutate({ id: editing.id, data: { role } as StaffUpdate }, { onSuccess: done });
    } else {
      create.mutate({ data: { email: values.email.trim().toLowerCase(), role } as StaffInput }, { onSuccess: done });
    }
  };
  const revoke = () => deleting && remove.mutate({ id: deleting.id }, {
    onSuccess: () => {
      invalidate(client, [getListStaffQueryKey()]);
      setDeleting(null);
    },
  });
  const formError = (create.error || update.error) as { data?: { error?: string } } | undefined;
  const deleteError = remove.error as { data?: { error?: string } } | null;

  return <>
    <PageHeading kicker="TEAM / ACCESS" title="Team access" summary="Invite the right people into each part of the founder journey." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-staff"><UserPlus size={16} /> Invite team member</button>} />
    <div className="team-callout"><Shield size={18} /><div><b>Every role is tied to a verified email.</b><span>Choose coordinator, program staff, trainer, mentor or judge access. Members sign up using the same verified email address. This approval does not send an email automatically.</span></div></div>
    {query.isLoading ? <LoadingState label="Loading staff access" /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : staff.length === 0 ? <EmptyState title="No staff access has been added." body="Add a coordinator or program staff email to approve the team." action={<button className="button button-primary" onClick={() => setEditing(null)}><UserPlus size={15} /> Add the first staff member</button>} /> :
      <section className="panel staff-panel">
        <div className="panel-heading"><div><div className="eyebrow">APPROVED ACCOUNTS</div><h2 className="app-title">{staff.length} team {staff.length === 1 ? 'member' : 'members'}</h2></div><span className="section-meta">Only coordinators can change access</span></div>
        <div className="table-wrap"><table><thead><tr><th>EMAIL</th><th>ROLE</th><th>ACCOUNT</th><th>ADDED</th><th className="align-right">ACTIONS</th></tr></thead><tbody>
          {staff.map(member => <tr key={member.id} data-testid={`row-staff-${member.id}`}>
            <td><div className="staff-email"><span className="staff-avatar">{member.email.slice(0, 1).toUpperCase()}</span><b>{member.email}</b></div></td>
            <td><span className={`role-label ${member.role === 'coordinator' ? 'role-coordinator' : ''}`}>{member.role === 'coordinator' ? <Shield size={13} /> : <Users size={13} />}{display(member.role)}</span></td>
            <td><Badge value={member.status} label={member.status === 'invited' ? 'Account not linked' : 'Active'} /></td>
            <td>{dateLabel(member.createdAt)}</td>
            <td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(member)} aria-label={`Change role for ${member.email}`} data-testid={`button-edit-staff-${member.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(member)} aria-label={`Revoke ${member.email}`} data-testid={`button-delete-staff-${member.id}`}><Trash2 size={15} /></button></div></td>
          </tr>)}
        </tbody></table></div>
      </section>}
    {editing !== undefined && <FormDialog title={editing ? 'Change team role' : 'Invite a team member'} description={editing ? 'Choose the permissions this team member should have.' : 'Approve this verified email for the role selected. The person can sign in with this same address.'} fields={editing ? staffRoleFields : staffInviteFields} initial={editing ? { role: editing.role } : { role: 'staff' }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={formError ? formError.data?.error || 'The change could not be saved.' : undefined} />}
    {deleting && <ConfirmDialog item={`staff access for ${deleting.email}`} onCancel={() => setDeleting(null)} onConfirm={revoke} loading={remove.isPending} error={deleteError ? deleteError.data?.error || 'The access could not be revoked.' : undefined} />}
  </>;
}

function NotFoundPage() {
  return <div className="not-found"><div className="eyebrow">JUSOOR / 404</div><h1 className="app-title">That page isn't on the journey.</h1><p>Return to the program overview and find your way back.</p><Link className="button button-primary" href="/">Back to overview <ArrowRight size={16} /></Link></div>;
}

function Router({ staff, displayName }: { staff: StaffMember; displayName: string }) {
  const [location] = useLocation();
  if (staff.role === 'trainer') return location === '/trainer' ? <TrainerDashboardPage name={displayName} /> : location === '/courses' ? <RoleFrame role="trainer" name={displayName}><CourseManagementPage /></RoleFrame> : <RoleNotFound role={staff.role} />;
  if (staff.role === 'mentor') return location === '/mentor' ? <MentorDashboardPage name={displayName} /> : <RoleNotFound role={staff.role} />;
  if (staff.role === 'judge') return location === '/judge' ? <JudgeDashboardPage name={displayName} /> : <RoleNotFound role={staff.role} />;
  return <ErrorBoundary resetKey={location}><Shell staff={staff} displayName={displayName}><Switch>
    <Route path="/" component={Overview} />
    <Route path="/businesses" component={BusinessesPage} />
    <Route path="/programs" component={ProgramsPage} />
    <Route path="/courses" component={CourseManagementPage} />
    <Route path="/sessions">{() => <SessionsPage coordinator={staff.role === 'coordinator'} />}</Route>
    <Route path="/communications" component={staff.role === 'coordinator' ? CommunicationsPage : NotFoundPage} />
    <Route path="/support">{() => <SupportPage coordinator={staff.role === 'coordinator'} />}</Route>
    <Route path="/pitches">{() => <PitchesPage coordinator={staff.role === 'coordinator'} />}</Route>
    <Route path="/applications" component={staff.role === 'coordinator' ? ApplicationsReviewPage : NotFoundPage} />
    <Route path="/mentor-booking" component={staff.role === 'coordinator' ? MentorBookingStatusPage : NotFoundPage} />
    <Route path="/team" component={staff.role === 'coordinator' ? TeamPage : NotFoundPage} />
    <Route path="/access" component={staff.role === 'coordinator' ? RoleAccessPage : NotFoundPage} />
    <Route component={NotFoundPage} />
  </Switch></Shell></ErrorBoundary>;
}

function AuthLanding() {
  return <main className="auth-page">
    <div className="auth-brand"><span className="brand-mark">J</span><span><b>Jusoor</b><small>PROGRAM HUB</small></span></div>
    <section className="auth-welcome">
      <div className="eyebrow">JUSOOR ENTREPRENEURSHIP PROGRAM</div>
      <h1 className="app-title">Good work,<br /><em>moving forward.</em></h1>
      <p>A private workspace for the team supporting founders from outreach and incubation to pitch day and grants.</p>
      <div className="auth-actions"><Link href="/apply" className="button button-primary">Apply to a program <ArrowRight size={16} /></Link><Link href="/participant" className="auth-secondary">Already applied? Sign in to track progress</Link><Link href="/sign-in" className="auth-secondary">Program team sign in</Link></div>
      <div className="auth-foot"><Shield size={15} /><span>Founder progress is private to the applicant. Staff workspace access requires coordinator approval.</span></div>
    </section>
    <div className="auth-side-note"><span>01 — PROGRAM OPERATIONS</span><b>Every founder.<br />Every next step.</b><i>OUTREACH → INCUBATION → GRANTS</i></div>
  </main>;
}

function AuthPage({ mode, participantRedirect = false }: { mode: 'sign-in' | 'sign-up'; participantRedirect?: boolean }) {
  const isSignIn = mode === 'sign-in';
  return <main className="auth-page auth-form-page">
    <Link href="/" className="auth-brand"><span className="brand-mark">J</span><span><b>Jusoor</b><small>PROGRAM HUB</small></span></Link>
    <div className="auth-form-content"><div className="eyebrow">{isSignIn ? 'JUSOOR PROGRAM HUB' : 'CREATE YOUR ACCOUNT'}</div><h1 className="app-title">{isSignIn ? 'Welcome back.' : 'Your journey, in view.'}</h1><p>{isSignIn ? 'Sign in to continue to your program workspace or founder progress.' : 'Use the same verified email you entered on your application. Staff accounts still require coordinator approval.'}</p>
      <div className="clerk-card">{isSignIn
        ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={participantRedirect ? `${basePath}/participant` : undefined} />
        : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/participant`} />}
      </div>
      <Link href="/" className="auth-back">← Back to Jusoor Program Hub</Link>
    </div>
    <div className="auth-form-note"><Shield size={15} /> Founder progress is private to the signed-in applicant. Staff workspace access remains coordinator-approved.</div>
  </main>;
}

function AuthLoading() {
  return <main className="auth-status-page"><div className="brand-mark">J</div><p>Checking your staff access…</p></main>;
}

function AccessDenied({ retry }: { retry?: () => void }) {
  const { signOut } = useClerk();
  return <main className="auth-status-page"><span className="denied-icon"><Shield size={21} /></span><div className="eyebrow">STAFF ACCESS REQUIRED</div><h1 className="app-title">This account isn’t approved yet.</h1><p>Ask a Jusoor coordinator to approve your verified email address, then sign in again.</p><div className="auth-actions">{retry && <button className="button button-outline" onClick={retry}>Check access again</button>}<button className="button button-primary" onClick={() => void signOut({ redirectUrl: basePath || '/' })}><LogOut size={15} /> Sign out</button></div></main>;
}

function AccessCheckFailed({ retry, sessionExpired = false }: { retry: () => void; sessionExpired?: boolean }) {
  const { signOut } = useClerk();
  return <main className="auth-status-page"><span className="denied-icon"><CircleAlert size={21} /></span><div className="eyebrow">ACCESS CHECK</div><h1 className="app-title">{sessionExpired ? 'Your sign-in needs refreshing.' : 'We couldn’t verify access.'}</h1><p>{sessionExpired ? 'Sign out, then sign in again to refresh your session.' : 'Your program data is still protected. Check your connection and try again.'}</p><div className="auth-actions"><button className="button button-outline" onClick={retry}>Try again</button><button className="button button-primary" onClick={() => void signOut({ redirectUrl: basePath || '/' })}><LogOut size={15} /> Sign out</button></div></main>;
}

function AuthenticatedWorkspace() {
  const [location, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const staffQuery = useGetAuthMe({
    query: { queryKey: getGetAuthMeQueryKey(), enabled: isLoaded && isSignedIn === true, retry: false },
  });
  const roleHome = (role: StaffMember['role']) => role === 'trainer' ? '/trainer' : role === 'mentor' ? '/mentor' : role === 'judge' ? '/judge' : '/';
  const permitted = (staff: StaffMember, path: string) => {
    if (staff.role === 'trainer') return path === '/trainer' || path === '/courses';
    if (staff.role === 'mentor' || staff.role === 'judge') return path === roleHome(staff.role);
    if (path === '/trainer' || path === '/mentor' || path === '/judge' || path === '/participant') return false;
    if (staff.role !== 'coordinator' && (path === '/applications' || path === '/mentor-booking' || path === '/team' || path === '/access')) return false;
    return ['/', '/businesses', '/programs', '/sessions', '/support', '/pitches', ...(staff.role === 'coordinator' ? ['/communications', '/courses', '/applications', '/mentor-booking', '/team', '/access'] : [])].includes(path);
  };
  const accessStatus = (staffQuery.error as { status?: number } | null)?.status;
  useEffect(() => {
    if (staffQuery.data && !permitted(staffQuery.data, location)) setLocation(roleHome(staffQuery.data.role));
    if (staffQuery.isError && accessStatus === 403 && location !== '/participant') setLocation('/participant');
  }, [staffQuery.data, staffQuery.isError, accessStatus, location, setLocation]);
  if (!isLoaded || (isSignedIn && (!userLoaded || staffQuery.isLoading))) return <AuthLoading />;
  if (!isSignedIn) return <AuthLanding />;
  if (staffQuery.data && !permitted(staffQuery.data, location)) return <AuthLoading />;
  if (staffQuery.isError || !staffQuery.data) {
    const status = (staffQuery.error as { status?: number } | null)?.status;
    if (location === '/participant' && status === 403) return <ParticipantDashboardPage />;
    if (status === 403) return <AccessDenied retry={() => void staffQuery.refetch()} />;
    return <AccessCheckFailed sessionExpired={status === 401} retry={() => void staffQuery.refetch()} />;
  }
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || staffQuery.data.email;
  return <Router staff={staffQuery.data} displayName={displayName} />;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) cache.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  const appearance = {
    theme: shadcn,
    cssLayerName: 'clerk',
    options: {
      logoPlacement: 'inside' as const,
      logoLinkUrl: basePath || '/',
      logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
      socialButtonsPlacement: 'bottom' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    variables: {
      colorPrimary: '#28665a',
      colorForeground: '#203744',
      colorMutedForeground: '#687c82',
      colorDanger: '#b85042',
      colorBackground: '#fcfaf5',
      colorInput: '#ffffff',
      colorInputForeground: '#203744',
      colorNeutral: '#d8d0c1',
      fontFamily: 'DM Sans, sans-serif',
      borderRadius: '0.7rem',
    },
    elements: {
      rootBox: 'w-full flex justify-center',
      cardBox: 'bg-background rounded-2xl w-[440px] max-w-full overflow-hidden border border-border',
      card: '!shadow-none !border-0 !bg-transparent !rounded-none',
      footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
      headerTitle: 'text-foreground font-semibold',
      headerSubtitle: 'text-muted-foreground',
      socialButtonsBlockButtonText: 'text-foreground font-medium',
      formFieldLabel: 'text-foreground font-medium',
      footerActionLink: 'text-primary font-semibold',
      footerActionText: 'text-muted-foreground',
      dividerText: 'text-muted-foreground',
      formFieldInput: 'bg-white text-foreground border-border',
      formButtonPrimary: 'bg-primary text-primary-foreground font-semibold',
      main: 'text-foreground',
    },
  };

  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your Jusoor workspace' } },
      signUp: { start: { title: 'Create your Jusoor account', subtitle: 'Founders: use the email on your application' } },
    }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <AuthRouter />
      <Toaster />
    </QueryClientProvider>
  </ClerkProvider>;
}

function AuthRouter() {
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  if (location === '/apply') return <ApplyPage />;
  if (location === '/participant' && isLoaded && !isSignedIn) return <AuthPage mode="sign-in" participantRedirect />;
  if (location.startsWith('/sign-in')) return <AuthPage mode="sign-in" />;
  if (location.startsWith('/sign-up')) return <AuthPage mode="sign-up" />;
  return <AuthenticatedWorkspace />;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkApp /></WouterRouter></TooltipProvider>;
}

export default App;
