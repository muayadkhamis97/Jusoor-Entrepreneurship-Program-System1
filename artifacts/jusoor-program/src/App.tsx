import { hasMentorBookingConnection, mentorBookingConnectionSummary } from './mentor-booking-status';
import './workspace.css';
import './role-workspace.css';
import './role-access.css';
import './session-recording.css';
import './language.css';
import './program-controls.css';
import { PublicLanding } from './public-landing';
import { getAccessibleBrandForeground } from './branding-contrast';
import { sessionProgramField } from './session-form-requirements';
import { selectedOptionValues, updateMultiSelectValue } from './program-multiselect';
import { BusinessParticipantsDialog } from './business-participants-dialog';
import { lazy, Suspense, type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { arSA } from '@clerk/localizations';
import {
  getGetAuthMeQueryKey, getGetBusinessQueryKey, getGetDashboardQueryKey, getGetMentorBookingStatusQueryKey, getGetZoomStatusQueryKey, getListBusinessesQueryKey,
  getListPitchesQueryKey, getListProgramsQueryKey, getListSessionsQueryKey, getListStaffQueryKey, getListPitchJudgesQueryKey,
  getGetTrainerDashboardQueryKey, useGetTrainerDashboard,
   getListZoomRecordingAlertsQueryKey, getGetProgramBrandingQueryKey, getGetOwnProfileQueryKey, getListParticipantInvitationsQueryKey, useGetProgramBranding, useGetOwnProfile, useListAllProgramLifecycleEvents,
  getListSupportQueryKey, getListSupportCalendlyMeetingsQueryKey, getListSupportGoogleCalendarMeetingsQueryKey,
  useListSupportCalendlyMeetings, useListSupportGoogleCalendarMeetings, useCreateBusiness, useCreatePitch, useCreateProgram,
  useCreateOrUpdateZoomMeeting, useCreateSession, useCreateStaff, useCreateSupport, useDeleteBusiness, useDeletePitch,
  useArchiveProgram, useRestoreProgram, useListProgramLifecycleEvents, useDeleteSession, useDeleteSupport, useGetBusiness,
  useDeleteStaff, useDisconnectZoom, useGetAuthMe, useGetDashboard, useGetZoomStatus, useListBusinesses, useListPitches, useListPrograms,
  useListSessions, useListStaff, useListSupport, useGetMentorBookingStatus, useUpdateBusiness, useUpdateMentorBookingFollowUp, useUpdatePitch,
  useStartZoomConnection, useUpdateProgram, useUpdateSession, useUpdateSupport,
  useUpdateStaff, useAssignPitchJudge, useRemovePitchJudge, useListPitchJudges,
   useListZoomRecordingAlerts, useRetryZoomRecordingAlertEmail, useCreateParticipantInvitation, useListParticipantInvitations,
  useRetryStaffInvitationEmail,
} from '@workspace/api-client-react';
import type {
  Business, BusinessInput, BusinessStage, BusinessUpdate, MentorBookingStatus, MentorBookingFollowUpUpdate, PitchInput,
  AllProgramLifecycleEvent, PitchRecord, PitchUpdate, Program, ProgramInput, ProgramLifecycleEvent, ProgramUpdate,
  Session, SessionInput, SessionUpdate, SupportEngagement, SupportInput,
  StaffInput, StaffMember, StaffUpdate, SupportUpdate,
} from '@workspace/api-client-react';
import {
   Activity, ArrowRight, ArrowUpRight, BarChart3, BookOpen, BriefcaseBusiness, CircleDollarSign, KeyRound,
   CalendarCheck, CalendarDays, Check, ChevronDown, CircleAlert, Download, ExternalLink, LogOut, RefreshCw,
   FileText, Filter, Handshake, LayoutDashboard, MapPin,
   History, Pencil, Plus, Search, Shield, Sparkles, Trash2, Trophy, UserPlus, Users, Video, X, Palette,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { SessionCalendar } from './session-calendar';
import { AccessibleDialogSurface, UnsavedChangesDialog } from './accessible-dialog';
import { getStaffNavigationItems, MobileStaffNavigation } from './mobile-staff-navigation';
import { isStaffNavigationItemActive } from './staff-navigation-items';
import { participantSignInInstructions } from './participant-dashboard-helpers';
import { trackEvent, trackZoomFailure } from './lib/analytics';
import { brandedAdminRoleLabel, getDisplayBrandName, LanguageProvider, LanguageToggle, currentLanguage, t, useAppLanguage } from './language';
import { downloadProgramLifecycleCsv } from './program-lifecycle-export';

const ApplicationsReviewPage = lazy(() => import('./intake-surfaces').then(module => ({ default: module.ApplicationsReviewPage })));
const ApplyPage = lazy(() => import('./intake-surfaces').then(module => ({ default: module.ApplyPage })));
const ParticipantDashboardPage = lazy(() => import('./intake-surfaces').then(module => ({ default: module.ParticipantDashboardPage })));
const CourseManagementPage = lazy(() => import('./course-surfaces').then(module => ({ default: module.CourseManagementPage })));
const JudgeDashboardPage = lazy(() => import('./role-surfaces').then(module => ({ default: module.JudgeDashboardPage })));
const MentorDashboardPage = lazy(() => import('./role-surfaces').then(module => ({ default: module.MentorDashboardPage })));
const RoleFrame = lazy(() => import('./role-surfaces').then(module => ({ default: module.RoleFrame })));
const RoleNotFound = lazy(() => import('./role-surfaces').then(module => ({ default: module.RoleNotFound })));
const TrainerDashboardPage = lazy(() => import('./role-surfaces').then(module => ({ default: module.TrainerDashboardPage })));
const RoleAccessPage = lazy(() => import('./role-access').then(module => ({ default: module.RoleAccessPage })));
const ProgramTeamAssignmentsPage = lazy(() => import('./team-assignments').then(module => ({ default: module.ProgramTeamAssignmentsPage })));
const CommunicationsPage = lazy(() => import('./communications-surfaces').then(module => ({ default: module.CommunicationsPage })));
const ProgramAnalyticsPage = lazy(() => import('./analytics-surfaces').then(module => ({ default: module.ProgramAnalyticsPage })));
const CertificateVerificationPage = lazy(() => import('./learning-progress').then(module => ({ default: module.CertificateVerificationPage })));
const LearningProgressAnalytics = lazy(() => import('./learning-progress').then(module => ({ default: module.LearningProgressAnalytics })));
const GrantManagementPage = lazy(() => import('./grant-surfaces').then(module => ({ default: module.GrantManagementPage })));
const BrandingPage = lazy(() => import('./branding-surfaces').then(module => ({ default: module.BrandingPage })));
const ApiIntegrationsPage = lazy(() => import('./api-integrations').then(module => ({ default: module.ApiIntegrationsPage })));
const OwnProfilePage = lazy(() => import('./profile-surfaces').then(module => ({ default: module.OwnProfilePage })));
const AdminProfilesPage = lazy(() => import('./profile-surfaces').then(module => ({ default: module.AdminProfilesPage })));
const ParticipantProfilePage = lazy(() => import('./profile-surfaces').then(module => ({ default: module.ParticipantProfilePage })));
const SessionRecordingPlayer = lazy(() => import('./session-recording-player').then(module => ({ default: module.SessionRecordingPlayer })));
const StaffSessionInteractions = lazy(() => import('./session-interactions').then(module => ({ default: module.StaffSessionInteractions })));
const AuthPage = lazy(() => import('./clerk-auth-page').then(module => ({ default: module.ClerkAuthPage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

type Field = { name: string; label: string; kind?: 'text' | 'email' | 'date' | 'time' | 'number' | 'url' | 'textarea' | 'select' | 'multiselect'; options?: { value: string; label: string }[]; required?: boolean; wide?: boolean; placeholder?: string; hint?: string; min?: number; max?: number; step?: number };
type Values = Record<string, string>;

const stageNames: Record<string, string> = {
  application: 'Application', bootcamp: 'Bootcamp', incubator: 'Incubation',
  pitch: 'Pitch day', demo_day: 'Demo day', grant_awarded: 'Grant awarded',
  alumni: 'Alumni', declined: 'Declined',
};
const businessStages: BusinessStage[] = ['application', 'bootcamp', 'incubator', 'pitch', 'demo_day', 'grant_awarded', 'alumni', 'declined'];
const dateLabel = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const calendlyMeetingDateTime = (value: string, timezone: string | null) => {
  const locale = currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB';
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
  if (timezone) {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(new Date(value));
    } catch {
      // Use the browser's local timezone if Calendly provided an unsupported timezone label.
    }
  }
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
};
const industryLabel = (value?: string | null) => value ? t(value) : '—';
type MentorFollowUpStatus = 'overdue' | 'upcoming' | 'undated';
const localCalendarDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const mentorFollowUpStatus = (date: string | null, today: string): MentorFollowUpStatus => !date ? 'undated' : date < today ? 'overdue' : 'upcoming';
const money = (value?: number | null) => new Intl.NumberFormat(currentLanguage() === 'ar' ? 'ar-JO' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
const display = (v?: string | null) => v ? t(v === 'coordinator' ? 'Admin' : v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())) : '—';
const statusTone = (status: string) => {
  if (['active', 'completed', 'scheduled', 'awarded', 'grant_awarded', 'incubator', 'delivered'].includes(status)) return 'good';
  if (['declined', 'cancelled', 'not_awarded', 'failed'].includes(status)) return 'bad';
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

function ProgramMultiSelect({ field, value, onChange, autoFocus = false }: { field: Field; value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const options = field.options ?? [];
  const optionValues = options.map(option => option.value);
  const selected = selectedOptionValues(value, optionValues);
  const selectedSet = new Set(selected);
  const allSelected = options.length > 0 && selected.length === options.length;
  const partiallySelected = selected.length > 0 && !allSelected;
  const summaryText = allSelected
    ? t('All programs selected')
    : selected.length === 1
      ? `1 ${t('program selected')}`
      : selected.length > 1
        ? `${selected.length} ${t('programs selected')}`
        : t('Choose programs…');

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target) && detailsRef.current) {
        detailsRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    return () => document.removeEventListener('pointerdown', closeWhenOutside);
  }, []);

  const updateOption = (optionValue: string | null, checked: boolean) => {
    onChange(updateMultiSelectValue(value, optionValues, optionValue, checked));
  };

  return <details
    ref={detailsRef}
    className="program-multiselect"
    data-testid={`multiselect-${field.name}`}
    onKeyDown={event => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        detailsRef.current.open = false;
        summaryRef.current?.focus();
      }
    }}
  >
    <summary
      ref={summaryRef}
      className="form-control program-multiselect-summary"
      aria-label={`${t(field.label)}: ${summaryText}`}
      data-testid={`input-${field.name}`}
      data-dialog-autofocus={autoFocus ? '' : undefined}
    >
      <span>{summaryText}</span><ChevronDown size={14} aria-hidden="true" />
    </summary>
    <div className="program-multiselect-menu" role="group" aria-label={t(field.label)}>
      {options.length ? <>
        <label className="program-multiselect-option program-multiselect-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            aria-label={t('Select all programs')}
            data-testid={`multiselect-select-all-${field.name}`}
            onChange={event => updateOption(null, event.currentTarget.checked)}
          />
          <span>{t('Select all programs')}</span>
        </label>
        {options.map(option => <label className="program-multiselect-option" key={option.value}>
          <input
            type="checkbox"
            checked={selectedSet.has(option.value)}
            data-testid={`multiselect-option-${field.name}-${option.value}`}
            onChange={event => updateOption(option.value, event.currentTarget.checked)}
          />
          <span>{option.label}</span>
        </label>)}
      </> : <p className="program-multiselect-empty">{t('No active programs are available.')}</p>}
    </div>
  </details>;
}

function FieldControl({ field, value, onChange, autoFocus = false }: { field: Field; value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  const common = { value, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value), required: field.required, placeholder: field.placeholder, 'data-testid': `input-${field.name}`, 'data-dialog-autofocus': autoFocus ? '' : undefined };
  if (field.kind === 'textarea') return <textarea {...common} rows={3} className="form-control resize-y" />;
  if (field.kind === 'multiselect') return <ProgramMultiSelect field={field} value={value} onChange={onChange} autoFocus={autoFocus} />;
  if (field.kind === 'select') return <select {...common} className="form-control"><option value="">{t('Choose…')}</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  return <input {...common} type={field.kind || 'text'} min={field.min ?? (field.kind === 'number' ? '0' : undefined)} max={field.max} step={field.step} className="form-control" />;
}

function FormDialog({ title, description, fields, initial, loading, onClose, onSubmit, error, submitLabel }: {
  title: string; description?: string; fields: Field[]; initial?: Values; loading?: boolean;
  onClose: () => void; onSubmit: (values: Values) => void; error?: string; submitLabel?: string;
}) {
  useAppLanguage();
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map(f => [f.name, initial?.[f.name] ?? ''])));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialValues = Object.fromEntries(fields.map(field => [field.name, initial?.[field.name] ?? '']));
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  const requestClose = () => {
    if (loading) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  return <>
    <AccessibleDialogSurface className="modal-card" labelledBy="dialog-title" describedBy={description ? 'dialog-description' : error ? 'dialog-error' : undefined} initialFocusSelector="[data-dialog-autofocus]" onClose={requestClose} closeOnEscape={!dirty && !loading} closeOnOutsideInteraction={!dirty && !loading} onDismissAttempt={() => { if (dirty && !loading) setConfirmDiscard(true); }}>
      <div className="modal-head"><div><div className="eyebrow">{t('PROGRAM HUB / RECORD')}</div><h2 id="dialog-title" className="app-title">{t(title)}</h2>{description && <p id="dialog-description">{t(description)}</p>}</div><button className="icon-button" aria-label={t('Close dialog')} onClick={requestClose} disabled={loading} data-testid="button-close-dialog"><X size={18} /></button></div>
      <form onSubmit={e => { e.preventDefault(); onSubmit(values); }} className="modal-form">
        {fields.some(field => field.required) && <small className="field-hint form-required-note" role="note">{t('Fields marked * are required.')}</small>}
        <div className="form-grid">{fields.map((field, index) => {
          const label = <span id={`field-label-${field.name}`}>{t(field.label)}{field.required && <i aria-hidden="true"> *</i>}</span>;
          const control = <FieldControl field={{ ...field, placeholder: field.placeholder ? t(field.placeholder) : undefined, options: field.options?.map(option => ({ ...option, label: t(option.label) })) }} autoFocus={index === 0} value={values[field.name] || ''} onChange={value => setValues(previous => ({ ...previous, [field.name]: value }))} />;
          const hint = field.hint && <small className="field-hint">{t(field.hint)}</small>;
          return field.kind === 'multiselect'
            ? <div key={field.name} className={`field ${field.wide ? 'field-wide' : ''}`}>{label}{control}{hint}</div>
            : <label key={field.name} className={`field ${field.wide ? 'field-wide' : ''}`}>{label}{control}{hint}</label>;
        })}</div>
        {error && <div id="dialog-error" className="form-error" role="alert"><CircleAlert size={16} />{t(error)}</div>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={requestClose} disabled={loading} data-testid="button-cancel">{t('Cancel')}</button><button className="button button-primary" type="submit" disabled={loading} data-testid="button-save">{loading ? t('Saving…') : <><Check size={16} /> {t(submitLabel ?? 'Save record')}</>}</button></div>
      </form>
    </AccessibleDialogSurface>
    {confirmDiscard && <UnsavedChangesDialog onKeepEditing={() => setConfirmDiscard(false)} onDiscard={() => { setConfirmDiscard(false); onClose(); }} />}
  </>;
}

function ConfirmDialog({ item, onCancel, onConfirm, loading, error }: { item: string; onCancel: () => void; onConfirm: () => void; loading?: boolean; error?: string }) {
  return <AccessibleDialogSurface className="confirm-card" role="alertdialog" labelledBy="confirm-dialog-title" describedBy="confirm-dialog-description" initialFocusSelector="[data-dialog-autofocus]" onClose={onCancel} closeOnOutsideInteraction={false} closeOnEscape={!loading}>
      <div className="confirm-symbol"><Trash2 size={20} /></div><h2 id="confirm-dialog-title" className="app-title">{t('Remove this record?')}</h2><p id="confirm-dialog-description"><strong>{t(item)}</strong> {t('will be permanently removed from the workspace. This cannot be undone.')}</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><button className="button button-quiet" onClick={onCancel} disabled={loading} data-dialog-autofocus data-testid="button-keep-record">{t('Keep record')}</button><button className="button button-danger" onClick={onConfirm} disabled={loading} data-testid="button-confirm-delete">{loading ? t('Removing…') : t('Remove record')}</button></div>
  </AccessibleDialogSurface>;
}

function Shell({ children, staff, displayName }: { children: ReactNode; staff: StaffMember; displayName: string }) {
  const [path] = useLocation();
  const { signOut } = useClerk();
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const branding = brandingQuery.data;
  const brandName = getDisplayBrandName(branding?.brandName);
  const specialistRoles = [...new Set(staff.programRoles.map(({ role }) => role))];
  const specialistItems = specialistRoles.map(role => ({
    href: `/${role}`,
    label: role === 'trainer' ? 'Trainer workspace' : role === 'mentor' ? 'Mentor workspace' : 'Judge workspace',
    icon: role === 'trainer' ? BookOpen : role === 'mentor' ? Handshake : Trophy,
  }));
  const nav = [...getStaffNavigationItems(staff.primaryRole === 'coordinator' ? 'coordinator' : 'staff'), ...specialistItems];
  const label = nav.find(item => isStaffNavigationItemActive(path, item.href))?.label || 'Workspace';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'J';
  return <div className="workspace noise">
    <aside className="sidebar">
       <Link href="/" className="brand" data-testid="link-brand">{branding?.logoUrl ? <img className="brand-logo" src={branding.logoUrl} alt="" /> : <span className="brand-mark">{brandName.slice(0, 1) || 'J'}</span>}<span><b>{brandName}</b><small>{t('PROGRAM HUB')}</small></span></Link>
       <div className="workspace-tag"><span className="live-dot" /> {t('PROGRAM OPERATIONS')}</div>
       <nav className="side-nav" aria-label={t('Main navigation')}>{nav.map(item => {
         const Icon = item.icon; const active = isStaffNavigationItemActive(path, item.href);
         return <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{t(item.label)}</span>{item.href === '/businesses' && <span className="nav-rail" />}</Link>;
      })}</nav>
      <div className="sidebar-bottom">
         <div className="sidebar-note"><Sparkles size={15} /><div><b>{t('One journey, in view.')}</b><span>{t('Move each founder forward.')}</span></div></div>
          <div className="profile"><div className="profile-avatar">{initials}</div><div className="profile-copy"><b>{displayName}</b><small>{staff.primaryRole === 'coordinator' ? brandedAdminRoleLabel(branding?.brandName) : t('Program staff')}</small></div><button type="button" className="profile-signout" onClick={() => void signOut({ redirectUrl: basePath || '/' })} aria-label={t('Sign out')}><LogOut size={15} /></button></div>
      </div>
    </aside>
    <main className="main-panel">
        <header className="topbar"><div className="crumb"><span data-testid="breadcrumb-brand-name">{brandName}</span><span className="crumb-slash">/</span><b data-testid="staff-current-page">{t(label)}</b></div><div className="topbar-actions"><span className="today-label"><CalendarDays size={14} /> {new Date().toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="role-chip">{staff.primaryRole === 'coordinator' ? t('ADMIN') : t('STAFF')}</span><LanguageToggle /></div></header>
       <MobileStaffNavigation items={nav} currentPath={path} onSignOut={() => void signOut({ redirectUrl: basePath || '/' })} />
      <div className="page-content page-enter">{children}</div>
        <footer className="footer footer-brandless"><span>{t('PROGRAM OPERATIONS')} <i /> {t('FIELD NOTES')}</span></footer>
    </main>
  </div>;
}

function PageHeading({ kicker, title, summary, action }: { kicker: string; title: string; summary: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{t(kicker)}</div><h1 className="app-title">{t(title)}</h1><p>{t(summary)}</p></div>{action}</div>;
}

function LoadingState({ label = 'Loading program records' }: { label?: string }) {
  return <div className="loading-panel" aria-label={t(label)}><div className="skeleton skeleton-wide" /><div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <div className="empty-panel error-panel"><div className="empty-icon"><CircleAlert size={22} /></div><h3>{t("We couldn't load this view.")}</h3><p>{t('Your records are safe. Try connecting again.')}</p><button className="button button-outline" onClick={retry} data-testid="button-retry"><Activity size={15} /> {t('Retry connection')}</button></div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-panel"><div className="empty-icon"><FileText size={21} /></div><h3>{t(title)}</h3><p>{t(body)}</p>{action}</div>;
}

function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`badge badge-${statusTone(value)}`}><span />{t(label || display(value))}</span>;
}

function Metric({ label, value, hint, icon: Icon, accent, trend }: { label: string; value: string | number; hint: string; icon: typeof Users; accent?: string; trend?: string }) {
  return <article className={`metric-card ${accent || ''}`}><div className="metric-top"><span>{t(label)}</span><span className="metric-icon"><Icon size={17} /></span></div><strong className="metric-value">{value}</strong><div className="metric-bottom"><span>{t(hint)}</span>{trend && <span className="metric-trend"><ArrowUpRight size={13} />{t(trend)}</span>}</div></article>;
}

function Overview() {
  const query = useGetDashboard(); const dashboard = query.data;
  const stages = dashboard?.stageCounts || [];
  const max = Math.max(1, ...stages.map(stage => stage.count));
  if (query.isLoading) return <><PageHeading kicker="OPERATIONS / LIVE VIEW" title="Good work, moving." summary="A clear view of the founders, milestones and next moments in your program." /><LoadingState /></>;
  if (query.isError || !dashboard) return <><PageHeading kicker="OPERATIONS / LIVE VIEW" title="Good work, moving." summary="A clear view of the founders, milestones and next moments in your program." /><ErrorState retry={() => void query.refetch()} /></>;
  return <>
    <PageHeading kicker="OPERATIONS / LIVE VIEW" title="Good work, moving." summary="A clear view of the founders, milestones and next moments in your program." action={<Link href="/businesses" className="button button-primary"><Plus size={16} /> {t('Add a business')}</Link>} />
    <section className="metric-grid">
      <Metric label="Active programs" value={dashboard.programs} hint="Cohorts in motion" icon={Activity} trend="across formats" />
      <Metric label="Applications" value={dashboard.applications} hint="In the pipeline" icon={Users} accent="metric-coral" />
      <Metric label="In incubation" value={dashboard.incubatorBusinesses} hint="Building with support" icon={BriefcaseBusiness} accent="metric-sand" />
      <Metric label="Support in progress" value={dashboard.supportInProgress} hint="Engagements underway" icon={Handshake} />
      <Metric label="Grants awarded" value={dashboard.grantsAwarded} hint={money(dashboard.totalGrantAmount) + ' committed'} icon={Trophy} accent="metric-coral" />
    </section>
    <div className="overview-grid">
       <section className="panel stage-panel"><div className="panel-heading"><div><div className="eyebrow">{t('FOUNDER JOURNEY')}</div><h2 className="app-title">{t('Where the work is')}</h2></div><Link href="/businesses" className="text-link">{t('Open pipeline')} <ArrowRight size={14} /></Link></div>
        {stages.length ? <div className="stage-list">{businessStages.map((key, index) => {
          const entry = stages.find(item => item.stage === key); const count = entry?.count || 0;
           return <div className="stage-row" key={key}><span className="stage-number mono">{String(index + 1).padStart(2, '0')}</span><span className="stage-name">{t(stageNames[key])}</span><div className="stage-track"><div className={`stage-fill stage-fill-${index % 5}`} style={{ width: `${Math.max(count ? 8 : 0, count / max * 100)}%` }} /></div><span className="stage-count mono">{count}</span></div>;
        })}</div> : <EmptyState title="The journey starts here." body="Once founders enter the pipeline, their progress will appear across every stage." action={<Link href="/businesses" className="text-link">{t('Add your first business')} <ArrowRight size={14} /></Link>} />}
         <div className="journey-foot"><span><span className="live-dot" /> {t('THE FULL JOURNEY, AT A GLANCE')}</span><span>{dashboard.applications + dashboard.incubatorBusinesses} {t('founders tracked')}</span></div>
      </section>
       <section className="panel upcoming-panel"><div className="panel-heading"><div><div className="eyebrow">{t('ON THE CALENDAR')}</div><h2 className="app-title">{t('Upcoming sessions')}</h2></div><Link href="/sessions" className="text-link">{t('All sessions')} <ArrowRight size={14} /></Link></div>
        <div className="session-preview-list">{dashboard.upcomingSessions.length ? dashboard.upcomingSessions.slice(0, 5).map(session => {
          const hasZoom = session.deliveryMode !== 'in_person' && Boolean(session.zoomUrl);
           return <div className="session-preview" key={session.id}><div className="date-block"><b>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).getDate()}</b><span>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: 'short' }).toUpperCase()}</span></div><div className="session-info"><b>{session.title}</b><span>{display(session.type)} · {display(session.deliveryMode)}{session.startTime ? ` · ${session.startTime}` : ''}{session.location ? ` · ${session.location}` : ''}</span></div>{hasZoom ? <a href={session.zoomUrl!} target="_blank" rel="noreferrer" className="session-join" aria-label={`${t('Join')} ${session.title} ${t('on Zoom')}`}><Video size={15} /></a> : <span className="session-join disabled" aria-label={session.deliveryMode === 'in_person' ? t('In-person session') : t('No Zoom link available')}><Video size={15} /></span>}</div>;
        }) : <EmptyState title="Nothing on the calendar yet." body="Schedule a bootcamp, training or pitch event to give the cohort its next milestone." action={<Link href="/sessions" className="text-link">{t('Plan a session')} <ArrowRight size={14} /></Link>} />}</div>
      </section>
    </div>
       <section className="panel recent-panel"><div className="panel-heading"><div><div className="eyebrow">{t('LATEST MOVEMENT')}</div><h2 className="app-title">{t('Recently added businesses')}</h2></div><Link href="/businesses" className="text-link">{t('View pipeline')} <ArrowRight size={14} /></Link></div>
       {dashboard.recentBusinesses.length ? <div className="table-wrap"><table><thead><tr><th>{t('BUSINESS / FOUNDER')}</th><th>{t('INDUSTRY')}</th><th>{t('STAGE')}</th><th>{t('APPLIED')}</th><th /></tr></thead><tbody>{dashboard.recentBusinesses.slice(0, 5).map(business => <tr key={business.id}><td><div className="company-cell"><span className="company-monogram">{business.businessName.slice(0, 1).toUpperCase()}</span><span><b>{business.businessName}</b><small>{business.founderName}</small></span></div></td><td>{business.industry || '—'}</td><td><Badge value={business.stage} label={stageNames[business.stage]} /></td><td>{dateLabel(business.applicationDate)}</td><td><Link href="/businesses" className="row-arrow" aria-label={`${t('View')} ${business.businessName}`}><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title="No businesses added yet." body="Applications and founder records will appear here as the program gets underway." action={<Link href="/businesses" className="text-link">{t('Add a founder')} <ArrowRight size={14} /></Link>} />}
    </section>
     <div className="dashboard-note"><span className="note-mark">J</span><span><b>{t('The work is the journey.')}</b> {t('Outreach to grant decision — keep every next step visible.')}</span><Link href="/programs">{t('Program setup')} <ArrowRight size={14} /></Link></div>
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
  { name: 'notes', label: 'Admin notes', kind: 'textarea', wide: true },
];
const sessionFields = (programs: Program[], trainers: StaffMember[] = [], isAdmin = false): Field[] => [
  { name: 'title', label: 'Session title', required: true, wide: true },
  { name: 'type', label: 'Session type', kind: 'select', required: true, options: ['bootcamp', 'hackathon', 'training', 'pitch_day', 'demo_day', 'other'].map(v => ({ value: v, label: display(v) })) },
  { name: 'deliveryMode', label: 'Delivery mode', kind: 'select', required: true, options: [{ value: 'online', label: 'Online' }, { value: 'in_person', label: 'In person' }, { value: 'hybrid', label: 'Hybrid' }] },
  sessionProgramField(programs, isAdmin),
  { name: 'status', label: 'Status', kind: 'select', options: ['scheduled', 'completed', 'cancelled'].map(v => ({ value: v, label: display(v) })) },
  { name: 'scheduledDate', label: 'Date', kind: 'date', required: true },
  { name: 'startTime', label: 'Start time', kind: 'time' },
  { name: 'durationMinutes', label: 'Duration (minutes)', kind: 'number', min: 15, max: 480, step: 15, required: true },
  { name: 'facilitator', label: 'Facilitator' },
  ...(isAdmin ? [{ name: 'trainerStaffId', label: 'Assigned trainer', kind: 'select' as const, options: trainers.map(person => ({ value: String(person.id), label: person.email })) }] : []),
  { name: 'location', label: 'Location', wide: true, placeholder: 'Venue, room or meeting space' },
  { name: 'zoomUrl', label: 'Zoom meeting link', kind: 'url', wide: true, placeholder: 'https://…' },
  { name: 'recordingUrl', label: 'Google Drive recording link', kind: 'url', wide: true, placeholder: 'https://drive.google.com/file/d/…/view', hint: 'After uploading the video to Drive, paste its share link here. Make sure the intended cohort can view the file; Drive permission settings control playback.' },
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
const pitchFields = (businesses: Business[], coordinator: boolean): Field[] => [
  { name: 'businessId', label: 'Business', kind: 'select', required: true, options: businesses.map(b => ({ value: String(b.id), label: b.businessName })) },
  { name: 'eventType', label: 'Event', kind: 'select', required: true, options: [{ value: 'pitch_day', label: 'Pitch day' }, { value: 'demo_day', label: 'Demo day' }] },
  { name: 'eventDate', label: 'Event date', kind: 'date', required: true },
  { name: 'score', label: 'Score (0–100)', kind: 'number' },
  { name: 'judges', label: 'Judges', wide: true, placeholder: 'Names separated by commas' },
  ...(coordinator ? [
    { name: 'grantDecision', label: 'Grant decision', kind: 'select' as const, options: ['pending', 'awarded', 'not_awarded'].map(v => ({ value: v, label: display(v) })) },
    { name: 'grantAmount', label: 'Grant amount (USD)', kind: 'number' as const },
  ] : []),
  { name: 'feedback', label: 'Evaluation feedback', kind: 'textarea', wide: true },
];
const staffRoleOptions = [
  { value: 'staff', label: 'Program staff' },
  { value: 'coordinator', label: 'Admin' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'judge', label: 'Judge' },
];
const staffInviteFields: Field[] = [
  { name: 'email', label: 'Approved staff email', kind: 'email', required: true, wide: true },
  { name: 'role', label: 'Access role', kind: 'select', required: true, options: staffRoleOptions },
];
const participantInviteFields: Field[] = [
  { name: 'email', label: 'Participant email', kind: 'email', required: true, wide: true },
  { name: 'displayName', label: 'Participant name (optional)', kind: 'text', wide: true },
  { name: 'businessId', label: 'Program and business', kind: 'select', required: true, wide: true },
];
const staffRoleFields: Field[] = [
  { name: 'role', label: 'Access role', kind: 'select', required: true, options: staffRoleOptions },
];
const valueOf = (value?: string | number | null) => value == null ? '' : String(value).slice(0, 10);

function ProgramsPage({ coordinator }: { coordinator: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const [historyProgram, setHistoryProgram] = useState<Program | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const query = useListPrograms(coordinator && showArchived ? { includeArchived: true } : undefined);
  const programs = query.data || [];
  const client = useQueryClient();
  const create = useCreateProgram();
  const update = useUpdateProgram();
  const archive = useArchiveProgram();
  const restore = useRestoreProgram();
  const [editing, setEditing] = useState<Program | null | undefined>(undefined);
  const [archiving, setArchiving] = useState<Program | null>(null);
  const refreshPrograms = () => invalidate(client, [getListProgramsQueryKey(), getGetDashboardQueryKey()]);
  const save = (v: Values) => {
    const data: ProgramInput = { name: v.name.trim(), format: (v.format || 'bootcamp') as ProgramInput['format'], status: (v.status || 'planning') as ProgramInput['status'], description: v.description || null, startDate: v.startDate || null, endDate: v.endDate || null, applicationDeadline: v.applicationDeadline || null };
    const done = () => { refreshPrograms(); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as ProgramUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const confirmArchive = () => archiving && archive.mutate({ id: archiving.id }, {
    onSuccess: () => { refreshPrograms(); setArchiving(null); },
  });
  const restoreProgram = (program: Program) => restore.mutate({ id: program.id }, { onSuccess: refreshPrograms });
  const headingAction = coordinator
    ? <button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-program"><Plus size={16} /> {t('New program')}</button>
    : undefined;
  return <>
    <PageHeading kicker="PROGRAM MANAGEMENT / COHORTS" title="Programs" summary="Set the shape of each cohort, from first call to final milestone." action={headingAction} />
    {coordinator && <div className="section-strip">
      <span>{showArchived ? t('Archived program records') : t('Active programs')}</span>
      <div className="program-history-toolbar">
        <button className="button button-quiet" type="button" onClick={() => setShowAllHistory(true)} data-testid="button-all-program-history"><History size={14} /> {t('All archive and restore history')}</button>
        <button className="button button-quiet" type="button" aria-pressed={showArchived} data-testid="button-toggle-archived-programs" onClick={() => setShowArchived(value => !value)}>
          {showArchived ? t('Show active programs') : t('Show archived programs')}
        </button>
      </div>
    </div>}
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : programs.length === 0
      ? <EmptyState title={showArchived ? 'No archived programs.' : coordinator ? 'A good program starts with a clear plan.' : 'No active programs are assigned to you.'} body={coordinator ? 'Create a cohort or switch views to review archived program history.' : 'Ask an admin to assign you to an active program.'} action={coordinator && !showArchived ? <button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> {t('Create a program')}</button> : undefined} />
      : <><div className="section-strip"><span><b>{programs.length}</b> {showArchived ? t('archived programs') : t('active cohorts')}</span><span><span className="live-dot" /> {t('Keep cohort dates current')}</span></div><div className="program-grid">{programs.map((program, index) => <article className="program-card" key={program.id} data-testid={`card-program-${program.id}`}><div className="program-card-top"><div className={`program-symbol program-symbol-${index % 3}`}>{program.format === 'bootcamp' ? 'B' : 'H'}</div><Badge value={program.archivedAt ? 'archived' : program.status} /><div className="row-actions">
        {coordinator && !program.archivedAt && <><button className="icon-button" onClick={() => setEditing(program)} aria-label={`Edit ${program.name}`} data-testid={`button-edit-program-${program.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setArchiving(program)} aria-label={`Archive ${program.name}`} data-testid={`button-archive-program-${program.id}`}><Trash2 size={15} /></button></>}
        {coordinator && program.archivedAt && <button className="icon-button" onClick={() => restoreProgram(program)} aria-label={`Restore ${program.name}`} data-testid={`button-restore-program-${program.id}`} disabled={restore.isPending}><RefreshCw size={15} /></button>}
        {coordinator && <button className="icon-button" onClick={() => setHistoryProgram(program)} aria-label={`View archive and restore history for ${program.name}`} data-testid={`button-program-history-${program.id}`}><History size={15} /></button>}
      </div></div><div className="eyebrow">{display(program.format)} {t('COHORT')} {program.archivedAt ? `· ${t('ARCHIVED')}` : ''}</div><h2 className="app-title">{program.name}</h2><p className="program-description">{program.description || t('A founder-focused program moving ideas into their next stage.')}</p><div className="program-dates"><div><span>{t('APPLICATION DEADLINE')}</span><b>{dateLabel(program.applicationDeadline)}</b></div><div><span>{t('PROGRAM WINDOW')}</span><b>{dateLabel(program.startDate)} <i>→</i> {dateLabel(program.endDate)}</b></div></div>{!program.archivedAt && <Link href={`/businesses?programId=${program.id}`} className="program-link">{t('View cohort businesses')} <ArrowRight size={15} /></Link>}</article>)}</div></>}
    {(archive.error || restore.error) && <div className="form-error" role="alert">{apiErrorMessage(archive.error || restore.error, 'The program archive change could not be completed.')}</div>}
    {historyProgram && <ProgramLifecycleHistoryDialog program={historyProgram} onClose={() => setHistoryProgram(null)} />}
    {showAllHistory && <AllProgramLifecycleHistoryDialog onClose={() => setShowAllHistory(false)} />}
    {editing !== undefined && <FormDialog title={editing ? 'Edit program' : 'Create a program'} description="A cohort is the backbone of the founder journey." fields={programFields} initial={editing ? { name: editing.name, format: editing.format, status: editing.status, description: editing.description || '', startDate: valueOf(editing.startDate), endDate: valueOf(editing.endDate), applicationDeadline: valueOf(editing.applicationDeadline) } : { format: 'bootcamp', status: 'planning' }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={(create.error || update.error) ? 'Could not save this program. Check required fields and try again.' : undefined} />}
    {archiving && <AccessibleDialogSurface className="confirm-card" role="alertdialog" labelledBy="archive-program-title" describedBy="archive-program-description" initialFocusSelector="[data-dialog-autofocus]" onClose={() => setArchiving(null)} closeOnOutsideInteraction={false} closeOnEscape={!archive.isPending}><div className="confirm-symbol"><Trash2 size={20} /></div><h2 id="archive-program-title" className="app-title">{t('Archive this program?')}</h2><p id="archive-program-description"><strong>{archiving.name}</strong> {t('will be hidden from active operations. Its applications, businesses and reports will be retained, and you can restore it later.')}</p>{archive.error && <div className="form-error" role="alert">{apiErrorMessage(archive.error, 'The program could not be archived.')}</div>}<div className="modal-actions"><button className="button button-quiet" data-dialog-autofocus onClick={() => setArchiving(null)} disabled={archive.isPending}>{t('Cancel')}</button><button className="button button-danger" onClick={confirmArchive} disabled={archive.isPending}>{archive.isPending ? t('Archiving…') : t('Archive program')}</button></div></AccessibleDialogSurface>}
  </>;
}

function AllProgramLifecycleHistoryDialog({ onClose }: { onClose: () => void }) {
  const query = useListAllProgramLifecycleEvents();
  const events: AllProgramLifecycleEvent[] = query.data || [];
  return <AccessibleDialogSurface className="modal-card lifecycle-history-modal all-program-lifecycle-history-modal" labelledBy="all-program-history-title" describedBy="all-program-history-description" initialFocusSelector="#all-program-history-title" onClose={onClose} testId="dialog-all-program-history">
      <div className="modal-head"><div><div className="eyebrow">{t('PROGRAM MANAGEMENT / AUDIT')}</div><h2 id="all-program-history-title" className="app-title" tabIndex={-1}>{t('Archive and restore history')}</h2><p id="all-program-history-description">{t('Recent changes across all programs')}</p></div><button className="icon-button" aria-label={t('Close history')} onClick={onClose} data-testid="button-close-all-program-history"><X size={18} /></button></div>
      <div className="lifecycle-history-content">
        {query.isLoading ? <LoadingState /> : query.isError
          ? <div className="lifecycle-history-error"><p>{t('Program history could not be loaded.')}</p><button className="button button-quiet" onClick={() => void query.refetch()}>{t('Retry')}</button></div>
          : events.length === 0 ? <p className="lifecycle-history-empty">{t('No archive or restore actions have been recorded.')}</p>
            : <ol className="lifecycle-history-list">{events.map(event => <li className="lifecycle-history-event" key={`${event.programId}-${event.id}`} data-testid={`all-program-history-event-${event.programId}-${event.id}`}>
              <span className={`lifecycle-history-mark ${event.action}`} aria-hidden="true"><History size={15} /></span>
              <div className="lifecycle-history-details"><strong>{t(event.action === 'archived' ? 'Program archived' : 'Program restored')}</strong><b className="lifecycle-history-program">{event.programName}</b><time dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time><small>{event.actorEmail || t('Actor account no longer exists')}</small></div>
            </li>)}</ol>}
      </div>
  </AccessibleDialogSurface>;
}

function ProgramLifecycleHistoryDialog({ program, onClose }: { program: Program; onClose: () => void }) {
  const query = useListProgramLifecycleEvents(program.id);
  const events: ProgramLifecycleEvent[] = query.data || [];
  return <AccessibleDialogSurface className="modal-card lifecycle-history-modal" labelledBy="program-history-title" describedBy="program-history-description" initialFocusSelector="#program-history-title" onClose={onClose} testId={`dialog-program-history-${program.id}`}>
      <div className="modal-head"><div><div className="eyebrow">{t('PROGRAM MANAGEMENT / AUDIT')}</div><h2 id="program-history-title" className="app-title" tabIndex={-1}>{t('Archive and restore history')}</h2><p id="program-history-description">{program.name}</p></div><div className="lifecycle-history-actions"><button className="button button-quiet" type="button" onClick={() => downloadProgramLifecycleCsv(program.id, program.name, events)} disabled={query.isLoading || query.isError} data-testid="button-export-program-history-csv"><Download size={14} />{t('Export spreadsheet (CSV)')}</button><button className="icon-button" aria-label={t('Close history')} onClick={onClose} data-testid="button-close-program-history"><X size={18} /></button></div></div>
      <div className="lifecycle-history-content">
        {query.isLoading ? <LoadingState /> : query.isError
          ? <div className="lifecycle-history-error"><p>{t('Program history could not be loaded.')}</p><button className="button button-quiet" onClick={() => void query.refetch()}>{t('Retry')}</button></div>
          : events.length === 0 ? <p className="lifecycle-history-empty">{t('No archive or restore actions have been recorded for this program.')}</p>
            : <ol className="lifecycle-history-list">{events.map(event => <li className="lifecycle-history-event" key={event.id} data-testid={`program-history-event-${event.id}`}>
              <span className={`lifecycle-history-mark ${event.action}`} aria-hidden="true"><History size={15} /></span>
              <div className="lifecycle-history-details"><strong>{t(event.action === 'archived' ? 'Program archived' : 'Program restored')}</strong><time dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time><small>{event.actorEmail || t('Actor account no longer exists')}</small></div>
            </li>)}</ol>}
      </div>
  </AccessibleDialogSurface>;
}

function BusinessEditDialog({ business, programs, onClose, onSave, loading, error }: { business: Business; programs: Program[]; onClose: () => void; onSave: (values: Values) => void; loading: boolean; error?: string }) {
  const record = useGetBusiness(business.id, { query: { queryKey: getGetBusinessQueryKey(business.id) } });
  const source = record.data || business;
  return <FormDialog title="Edit business" description={record.isLoading ? 'Refreshing founder record…' : 'Keep the founder profile and next stage up to date.'} fields={businessFields(programs)} initial={{ businessName: source.businessName, founderName: source.founderName, email: source.email, phone: source.phone || '', programId: String(source.programId), industry: source.industry || '', stage: source.stage, applicationDate: valueOf(source.applicationDate), needs: source.needs || '', notes: source.notes || '' }} loading={loading || record.isLoading} onClose={onClose} onSubmit={onSave} error={error || (record.isError ? 'Showing the latest available list record.' : undefined)} />;
}

function BusinessesPage({ isAdmin }: { isAdmin: boolean }) {
  const [search, setSearch] = useState(''); const [stage, setStage] = useState(''); const [industry, setIndustry] = useState('');
  const [programId, setProgramId] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('programId') || '';
    return Number.isInteger(Number(value)) && Number(value) > 0 ? value : '';
  });
   const [editing, setEditing] = useState<Business | null | undefined>(undefined); const [deleting, setDeleting] = useState<Business | null>(null); const [participantsBusiness, setParticipantsBusiness] = useState<Business | null>(null);
  const params = useMemo(() => programId ? { programId: Number(programId) } : undefined, [programId]);
  const query = useListBusinesses(params); const programsQuery = useListPrograms(); const programs = programsQuery.data || []; const businesses = query.data || []; const client = useQueryClient();
  const industries = useMemo(() => [...new Set(businesses.map(business => business.industry?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [businesses]);
  const visibleBusinesses = useMemo(() => businesses.filter(business => {
    const searchText = `${business.businessName} ${business.founderName} ${business.email} ${business.industry || ''}`.toLowerCase();
    return (!search.trim() || searchText.includes(search.trim().toLowerCase()))
      && (!stage || business.stage === stage)
      && (!industry || business.industry === industry);
  }), [businesses, search, stage, industry]);
  const hasFilters = Boolean(search || stage || industry || programId);
  const changeProgram = (value: string) => {
    setProgramId(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('programId', value);
    else url.searchParams.delete('programId');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const clearFilters = () => {
    setSearch(''); setStage(''); setIndustry(''); changeProgram('');
  };
  const create = useCreateBusiness(); const update = useUpdateBusiness(); const remove = useDeleteBusiness();
  const save = (v: Values) => {
    const data: BusinessInput = { programId: Number(v.programId), businessName: v.businessName.trim(), founderName: v.founderName.trim(), email: v.email.trim(), phone: v.phone || null, industry: v.industry || null, stage: (v.stage || 'application') as BusinessStage, applicationDate: v.applicationDate || null, needs: v.needs || null, notes: v.notes || null };
    const done = () => { invalidate(client, [getListBusinessesQueryKey(), getGetDashboardQueryKey()]); if (editing) invalidate(client, [getGetBusinessQueryKey(editing.id)]); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as BusinessUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const confirmRemove = () => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => { invalidate(client, [getListBusinessesQueryKey(), getGetDashboardQueryKey()]); setDeleting(null); } });
  return <>
     <PageHeading kicker="FOUNDER JOURNEY / PIPELINE" title="Businesses" summary={t('Browse founders in each cohort and classify ventures by startup industry.')} action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-business"><Plus size={16} /> {t('Add business')}</button>} />
    <section className="pipeline-ribbon"><div className="ribbon-heading"><div className="eyebrow">{t('PROGRAM JOURNEY')}</div><span>{t('Follow progress, not just applications.')}</span></div><div className="ribbon-stages">{businessStages.slice(0, 7).map((s, i) => <div className="ribbon-stage" key={s}><span className={`ribbon-dot dot-${i}`} />{t(stageNames[s])}{i < 6 && <i />}</div>)}</div></section>
     <section className="list-panel panel"><div className="toolbar"><div className="search-box"><Search size={16} /><input type="search" aria-label={t('Search businesses')} placeholder={t('Search business, founder, email or industry…')} value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-businesses" />{search && <button onClick={() => setSearch('')} aria-label={t('Clear search')}><X size={14} /></button>}</div><label className="filter-select"><Filter size={15} /><select value={programId} aria-label={t('Filter by cohort')} onChange={e => changeProgram(e.target.value)} data-testid="select-business-program"><option value="">{t('All programs')}</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select><ChevronDown size={13} /></label><label className="filter-select"><select value={industry} aria-label={t('Filter by startup industry')} onChange={e => setIndustry(e.target.value)} data-testid="select-business-industry"><option value="">{t('All industries')}</option>{industries.map(value => <option key={value} value={value}>{industryLabel(value)}</option>)}</select><ChevronDown size={13} /></label><label className="filter-select"><select value={stage} aria-label={t('Filter businesses by stage')} onChange={e => setStage(e.target.value)} data-testid="select-business-stage"><option value="">{t('All stages')}</option>{businessStages.map(s => <option key={s} value={s}>{t(stageNames[s])}</option>)}</select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{visibleBusinesses.length}</b> {t('records')}</div></div>
        {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : visibleBusinesses.length === 0 ? <EmptyState title={hasFilters ? t('No businesses match this view.') : 'The founder pipeline is ready.'} body={hasFilters ? t('Try another cohort, industry, stage or search term.') : 'Add a business or applicant and start tracking the next step.'} action={hasFilters ? <button className="button button-outline" onClick={clearFilters}>{t('Clear all filters')}</button> : <button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> {t('Add a business')}</button>} /> :
        <div className="table-wrap"><table><thead><tr><th>{t('BUSINESS / FOUNDER')}</th><th>{t('PROGRAM')}</th><th>{t('INDUSTRY')}</th><th>{t('STAGE')}</th><th>{t('APPLIED')}</th><th>{t('PARTICIPANTS')}</th><th className="align-right">{t('ACTIONS')}</th></tr></thead><tbody>{visibleBusinesses.map(business => <tr key={business.id} data-testid={`row-business-${business.id}`}><td><div className="company-cell"><span className="company-monogram">{business.businessName.slice(0, 1).toUpperCase()}</span><span><b>{business.businessName}</b><small>{business.founderName} · {business.email}</small></span></div></td><td>{programs.find(p => p.id === business.programId)?.name || `${t('Program')} ${business.programId}`}</td><td>{industryLabel(business.industry)}</td><td><Badge value={business.stage} label={stageNames[business.stage]} /></td><td>{dateLabel(business.applicationDate)}</td><td><button className="button button-quiet" onClick={() => setParticipantsBusiness(business)} aria-label={`${t('Participants for')} ${business.businessName}`} data-testid={`button-business-participants-${business.id}`}><Users size={15} />{t('Participants')}</button></td><td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(business)} aria-label={`${t('Edit')} ${business.businessName}`} data-testid={`button-edit-business-${business.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(business)} aria-label={`${t('Delete')} ${business.businessName}`} data-testid={`button-delete-business-${business.id}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
    </section>
     <div className="list-footnote"><span><Users size={15} /> {t('People first, stage second.')}</span><span>{t('Use notes to keep the context behind the numbers.')}</span></div>
     {editing !== undefined && (editing ? <BusinessEditDialog business={editing} programs={programs} onClose={() => setEditing(undefined)} onSave={save} loading={update.isPending} error={update.error ? 'Could not update this business. Please try again.' : undefined} /> : <FormDialog title="Add a business" description="Start a founder record and make the next step visible." fields={businessFields(programs)} initial={{ stage: 'application', ...(programId ? { programId } : programs[0] ? { programId: String(programs[0].id) } : {}) }} loading={create.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={create.error ? 'Could not create this business. Check the required fields.' : undefined} />)}
     {participantsBusiness && <BusinessParticipantsDialog business={participantsBusiness} programName={programs.find(program => program.id === participantsBusiness.programId)?.name || `${t('Program')} ${participantsBusiness.programId}`} isAdmin={isAdmin} onClose={() => setParticipantsBusiness(null)} />}
    {deleting && <ConfirmDialog item={deleting.businessName} onCancel={() => setDeleting(null)} onConfirm={confirmRemove} loading={remove.isPending} />}
  </>;
}

function SessionsPage({ coordinator = false, staffId, trainerView = false }: { coordinator?: boolean; staffId?: number; trainerView?: boolean }) {
  const [type, setType] = useState('');
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<Session | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [zoomActionMessage, setZoomActionMessage] = useState<
    | { tone: 'good' | 'bad'; text: string }
    | { tone: 'good'; kind: 'meeting-saved'; title: string }
    | null
  >(null);
  const [zoomCallbackResult] = useState(() => new URLSearchParams(window.location.search).get('zoom'));
  const params = useMemo(() => type ? { type: type as Session['type'] } : undefined, [type]);
  const operationsQuery = useListSessions(params, { query: { queryKey: getListSessionsQueryKey(params), enabled: !trainerView } });
  const programsQuery = useListPrograms(undefined, { query: { queryKey: getListProgramsQueryKey(), enabled: !trainerView } });
  // Trainers must use their assigned-session API, not operations-only lists.
  const trainerQuery = useGetTrainerDashboard({ query: { queryKey: getGetTrainerDashboardQueryKey(), enabled: trainerView, refetchOnWindowFocus: true } });
  const query = trainerView ? trainerQuery : operationsQuery;
  const programs = trainerView ? trainerQuery.data?.programs || [] : programsQuery.data || [];
  const sessions = trainerView
    ? (trainerQuery.data?.sessions || []).filter(session => !type || session.type === type)
    : operationsQuery.data || [];
  const displayedSessions = calendarDate ? sessions.filter(session => session.scheduledDate.slice(0, 10) === calendarDate) : sessions;
  const client = useQueryClient();
  const zoomStatus = useGetZoomStatus({ query: { queryKey: getGetZoomStatusQueryKey(), enabled: coordinator } });
  const recordingAlertsQuery = useListZoomRecordingAlerts({ query: { queryKey: getListZoomRecordingAlertsQueryKey(), enabled: coordinator, refetchInterval: coordinator ? 30_000 : false, refetchOnWindowFocus: true } });
  const connectZoom = useStartZoomConnection();
  const disconnectZoom = useDisconnectZoom();
  const createZoomMeeting = useCreateOrUpdateZoomMeeting();
  const retryRecordingEmailMutation = useRetryZoomRecordingAlertEmail();
  const staffQuery = useListStaff({ query: { queryKey: getListStaffQueryKey(), enabled: coordinator } });
  const trainers = coordinator ? (staffQuery.data || []).filter(person => person.role === 'trainer' && person.status === 'active') : [];
  const create = useCreateSession();
  const update = useUpdateSession();
  const remove = useDeleteSession();

  useEffect(() => {
    if (!zoomCallbackResult) return;
    if (coordinator && zoomCallbackResult === 'connected') {
      trackEvent('zoom_connection_success');
    } else if (coordinator && zoomCallbackResult === 'error') {
      trackZoomFailure({ name: 'zoom_connection_failure', stage: 'authorization_callback' });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('zoom');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [coordinator, zoomCallbackResult]);

  const refreshZoomViews = () => {
    invalidate(client, [getListSessionsQueryKey(), getGetDashboardQueryKey(), getGetZoomStatusQueryKey(), getListZoomRecordingAlertsQueryKey()]);
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
      invalidate(client, [getListSessionsQueryKey(), getGetDashboardQueryKey(), getListZoomRecordingAlertsQueryKey()]);
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
      onError: error => {
        trackZoomFailure({ name: 'zoom_connection_failure', stage: 'authorization_start' });
        setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, 'Could not start Zoom authorization.') });
      },
    });
  };
  const disconnectZoomAccount = () => disconnectZoom.mutate({ data: {} }, {
    onSuccess: () => {
      setConfirmDisconnect(false);
      setZoomActionMessage({ tone: 'good', text: 'Zoom was disconnected. Existing session links and recordings remain available.' });
      refreshZoomViews();
    },
    onError: error => {
      trackZoomFailure({ name: 'zoom_connection_failure', stage: 'disconnect' });
      setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, 'Could not disconnect Zoom.') });
    },
  });
  const manageMeeting = (session: Session) => {
    setZoomActionMessage(null);
    const action = session.zoomMeetingId ? 'updated' : 'created';
    createZoomMeeting.mutate({ id: session.id }, {
      onSuccess: updated => {
        trackEvent('zoom_meeting_save_success', { action });
        setZoomActionMessage({ tone: 'good', kind: 'meeting-saved', title: updated.title });
        refreshZoomViews();
      },
      onError: error => {
        trackZoomFailure({ name: 'zoom_meeting_save_failure', action });
        setZoomActionMessage({ tone: 'bad', text: apiErrorMessage(error, 'Could not create a Zoom meeting.') });
      },
    });
  };
  const retryRecordingAlertEmail = (id: number) => retryRecordingEmailMutation.mutate({ id }, {
    onSuccess: response => {
      if (response.emailStatus === 'failed') {
        trackZoomFailure({ name: 'zoom_recording_alert_retry_failure' });
      }
      void recordingAlertsQuery.refetch();
    },
    onError: () => trackZoomFailure({ name: 'zoom_recording_alert_retry_failure' }),
  });
  const zoomNotice = zoomCallbackResult === 'connected'
    ? 'Zoom authorization is complete.'
    : zoomCallbackResult === 'cancelled'
      ? 'Zoom authorization was cancelled.'
      : zoomCallbackResult === 'error'
        ? 'Zoom could not be connected. Check the Zoom app settings and try again.'
        : null;

  return <>
     <PageHeading kicker="PROGRAM DELIVERY / SESSIONS" title="Sessions" summary="Bootcamps, hackathons and online moments that move the cohort forward." action={!trainerView ? <button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-session"><Plus size={16} /> {t('Schedule session')}</button> : undefined} />
    {coordinator && staffQuery.isError && <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>{t('Trainer assignments are temporarily unavailable.')}</b><span>{t('Reload the page to retry team access records before assigning a trainer.')}</span></div><button className="button button-quiet" onClick={() => void staffQuery.refetch()} data-testid="button-retry-trainers">{t('Retry')}</button></div>}
    {coordinator && <section className="team-callout zoom-connect-panel" data-testid="zoom-connection-panel" aria-live="polite">
      <Video size={18} />
      <div className="zoom-connect-copy">
        <b>{zoomStatus.isLoading ? t('Checking Zoom setup…') : zoomStatus.data?.connected ? t('Zoom account connected') : t('Connect Zoom for online sessions')}</b>
        <span>{t('Admins can create and update Zoom meetings here. After staff upload a recording to Google Drive, add its share link to the session; trainers and participants will see an embedded player.')}</span>
        {zoomCallbackResult && zoomNotice && <span className={zoomCallbackResult === 'error' ? 'zoom-status-error' : 'zoom-status-success'}>{t(zoomNotice)}</span>}
        {zoomActionMessage && <span className={zoomActionMessage.tone === 'bad' ? 'zoom-status-error' : 'zoom-status-success'} role={zoomActionMessage.tone === 'bad' ? 'alert' : 'status'}>{'kind' in zoomActionMessage ? <>{t('Zoom meeting saved for')} “{zoomActionMessage.title}”. {t('Trainers and participants can now use its session link.')}</> : t(zoomActionMessage.text)}</span>}
        {zoomStatus.isError && <span className="zoom-status-error">{t('Zoom connection status could not be loaded.')}</span>}
        {!zoomStatus.data?.clientConfigured && <span>{t('Before connecting, add the Zoom OAuth Client ID and Client Secret to Replit Secrets as')} <code>ZOOM_CLIENT_ID</code> {t('and')} <code>ZOOM_CLIENT_SECRET</code>.</span>}
        {zoomStatus.data?.callbackUrl && <span>{t('Register this exact OAuth redirect URL in the Zoom app:')} <code className="zoom-callback-url">{zoomStatus.data.callbackUrl}</code></span>}
        <span>{t('Enable the Zoom OAuth scope')} <code>meeting:write:meeting</code>{t('. For recording-ready alerts, subscribe to')} <code>recording.completed</code> {t('at this webhook URL:')} <code className="zoom-callback-url">{zoomStatus.data?.webhookUrl || t('Unavailable until this app has a registered URL')}</code>. {t('Add recordings separately as Google Drive links; Zoom recording sync is disabled.')}</span>
        {zoomStatus.data?.connected && <span>{t('Connected by')} {zoomStatus.data.connectedBy || t('an admin')}{zoomStatus.data.connectedAt ? ` ${t('on')} ${dateLabel(zoomStatus.data.connectedAt)}` : ''}.</span>}
        {confirmDisconnect && <span className="zoom-disconnect-confirm">{t('Disconnect Zoom? Existing meeting links and session recordings remain available. Creating or updating Zoom meetings stops until it is reconnected.')}</span>}
      </div>
      <div className="zoom-connect-actions">
        {zoomStatus.isError ? <button className="button button-quiet" onClick={() => void zoomStatus.refetch()} data-testid="button-retry-zoom-status">{t('Retry')}</button> : <>
          {zoomStatus.data?.connected && <button className="button button-quiet" onClick={() => setConfirmDisconnect(value => !value)} data-testid="button-disconnect-zoom">{confirmDisconnect ? t('Cancel') : t('Disconnect')}</button>}
          {confirmDisconnect && <button className="button button-outline" onClick={disconnectZoomAccount} disabled={disconnectZoom.isPending} data-testid="button-confirm-disconnect-zoom">{disconnectZoom.isPending ? t('Disconnecting…') : t('Confirm disconnect')}</button>}
          <button className="button button-primary" onClick={startZoomConnect} disabled={!zoomStatus.data?.clientConfigured || connectZoom.isPending} data-testid="button-connect-zoom">{connectZoom.isPending ? t('Opening Zoom…') : zoomStatus.data?.connected ? t('Reconnect Zoom') : t('Connect Zoom')}</button>
        </>}
      </div>
    </section>}
    {coordinator && <section className="team-callout recording-ready-panel" data-testid="recording-ready-alerts" aria-live="polite">
      <CircleAlert size={18} />
      <div className="recording-ready-copy">
        <b>{t('Zoom recordings ready for Drive upload')}</b>
        {recordingAlertsQuery.isLoading && <span>{t('Checking for recordings waiting on staff…')}</span>}
        {recordingAlertsQuery.isError && <span className="zoom-status-error">{t('Recording alerts could not be loaded.')}</span>}
        {!recordingAlertsQuery.isError && !recordingAlertsQuery.isLoading && (recordingAlertsQuery.data || []).length === 0 && <span>{t('No recordings are waiting for a Google Drive upload.')}</span>}
        {(recordingAlertsQuery.data || []).map(alert => <div className="recording-ready-row" key={alert.id} data-testid={`recording-alert-${alert.id}`}>
          <div className="recording-ready-session">
            <b>{alert.title}</b>
            <span>{dateLabel(alert.scheduledDate)} {t('· Ready to upload to Drive')}</span>
          </div>
          <div className="recording-ready-email">
            <span className={alert.emailStatus === 'sent' ? 'zoom-status-success' : alert.emailStatus === 'failed' ? 'zoom-status-error' : ''}>
              {alert.emailStatus === 'sent' ? t('Email sent') : alert.emailStatus === 'failed' ? t('Email needs attention') : alert.emailStatus === 'sending' ? t('Email sending…') : t('Email pending')}
            </span>
            {alert.emailError && <span className="zoom-status-error" role="alert">{alert.emailError}</span>}
            {alert.canRetryEmail && <button className="button button-quiet" onClick={() => retryRecordingAlertEmail(alert.id)} disabled={retryRecordingEmailMutation.isPending} data-testid={`button-retry-recording-email-${alert.id}`}>{retryRecordingEmailMutation.isPending ? t('Retrying…') : t('Retry email')}</button>}
          </div>
        </div>)}
        {recordingAlertsQuery.isError && <button className="button button-quiet" onClick={() => void recordingAlertsQuery.refetch()}>{t('Retry loading alerts')}</button>}
        <span>{t('When staff add the session’s Google Drive link, this alert clears and participants get the recording through the embedded player.')}</span>
      </div>
    </section>}
    <div className="calendar-summary"><div className="calendar-icon"><CalendarDays size={20} /></div><div><b>{t('Make each moment count.')}</b><span>{t('Keep joining details and recordings close to the agenda.')}</span></div><span className="calendar-endnote"><Video size={15} /> {t('LIVE + ON-DEMAND')}</span></div>
    <div className="toolbar standalone-toolbar"><label className="filter-select"><Filter size={15} /><select value={type} aria-label={t('Filter sessions by type')} onChange={e => { setType(e.target.value); setCalendarDate(null); }} data-testid="select-session-type"><option value="">{t('All session types')}</option>{['bootcamp', 'hackathon', 'training', 'pitch_day', 'demo_day', 'other'].map(v => <option key={v} value={v}>{display(v)}</option>)}</select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{sessions.length}</b> {t('sessions')}</div></div>
    <SessionCalendar sessions={sessions} selectedDate={calendarDate} onSelectDate={setCalendarDate} />
    {calendarDate && <div className="calendar-date-results" role="status"><span>{t('Showing sessions for')} <b>{dateLabel(calendarDate)}</b></span><span>{displayedSessions.length} {t('scheduled')}</span></div>}
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : sessions.length === 0 ? <EmptyState title="No sessions scheduled." body="Add the next bootcamp, hackathon, online training or pitch event to get the cohort together." action={!trainerView ? <button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> {t('Schedule a session')}</button> : undefined} /> :
    <div className="session-list">{displayedSessions.length === 0 ? <EmptyState title="No sessions on this date." body="Choose another day or clear the calendar selection to see the full schedule." action={<button className="button button-outline" onClick={() => setCalendarDate(null)}>{t('Show all sessions')}</button>} /> : displayedSessions.map((session, i) => {
      const meetingPending = createZoomMeeting.isPending && createZoomMeeting.variables?.id === session.id;
      return <article className="session-card" key={session.id} data-testid={`card-session-${session.id}`}>
        <div className="session-date"><span>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: 'short' }).toUpperCase()}</span><b>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).getDate()}</b><small>{new Date(`${session.scheduledDate.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { weekday: 'short' })}</small></div>
        <div className="session-card-main">
          <div className="session-label-row"><Badge value={session.type} /><Badge value={session.status} /><span className={`delivery-pill delivery-${session.deliveryMode}`}>{display(session.deliveryMode)}</span></div>
          <h2 className="app-title">{session.title}</h2>
          <p>{programs.find(p => p.id === session.programId)?.name || (session.programId ? `${t('Program')} ${session.programId}` : t('All cohorts'))}<span>·</span>{session.startTime || t('Time not set')}<span>·</span>{session.durationMinutes} {t('min')}<span>·</span>{session.facilitator || t('Facilitator TBD')}</p>
           <div className="session-links"><span className="location-detail"><MapPin size={13} /> {session.location || t('Location not set')}</span>{session.deliveryMode !== 'in_person' && session.zoomUrl ? <a href={session.zoomUrl} target="_blank" rel="noreferrer" className="text-link"><Video size={14} /> {t('Join Zoom')} <ExternalLink size={12} /></a> : <span className="disabled-link"><Video size={14} /> {session.deliveryMode === 'in_person' ? t('In-person session') : t('No meeting link')}</span>}</div>
           <Suspense fallback={null}>
             <SessionRecordingPlayer url={session.recordingUrl} title={session.title} />
             <StaffSessionInteractions sessionId={session.id} coordinator={coordinator} staffId={staffId} trainerStaffId={session.trainerStaffId} />
           </Suspense>
          {coordinator && session.deliveryMode !== 'in_person' && <div className="session-admin-actions">
            <button className="button button-quiet" onClick={() => manageMeeting(session)} disabled={!zoomStatus.data?.connected || createZoomMeeting.isPending} data-testid={`button-zoom-meeting-${session.id}`}><Video size={14} />{meetingPending ? 'Saving…' : session.zoomMeetingId ? 'Update Zoom meeting' : 'Create Zoom meeting'}</button>
          </div>}
        </div>
         {!trainerView && <div className="session-card-actions"><button className="icon-button" onClick={() => setEditing(session)} aria-label={`Edit ${session.title}`} data-testid={`button-edit-session-${session.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(session)} aria-label={`Delete ${session.title}`} data-testid={`button-delete-session-${session.id}`}><Trash2 size={15} /></button></div>}
        <span className={`session-index mono session-index-${i % 2}`}>{t('SESSION /')} {String(i + 1).padStart(2, '0')}</span>
      </article>;
    })}</div>}
    {!trainerView && editing !== undefined && <FormDialog
      title={editing ? 'Edit session' : 'Schedule a session'}
       description="Create or update the Zoom meeting here. After staff upload the recording to Drive, paste its share link below to make it available as an in-page player."
      fields={sessionFields(programsQuery.data || [], trainers, coordinator)}
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
  const calendlyQuery = useListSupportCalendlyMeetings({
    query: {
      queryKey: getListSupportCalendlyMeetingsQueryKey(),
      enabled: coordinator,
      refetchInterval: coordinator ? 15_000 : false,
      refetchOnWindowFocus: true,
    },
  });
  const googleCalendarQuery = useListSupportGoogleCalendarMeetings({
    query: {
      queryKey: getListSupportGoogleCalendarMeetingsQueryKey(),
      enabled: coordinator,
      refetchInterval: coordinator ? 15_000 : false,
      refetchOnWindowFocus: true,
    },
  });
  const bookings = [
    ...(calendlyQuery.data || []).map(meeting => ({ ...meeting, provider: 'Calendly' })),
    ...(googleCalendarQuery.data || []).map(meeting => ({ ...meeting, provider: 'Google Calendar' })),
  ].sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());
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
    <PageHeading kicker="FOUNDER ENABLEMENT / ENGAGEMENTS" title="Support" summary="The right mentor, specialist or agency at the moment it matters." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-support"><Plus size={16} /> {t('Log engagement')}</button>} />
    {coordinator && staffQuery.isError && <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>{t('Mentor assignments are temporarily unavailable.')}</b><span>{t('Retry team access records before assigning an engagement.')}</span></div><button className="button button-quiet" onClick={() => void staffQuery.refetch()} data-testid="button-retry-mentors">{t('Retry')}</button></div>}
    <div className="support-callout"><div className="support-callout-icon"><Handshake size={20} /></div><div><div className="eyebrow">{t('SUPPORT THAT MOVES THE NEEDLE')}</div><b>{t("Match practical expertise to a founder's next milestone.")}</b><span>{t('Mentoring · subject expertise · branding · technical agency')}</span></div><div className="support-total"><b>{engagements.filter(e => e.status !== 'completed').length}</b><span>{t('IN MOTION')}</span></div></div>
    <div className="toolbar standalone-toolbar"><label className="filter-select"><Filter size={15} /><select value={type} aria-label={t('Filter support by type')} onChange={e => setType(e.target.value)} data-testid="select-support-type"><option value="">{t('All support types')}</option>{['mentor', 'subject_expert', 'branding', 'technical'].map(v => <option key={v} value={v}>{display(v)}</option>)}</select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{engagements.length}</b> {t('engagements')}</div></div>
    {coordinator && <section className="panel engagement-panel" data-testid="support-calendly-bookings">
      <div className="support-bookings-heading"><div className="eyebrow">{t('SYNCED MEETINGS')}</div><h2 className="app-title">{t('Mentor bookings')}</h2><p>{t('Bookings appear only for the assigned mentor and business.')}</p></div>
      {calendlyQuery.isError || googleCalendarQuery.isError ? <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>{t('Mentor bookings could not be loaded.')}</b><span>{t('Your support records are still available.')}</span></div><button className="button button-quiet" onClick={() => { void calendlyQuery.refetch(); void googleCalendarQuery.refetch(); }}>{t('Retry')}</button></div> :
        calendlyQuery.isLoading || googleCalendarQuery.isLoading ? <LoadingState label="Loading mentor bookings" /> :
          bookings.length === 0 ? <p className="session-info">{t('No synced bookings match an assigned mentor and business yet.')}</p> :
            <div className="table-wrap"><table><thead><tr><th>{t('BUSINESS')}</th><th>{t('ASSIGNED MENTOR')}</th><th>{t('BOOKING PLATFORM')}</th><th>{t('APPOINTMENT')}</th><th>{t('EVENT TIME')}</th><th>{t('STATUS')}</th></tr></thead><tbody>
              {bookings.map(meeting => {
                const business = businesses.find(item => item.id === meeting.businessId);
                return <tr key={`${meeting.provider}-${meeting.id}`} data-testid={`row-mentor-booking-${meeting.provider === 'Google Calendar' ? 'google' : 'calendly'}-${meeting.id}`}>
                  <td><b>{business?.businessName || `Business ${meeting.businessId}`}</b></td>
                  <td>{meeting.mentorEmail}</td>
                  <td>{meeting.provider}</td>
                  <td>{t(meeting.eventName)}</td>
                  <td><div className="provider-cell"><span>{calendlyMeetingDateTime(meeting.startsAt, meeting.timezone)}</span><small>{t('to')} {calendlyMeetingDateTime(meeting.endsAt, meeting.timezone)}{meeting.timezone ? ` · ${meeting.timezone}` : ''}</small></div></td>
                  <td><Badge value={meeting.status} /></td>
                </tr>;
              })}
            </tbody></table></div>}
    </section>}
    {query.isLoading || businessQuery.isLoading ? <LoadingState /> : query.isError || businessQuery.isError ? <ErrorState retry={() => { void query.refetch(); void businessQuery.refetch(); }} /> : engagements.length === 0 ? <EmptyState title="Support begins with a conversation." body="Log a mentoring match, a specialist session or agency support against a business." action={<button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> {t('Add an engagement')}</button>} /> :
    <section className="panel engagement-panel"><div className="table-wrap"><table><thead><tr><th>{t('BUSINESS')}</th><th>{t('SUPPORT')}</th><th>{t('PROVIDER / TOPIC')}</th><th>{t('DATE')}</th><th>{t('STATUS')}</th><th className="align-right">{t('ACTIONS')}</th></tr></thead><tbody>{engagements.map(item => { const business = businesses.find(b => b.id === item.businessId); return <tr key={item.id} data-testid={`row-support-${item.id}`}><td><div className="company-cell"><span className="company-monogram monogram-teal">{business?.businessName?.slice(0, 1).toUpperCase() || 'B'}</span><span><b>{business?.businessName || `Business ${item.businessId}`}</b><small>{business?.founderName || t('Founder record')}</small></span></div></td><td><span className="type-mark">{display(item.type)}</span></td><td><div className="provider-cell"><b>{item.provider}</b><small>{item.topic}</small></div></td><td>{dateLabel(item.scheduledDate)}</td><td><Badge value={item.status} /></td><td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(item)} aria-label={`${t('Edit')} ${item.topic}`} data-testid={`button-edit-support-${item.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(item)} aria-label={`${t('Delete')} ${item.topic}`} data-testid={`button-delete-support-${item.id}`}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div></section>}
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
    const data: PitchInput = { businessId: Number(v.businessId), eventType: (v.eventType || 'pitch_day') as PitchInput['eventType'], eventDate: v.eventDate, judges: v.judges || null, score: v.score === '' ? null : Number(v.score), ...(coordinator ? { grantDecision: (v.grantDecision || 'pending') as PitchInput['grantDecision'], grantAmount: v.grantAmount === '' ? null : Number(v.grantAmount) } : {}), feedback: v.feedback || null };
    const done = () => { invalidate(client, [getListPitchesQueryKey(), getGetDashboardQueryKey()]); setEditing(undefined); };
    if (editing) update.mutate({ id: editing.id, data: data as PitchUpdate }, { onSuccess: done }); else create.mutate({ data }, { onSuccess: done });
  };
  const removeRecord = () => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => { invalidate(client, [getListPitchesQueryKey(), getGetDashboardQueryKey()]); setDeleting(null); } });
  const awarded = pitches.filter(p => p.grantDecision === 'awarded');
  const awardedTotal = awarded.reduce((sum, pitch) => sum + (pitch.grantAmount || 0), 0);
  return <>
    <PageHeading kicker="PITCH DAY / DECISIONS" title="Pitch & grants" summary="Keep evaluations, judge feedback and funding decisions connected." action={<button className="button button-primary" onClick={() => setEditing(null)} data-testid="button-add-pitch"><Plus size={16} /> {t('Add evaluation')}</button>} />
    {coordinator && staffQuery.isError && <div className="team-callout" role="alert"><CircleAlert size={17} /><div><b>{t('Judge assignments are temporarily unavailable.')}</b><span>{t('Retry team access records before assigning scorecards.')}</span></div><button className="button button-quiet" onClick={() => void staffQuery.refetch()} data-testid="button-retry-judges">{t('Retry')}</button></div>}
     {coordinator && <section className="grant-summary"><div className="grant-emblem"><Trophy size={21} /></div><div className="grant-copy"><div className="eyebrow">{t('FROM THE STAGE TO THE NEXT CHAPTER')}</div><b>{t('Make each decision legible and grounded.')}</b><span>{t('Scores, feedback and grant outcomes stay with the founder record.')}</span></div><div className="grant-stat"><b>{awarded.length}</b><span>{t('GRANTS AWARDED')}</span></div><div className="grant-stat grant-amount"><b>{money(awardedTotal)}</b><span>{t('TRACKED HERE')}</span></div></section>}
    <div className="toolbar standalone-toolbar"><label className="filter-select"><Filter size={15} /><select value={eventType} aria-label={t('Filter pitch evaluations by event')} onChange={e => setEventType(e.target.value)} data-testid="select-pitch-event"><option value="">{t('Pitch + demo day')}</option><option value="pitch_day">{t('Pitch day')}</option><option value="demo_day">{t('Demo day')}</option></select><ChevronDown size={13} /></label><div className="toolbar-count"><b>{pitches.length}</b> {t('evaluations')}</div></div>
    {query.isLoading || businessQuery.isLoading ? <LoadingState /> : query.isError || businessQuery.isError ? <ErrorState retry={() => { void query.refetch(); void businessQuery.refetch(); }} /> : pitches.length === 0 ? <EmptyState title="The stage is set for your first evaluation." body="Record a pitch or demo day score, capture judge notes and track the grant decision." action={<button className="button button-primary" onClick={() => setEditing(null)}><Plus size={15} /> {t('Add an evaluation')}</button>} /> :
     <section className="panel pitch-panel"><div className="table-wrap"><table><thead><tr><th>{t('BUSINESS')}</th><th>{t('EVENT')}</th><th>{t('JUDGES')}</th><th>{t('SCORE')}</th>{coordinator && <><th>{t('GRANT DECISION')}</th><th>{t('AMOUNT')}</th></>}<th className="align-right">{t('ACTIONS')}</th></tr></thead><tbody>{pitches.map(pitch => { const business = businesses.find(b => b.id === pitch.businessId); return <tr key={pitch.id} data-testid={`row-pitch-${pitch.id}`}><td><div className="company-cell"><span className="company-monogram monogram-coral">{business?.businessName?.slice(0, 1).toUpperCase() || 'B'}</span><span><b>{business?.businessName || `Business ${pitch.businessId}`}</b><small>{dateLabel(pitch.eventDate)}</small></span></div></td><td><span className="event-chip">{display(pitch.eventType)}</span></td><td><div className="judge-text">{pitch.judges || '—'}</div></td><td><span className="score-value">{pitch.score ?? '—'}{pitch.score !== null && pitch.score !== undefined && <small>/100</small>}</span></td>{coordinator && <><td><Badge value={pitch.grantDecision} /></td><td className="grant-value">{pitch.grantDecision === 'awarded' ? money(pitch.grantAmount) : '—'}</td></>}<td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(pitch)} aria-label={`${t('Edit')} ${business?.businessName || t('pitch evaluation')}`} data-testid={`button-edit-pitch-${pitch.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(pitch)} aria-label={t('Delete pitch evaluation')} data-testid={`button-delete-pitch-${pitch.id}`}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>
      {coordinator && pitches.length > 0 && <div className="pitch-judge-controls"><div className="eyebrow">{t('INDIVIDUAL JUDGE ASSIGNMENTS')}</div>{pitches.map(pitch => <PitchJudgeControl key={pitch.id} pitchId={pitch.id} pitchLabel={`${businesses.find(b => b.id === pitch.businessId)?.businessName || `Business ${pitch.businessId}`} · ${display(pitch.eventType)}`} judges={judges} client={client} />)}</div>}
      <div className="pitch-feedback">{pitches.filter(p => p.feedback).slice(0, 2).map(p => <div className="feedback-note" key={p.id}><span className="quote-mark">“</span><div><b>{businesses.find(b => b.id === p.businessId)?.businessName || `Business ${p.businessId}`}</b><p>{p.feedback}</p></div></div>)}</div>
    </section>}
    {editing !== undefined && <FormDialog title={editing ? 'Edit evaluation' : 'Record an evaluation'} description="Capture the room's view and the decision that follows." fields={pitchFields(businesses, coordinator)} initial={editing ? { businessId: String(editing.businessId), eventType: editing.eventType, eventDate: valueOf(editing.eventDate), judges: editing.judges || '', score: valueOf(editing.score), ...(coordinator ? { grantDecision: editing.grantDecision, grantAmount: valueOf(editing.grantAmount) } : {}), feedback: editing.feedback || '' } : { eventType: 'pitch_day', ...(coordinator ? { grantDecision: 'pending' } : {}), ...(businesses[0] ? { businessId: String(businesses[0].id) } : {}) }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} error={(create.error || update.error) ? 'Could not save this evaluation. Check the required fields.' : undefined} />}
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
  return <article className="judge-assignment-row" data-testid={`pitch-judge-assignment-${pitchId}`}><div><b>{pitchLabel}</b><span>{query.isLoading ? t('Loading judge assignments…') : assignments.length ? assignments.map(item => `${item.judgeName}${item.submittedAt ? ` · ${t('scored')}` : ''}`).join(' / ') : t('No individual judges assigned')}</span></div><div className="judge-assignment-actions"><label className="sr-only" htmlFor={`assign-judge-${pitchId}`}>{t('Choose judge for')} {pitchLabel}</label><select id={`assign-judge-${pitchId}`} className="form-control" value={judgeId} onChange={event => setJudgeId(event.target.value)} data-testid={`select-judge-${pitchId}`}><option value="">{t('Choose judge')}</option>{judges.filter(person => !assignedIds.has(person.id)).map(person => <option key={person.id} value={person.id}>{person.email}</option>)}</select><button className="button button-outline" onClick={add} disabled={!judgeId || assign.isPending} data-testid={`button-assign-judge-${pitchId}`}>{assign.isPending ? t('Assigning…') : t('Assign')}</button></div>{assignments.filter(item => !item.submittedAt).map(item => <button className="judge-remove" key={item.id} onClick={() => removeAssignment(item.id)} disabled={remove.isPending} aria-label={`${t('Remove')} ${item.judgeName} ${t('from')} ${pitchLabel}`} data-testid={`button-remove-judge-${item.id}`}>{t('Remove')} {item.judgeName}</button>)}{(assign.isError || remove.isError || query.isError) && <span className="form-error">{t('Judge assignment could not be updated.')}</span>}</article>;
}

function MentorBookingStatusPage() {
  const [followUpFilter, setFollowUpFilter] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('followUp');
    return value === 'overdue' || value === 'upcoming' || value === 'undated' ? value : 'all';
  });
  const today = localCalendarDateKey();
  const query = useGetMentorBookingStatus({
    query: { queryKey: getGetMentorBookingStatusQueryKey(), refetchOnWindowFocus: true },
  });
  const mentors = query.data || [];
  const visibleMentors = mentors.filter(mentor => {
    if (followUpFilter === 'all') return true;
    if (hasMentorBookingConnection(mentor)) return false;
    return mentorFollowUpStatus(mentor.calendlyFollowUpDate, today) === followUpFilter;
  });
  const { connectedCount, pendingCount, needsFollowUpCount } = mentorBookingConnectionSummary(mentors);

  return <>
    <PageHeading
      kicker="MENTOR OPERATIONS / SESSION BOOKING"
      title="Mentor booking status"
      summary="See booking connections and keep track of follow-ups for mentors who have not connected a booking account."
      action={<button className="button button-outline" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-mentor-booking">{query.isFetching ? t('Refreshing…') : <><RefreshCw size={14} /> {t('Refresh status')}</>}</button>}
    />
    {query.isLoading ? <LoadingState label="Loading mentor booking status" /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : <>
      <section className="metric-grid mentor-booking-metrics">
        <Metric label="Mentors" value={mentors.length} hint="Invited and active accounts" icon={Users} />
        <Metric label="Booking account connected" value={connectedCount} hint="Google Calendar or Calendly connected" icon={CalendarCheck} />
        <Metric label="Needs follow-up" value={needsFollowUpCount} hint="No date or note recorded" icon={CircleAlert} accent="metric-sand" />
      </section>
      {mentors.length === 0 ? <EmptyState title="No mentors have been added yet." body="Mentor accounts will appear here after an admin adds them under Team access." /> :
        <section className="panel staff-panel">
          <div className="panel-heading">
            <div><div className="eyebrow">{t('BOOKING READINESS')}</div><h2 className="app-title">{t('Mentor accounts')}</h2></div>
            <span className="section-meta">{pendingCount} {t('still need a booking connection')}</span>
          </div>
          <div className="mentor-booking-toolbar">
            <label className="filter-select"><Filter size={15} /><select aria-label={t('Filter mentors by follow-up status')} value={followUpFilter} onChange={event => {
              const value = event.target.value;
              setFollowUpFilter(value);
              const search = new URLSearchParams(window.location.search);
              if (value === 'all') search.delete('followUp');
              else search.set('followUp', value);
              const query = search.toString();
              window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
            }} data-testid="select-mentor-follow-up-filter"><option value="all">{t('All mentors')}</option><option value="overdue">{t('Overdue')}</option><option value="upcoming">{t('Upcoming')}</option><option value="undated">{t('Undated')}</option></select><ChevronDown size={13} /></label>
            <span className="toolbar-count"><b>{visibleMentors.length}</b> {t('mentors')}</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('MENTOR')}</th><th>{t('PROGRAM ACCOUNT')}</th><th>{t('BOOKING PROVIDER')}</th><th>CALENDLY</th><th>GOOGLE CALENDAR</th><th>{t('FOLLOW-UP')}</th></tr></thead>
            <tbody>{visibleMentors.map(mentor => <tr key={mentor.staffId} data-testid={`row-mentor-booking-${mentor.staffId}`}>
              <td><div className="staff-email"><span className="staff-avatar">{mentor.email.slice(0, 1).toUpperCase()}</span><b>{mentor.email}</b></div></td>
              <td><Badge value={mentor.status} label={mentor.status === 'active' ? 'Active' : 'Invitation pending'} /></td>
              <td><b>{mentor.bookingProvider === 'google_calendar' ? 'Google Calendar' : 'Calendly'}</b></td>
              <td><span className={`badge ${mentor.calendlyConnected ? 'badge-good' : 'badge-warm'}`} data-testid={`status-calendly-${mentor.staffId}`}><span />{mentor.calendlyConnected ? t('Connected') : t('Not connected')}</span></td>
              <td><span className={`badge ${mentor.googleCalendarConnected ? 'badge-good' : 'badge-warm'}`} data-testid={`status-google-calendar-${mentor.staffId}`}><span />{mentor.googleCalendarConnected ? t('Connected') : t('Not connected')}</span>{!mentor.googleCalendarConnected && mentor.status === 'invited' && <small className="mentor-booking-note">{t('Waiting for account sign-in')}</small>}</td>
              <td><MentorFollowUpEditor mentor={mentor} today={today} onSaved={() => void query.refetch()} /></td>
            </tr>)}</tbody>
          </table></div>
           {visibleMentors.length === 0 && <div className="mentor-follow-up-empty">{t('No mentors match this follow-up filter.')}</div>}
        </section>}
       <div className="dashboard-note"><span className="note-mark"><CalendarDays size={13} /></span><span><b>{t('Connection status only.')}</b> {t('This page shows provider selection and account status, not private calendar details or credentials.')}</span></div>
    </>}
  </>;
}

function MentorFollowUpEditor({ mentor, today, onSaved }: { mentor: MentorBookingStatus; today: string; onSaved: () => void }) {
  const [followUpDate, setFollowUpDate] = useState(mentor.calendlyFollowUpDate || '');
  const [followUpNote, setFollowUpNote] = useState(mentor.calendlyFollowUpNote || '');
  const update = useUpdateMentorBookingFollowUp();
  const hasFollowUp = Boolean(mentor.calendlyFollowUpDate || mentor.calendlyFollowUpNote);
  const followUpStatus = mentorFollowUpStatus(mentor.calendlyFollowUpDate, today);
  const unchanged = followUpDate === (mentor.calendlyFollowUpDate || '') && followUpNote === (mentor.calendlyFollowUpNote || '');
  useEffect(() => {
    setFollowUpDate(mentor.calendlyFollowUpDate || '');
    setFollowUpNote(mentor.calendlyFollowUpNote || '');
  }, [mentor.calendlyFollowUpDate, mentor.calendlyFollowUpNote]);
  const save = (data: MentorBookingFollowUpUpdate) => update.mutate(
    { id: mentor.staffId, data },
    { onSuccess: onSaved },
  );

  if (hasMentorBookingConnection(mentor)) {
    return <span className="mentor-follow-up-connected">{t('Not needed')}</span>;
  }
  return <div className="mentor-follow-up-editor" data-testid={`mentor-follow-up-${mentor.staffId}`}>
    <span className={`mentor-follow-up-state ${hasFollowUp ? 'is-recorded' : ''} ${followUpStatus === 'overdue' ? 'is-overdue' : ''}`} data-testid={`mentor-follow-up-state-${mentor.staffId}`}>
      {t(followUpStatus === 'overdue' ? 'Overdue' : followUpStatus === 'upcoming' ? (mentor.calendlyFollowUpDate === today ? 'Due today' : 'Upcoming') : hasFollowUp ? 'Recorded · no date' : 'Not recorded')}
      {mentor.calendlyFollowUpDate && <small>{t(followUpStatus === 'overdue' ? 'Was due' : 'Due')} {mentor.calendlyFollowUpDate}</small>}
      {mentor.calendlyFollowUpNote && <small className="mentor-follow-up-saved-note">{mentor.calendlyFollowUpNote}</small>}
      {mentor.calendlyFollowUpUpdatedAt && <small className="mentor-follow-up-updated" data-testid={`mentor-follow-up-updated-${mentor.staffId}`}>
        {t('Last updated by')} {mentor.calendlyFollowUpUpdatedByEmail || t('former coordinator')} · <time dateTime={mentor.calendlyFollowUpUpdatedAt}>{new Date(mentor.calendlyFollowUpUpdatedAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time>
      </small>}
    </span>
    <label className="sr-only" htmlFor={`mentor-follow-up-date-${mentor.staffId}`}>{t('Follow-up date for')} {mentor.email}</label>
    <input id={`mentor-follow-up-date-${mentor.staffId}`} className="form-control" type="date" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} data-testid={`input-mentor-follow-up-date-${mentor.staffId}`} />
    <label className="sr-only" htmlFor={`mentor-follow-up-note-${mentor.staffId}`}>{t('Follow-up note for')} {mentor.email}</label>
    <input id={`mentor-follow-up-note-${mentor.staffId}`} className="form-control" type="text" maxLength={1000} placeholder={t('Contact note')} value={followUpNote} onChange={event => setFollowUpNote(event.target.value)} data-testid={`input-mentor-follow-up-note-${mentor.staffId}`} />
    <div className="mentor-follow-up-actions">
      <button className="button button-outline" onClick={() => save({ calendlyFollowUpDate: followUpDate || null, calendlyFollowUpNote: followUpNote.trim() || null })} disabled={unchanged || update.isPending} data-testid={`button-save-mentor-follow-up-${mentor.staffId}`}>{update.isPending ? t('Saving…') : hasFollowUp ? t('Save') : t('Save follow-up')}</button>
      {hasFollowUp && <button className="button button-quiet" onClick={() => save({ calendlyFollowUpDate: null, calendlyFollowUpNote: null })} disabled={update.isPending} data-testid={`button-clear-mentor-follow-up-${mentor.staffId}`}>{t('Clear')}</button>}
    </div>
    {update.isError && <small className="form-error">{t('Could not save this follow-up. Please try again.')}</small>}
  </div>;
}

function TeamPage() {
  const query = useListStaff();
  const staff = query.data || [];
  const participantInvitationsQuery = useListParticipantInvitations();
  const participantInvitations = participantInvitationsQuery.data || [];
  const programsQuery = useListPrograms();
  const programs = programsQuery.data || [];
  const programNames = new Map(programs.map(program => [program.id, program.name]));
  const businessesQuery = useListBusinesses();
  const businesses = businessesQuery.data || [];
  const client = useQueryClient();
  const create = useCreateStaff();
  const createParticipantInvitation = useCreateParticipantInvitation();
  const retryStaffInvitationEmail = useRetryStaffInvitationEmail();
  const update = useUpdateStaff();
  const remove = useDeleteStaff();
  const [editing, setEditing] = useState<StaffMember | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [invitingParticipant, setInvitingParticipant] = useState(false);
  const [participantInviteSuccess, setParticipantInviteSuccess] = useState<{
    email: string;
    expiresAt: Date;
  } | null>(null);
  const [staffInviteSuccess, setStaffInviteSuccess] = useState(false);
  const [retryingStaffId, setRetryingStaffId] = useState<number | null>(null);
  const [inviteInstructionsStatus, setInviteInstructionsStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const programAssignmentField: Field = {
    name: 'programIds',
    label: 'Assigned programs',
    kind: 'multiselect',
    wide: true,
    options: programs.map(program => ({ value: String(program.id), label: program.name })),
     hint: 'Program staff and specialists can access only the active programs assigned here. Admins have global access.',
  };
  const participantBusinessField: Field = {
    ...participantInviteFields[2],
    options: businesses
      .filter(business => programNames.has(business.programId))
      .map(business => ({
        value: String(business.id),
        label: `${programNames.get(business.programId)} — ${business.businessName}`,
      })),
  };
  const save = (values: Values) => {
    const role = (values.role || 'staff') as StaffInput['role'];
    const programIds = role === 'coordinator'
      ? []
      : [...new Set((values.programIds || '').split(',').filter(Boolean).map(Number).filter(Number.isSafeInteger))];
    const done = (invitationSent = false) => {
      invalidate(client, [getListStaffQueryKey()]);
      setEditing(undefined);
      setStaffInviteSuccess(invitationSent);
    };
    if (editing) {
      update.mutate({ id: editing.id, data: { role, programIds } as StaffUpdate }, { onSuccess: () => done() });
    } else {
      create.mutate({ data: { email: values.email.trim().toLowerCase(), role, programIds } as StaffInput }, {
        onSuccess: () => done(true),
        onError: () => invalidate(client, [getListStaffQueryKey()]),
      });
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
  const participantInviteError = createParticipantInvitation.error as { data?: { error?: string } } | null;
  const participantListError = participantInvitationsQuery.error as { data?: { error?: string } } | null;
  const saveParticipantInvitation = (values: Values) => {
    const email = values.email.trim().toLowerCase();
    const displayName = values.displayName.trim();
    setParticipantInviteSuccess(null);
    setInviteInstructionsStatus('idle');
    createParticipantInvitation.mutate({
      data: {
        email,
        businessId: Number(values.businessId),
        ...(displayName ? { displayName } : {}),
      },
    }, {
      onSuccess: invitation => {
        invalidate(client, [getListParticipantInvitationsQueryKey()]);
        setParticipantInviteSuccess({
          email,
          expiresAt: new Date(invitation.expiresAt),
        });
        setInvitingParticipant(false);
      },
    });
  };
  const copyParticipantSignInInstructions = async () => {
    if (!participantInviteSuccess) return;
    const instructions = participantSignInInstructions(
      participantInviteSuccess.email,
      participantInviteSuccess.expiresAt,
    );
    try {
      await navigator.clipboard.writeText(instructions);
      setInviteInstructionsStatus('copied');
    } catch {
      setInviteInstructionsStatus('error');
    }
  };

  return <>
    <PageHeading kicker="TEAM / ACCESS" title="Team access" summary="Invite the right people into each part of the founder journey." action={<div className="team-invite-actions"><button className="button button-outline" onClick={() => { setParticipantInviteSuccess(null); setInviteInstructionsStatus('idle'); setInvitingParticipant(true); }} data-testid="button-invite-participant"><UserPlus size={16} /> {t('Invite participant')}</button><button className="button button-primary" onClick={() => { setStaffInviteSuccess(false); setEditing(null); }} data-testid="button-add-staff"><UserPlus size={16} /> {t('Invite team member')}</button></div>} />
    <div className="team-callout"><Shield size={18} /><div><b>{t('Every role is tied to a verified email.')}</b><span>{t('Choose admin, program staff, trainer, mentor or judge access. A branded invitation email will be sent after the access record is saved. Members must use the same verified email address.')}</span></div></div>
    {staffInviteSuccess && <div className="participant-invite-success" role="status" data-testid="staff-invite-success"><b>{t('Invitation email sent.')}</b><p>{t('The person can create an account or sign in using the same verified email address.')}</p></div>}
    {query.isLoading ? <LoadingState label="Loading staff access" /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : staff.length === 0 ? <EmptyState title="No staff access has been added." body="Add an admin or program staff email to approve the team." action={<button className="button button-primary" onClick={() => setEditing(null)}><UserPlus size={15} /> {t('Add the first staff member')}</button>} /> :
      <section className="panel staff-panel">
        <div className="panel-heading"><div><div className="eyebrow">{t('APPROVED ACCOUNTS')}</div><h2 className="app-title">{staff.length} {t('team')} {t(staff.length === 1 ? 'member' : 'members')}</h2></div><span className="section-meta">{t('Only admins can change access')}</span></div>
        <div className="table-wrap"><table><thead><tr><th>{t('EMAIL')}</th><th>{t('ROLE')}</th><th>{t('PROGRAMS')}</th><th>{t('ACCOUNT')}</th><th>{t('EMAIL DELIVERY')}</th><th>{t('ADDED')}</th><th className="align-right">{t('ACTIONS')}</th></tr></thead><tbody>
          {staff.map(member => <tr key={member.id} data-testid={`row-staff-${member.id}`}>
            <td><div className="staff-email"><span className="staff-avatar">{member.email.slice(0, 1).toUpperCase()}</span><b>{member.email}</b></div></td>
            <td><span className={`role-label ${member.role === 'coordinator' ? 'role-coordinator' : ''}`}>{member.role === 'coordinator' ? <Shield size={13} /> : <Users size={13} />}{display(member.role)}</span></td>
            <td>{member.role === 'coordinator' ? t('All programs') : member.programIds.map(id => programNames.get(id) || `Archived program ${id}`).join(', ') || t('No active programs')}</td>
            <td><Badge value={member.status} label={member.status === 'invited' ? 'Account not linked' : 'Active'} /></td>
            <td>{member.invitationEmailStatus
              ? <div className="row-actions">
                <Badge
                  value={member.invitationEmailStatus}
                  label={t(member.invitationEmailStatus === 'delivered' ? 'Delivered' : member.invitationEmailStatus === 'failed' ? 'Failed' : 'Pending')}
                />
                {member.status === 'invited' && member.invitationEmailStatus !== 'delivered' && <button
                  className="button button-quiet"
                  onClick={() => {
                    setRetryingStaffId(member.id);
                    retryStaffInvitationEmail.mutate({ id: member.id }, {
                      onSuccess: () => invalidate(client, [getListStaffQueryKey()]),
                      onError: () => invalidate(client, [getListStaffQueryKey()]),
                      onSettled: () => setRetryingStaffId(null),
                    });
                  }}
                  disabled={retryStaffInvitationEmail.isPending}
                  aria-label={`${t('Retry email')} for ${member.email}`}
                  data-testid={`button-retry-staff-invitation-${member.id}`}
                >{retryingStaffId === member.id ? t('Retrying…') : t('Retry email')}</button>}
              </div>
              : '—'}</td>
            <td>{dateLabel(member.createdAt)}</td>
            <td><div className="row-actions align-right"><button className="icon-button" onClick={() => setEditing(member)} aria-label={`Change role for ${member.email}`} data-testid={`button-edit-staff-${member.id}`}><Pencil size={15} /></button><button className="icon-button icon-danger" onClick={() => setDeleting(member)} aria-label={`Revoke ${member.email}`} data-testid={`button-delete-staff-${member.id}`}><Trash2 size={15} /></button></div></td>
          </tr>)}
        </tbody></table></div>
      </section>}
    <section className="panel staff-panel participant-invitation-panel">
      <div className="panel-heading"><div><div className="eyebrow">{t('PARTICIPANT ACCESS')}</div><h2 className="app-title">{t('Participant invitations')}</h2></div><span className="section-meta">{t('Program and existing business access')}</span></div>
      {participantInviteSuccess && <div className="participant-invite-success" role="status" data-testid="participant-invite-success">
        <div><b>{t('Invitation email sent.')}</b><p>{t('Ask this participant to create an account or sign in using')} <strong>{participantInviteSuccess.email}</strong> {t('before the invitation expires on')} <strong>{dateLabel(participantInviteSuccess.expiresAt.toISOString())}</strong>.</p></div>
        <div className="participant-invite-links"><Link href="/sign-up">{t('Create account')}</Link><Link href="/sign-in">{t('Sign in')}</Link></div>
        <button type="button" className="button button-quiet" onClick={() => void copyParticipantSignInInstructions()} data-testid="button-copy-participant-instructions">{t('Copy sign-in instructions')}</button>
        {inviteInstructionsStatus === 'copied' && <small>{t('Instructions copied.')}</small>}
        {inviteInstructionsStatus === 'error' && <small role="alert">{t('Could not copy instructions. Share the steps above instead.')}</small>}
      </div>}
      {participantInvitationsQuery.isLoading ? <LoadingState label="Loading participant invitations" /> :
        participantInvitationsQuery.isError ? <div className="form-error" role="alert"><CircleAlert size={16} /><span>{t('Could not load participant invitations.')}{participantListError?.data?.error ? ` ${t(participantListError.data.error)}` : ''}</span><button className="button button-quiet" onClick={() => void participantInvitationsQuery.refetch()}>{t('Retry')}</button></div> :
          participantInvitations.length === 0 ? <p className="empty-inline">{t('No invitations have been sent yet.')}</p> :
            <div className="table-wrap"><table><thead><tr><th>{t('EMAIL')}</th><th>{t('PARTICIPANT')}</th><th>{t('PROGRAM / BUSINESS')}</th><th>{t('ACCOUNT')}</th><th>{t('ADDED')}</th></tr></thead><tbody>
              {participantInvitations.map(invitation => <tr key={invitation.id} data-testid={`row-participant-invitation-${invitation.id}`}>
                <td><b>{invitation.email}</b></td><td>{invitation.participantName}</td>
                <td>{invitation.programName}<div className="table-secondary">{invitation.businessName}</div></td>
                <td><Badge value={invitation.status} label={invitation.status === 'active' ? 'Joined' : invitation.status === 'expired' ? 'Expired' : 'Waiting for sign-in'} /></td>
                <td>{dateLabel(invitation.createdAt)}</td>
              </tr>)}
            </tbody></table></div>}
    </section>
    {editing !== undefined && <FormDialog title={editing ? 'Change team role' : 'Invite a team member'} description={editing ? 'Choose the permissions and program scope this team member should have.' : 'Save access and send a branded invitation to this verified email. The person should sign in using the same address.'} fields={[...(editing ? staffRoleFields : staffInviteFields), programAssignmentField]} initial={editing ? { role: editing.role, programIds: editing.programIds.filter(id => programNames.has(id)).join(',') } : { role: 'staff', programIds: '' }} loading={create.isPending || update.isPending} onClose={() => setEditing(undefined)} onSubmit={save} submitLabel={editing ? undefined : 'Send invitation'} error={formError ? formError.data?.error || 'The change could not be saved.' : undefined} />}
    {invitingParticipant && <FormDialog title="Invite a participant" description="Grant access to the selected program and existing business. An invitation email will be sent and remains valid for 30 days." fields={[participantInviteFields[0], participantInviteFields[1], participantBusinessField]} loading={createParticipantInvitation.isPending} onClose={() => setInvitingParticipant(false)} onSubmit={saveParticipantInvitation} error={participantInviteError ? participantInviteError.data?.error || 'The participant invitation could not be saved.' : undefined} />}
    {deleting && <ConfirmDialog item={`staff access for ${deleting.email}`} onCancel={() => setDeleting(null)} onConfirm={revoke} loading={remove.isPending} error={deleteError ? deleteError.data?.error || 'The access could not be revoked.' : undefined} />}
  </>;
}

function NotFoundPage() {
  return <div className="not-found"><div className="eyebrow">404</div><h1 className="app-title">{t("That page isn't on the journey.")}</h1><p>{t('Return to the program overview and find your way back.')}</p><Link className="button button-primary" href="/">{t('Back to overview')} <ArrowRight size={16} /></Link></div>;
}

function Router({ staff, displayName }: { staff: StaffMember; displayName: string }) {
  useAppLanguage();
  const [location] = useLocation();
  const availableRoles = [...new Set(staff.programRoles.map(({ role }) => role))];
  const roleMatch = location.match(/^\/(trainer|mentor|judge)(?:\/|$)/);
  const activeRole = roleMatch?.[1];
  if (activeRole && availableRoles.includes(activeRole as typeof availableRoles[number])) {
    if (activeRole === 'trainer') {
      if (location === '/trainer') return <TrainerDashboardPage name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole} />;
      if (location === '/trainer/courses') return <RoleFrame role="trainer" name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole}><CourseManagementPage readOnly /></RoleFrame>;
      if (location === '/trainer/sessions') return <RoleFrame role="trainer" name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole}><SessionsPage staffId={staff.id} trainerView /></RoleFrame>;
    }
    if (activeRole === 'mentor' && (location === '/mentor' || location === '/mentor/settings')) return <MentorDashboardPage key={location} name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole} settingsOnly={location === '/mentor/settings'} />;
    if (activeRole === 'judge' && location === '/judge') return <JudgeDashboardPage name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole} />;
    return <RoleNotFound role={activeRole as StaffMember['role']} />;
  }
  if (staff.primaryRole === 'trainer' && (location === '/courses' || location === '/sessions')) {
    return location === '/courses'
      ? <RoleFrame role="trainer" name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole}><CourseManagementPage readOnly /></RoleFrame>
      : <RoleFrame role="trainer" name={displayName} availableRoles={availableRoles} primaryRole={staff.primaryRole}><SessionsPage staffId={staff.id} trainerView /></RoleFrame>;
  }
  const isAdmin = staff.primaryRole === 'coordinator';
  const isProgramStaff = staff.primaryRole === 'staff';
  return <ErrorBoundary resetKey={location}><Shell staff={staff} displayName={displayName}><Switch>
    <Route path="/" component={Overview} />
    <Route path="/businesses">{() => <BusinessesPage isAdmin={isAdmin} />}</Route>
    <Route path="/programs">{() => <ProgramsPage coordinator={isAdmin} />}</Route>
    <Route path="/analytics">{() => isAdmin ? <><ProgramAnalyticsPage /><LearningProgressAnalytics /></> : <NotFoundPage />}</Route>
    <Route path="/branding" component={isAdmin ? BrandingPage : NotFoundPage} />
    <Route path="/api-integrations" component={isAdmin ? ApiIntegrationsPage : NotFoundPage} />
    <Route path="/courses">{() => isAdmin ? <CourseManagementPage /> : isProgramStaff ? <CourseManagementPage schedulingOnly /> : <NotFoundPage />}</Route>
    <Route path="/sessions">{() => <SessionsPage coordinator={isAdmin} staffId={staff.id} />}</Route>
    <Route path="/communications" component={isAdmin ? CommunicationsPage : NotFoundPage} />
    <Route path="/support">{() => <SupportPage coordinator={isAdmin} />}</Route>
    <Route path="/pitches">{() => <PitchesPage coordinator={isAdmin} />}</Route>
    <Route path="/grants" component={isAdmin ? GrantManagementPage : NotFoundPage} />
    <Route path="/applications" component={isAdmin ? ApplicationsReviewPage : NotFoundPage} />
    <Route path="/mentor-booking" component={isAdmin ? MentorBookingStatusPage : NotFoundPage} />
    <Route path="/team" component={isAdmin ? TeamPage : NotFoundPage} />
    <Route path="/team-assignments">{() => isAdmin || isProgramStaff ? <ProgramTeamAssignmentsPage isAdmin={isAdmin} /> : <NotFoundPage />}</Route>
    <Route path="/access" component={isAdmin ? RoleAccessPage : NotFoundPage} />
    <Route path="/profile" component={OwnProfilePage} />
    <Route path="/profiles" component={isAdmin ? AdminProfilesPage : NotFoundPage} />
    <Route component={NotFoundPage} />
  </Switch></Shell></ErrorBoundary>;
}

function AuthLanding() {
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const branding = brandingQuery.data;
  return <PublicLanding brandName={branding?.brandName} logoUrl={branding?.logoUrl} />;
}

function AuthLoading() {
  return <main className="auth-status-page"><div className="brand-mark">J</div><LanguageToggle /><p>{t('Checking your staff access…')}</p></main>;
}

function AccessDenied({ retry }: { retry?: () => void }) {
  useAppLanguage();
  const { signOut } = useClerk();
  return <main className="auth-status-page"><LanguageToggle /><span className="denied-icon"><Shield size={21} /></span><div className="eyebrow">{t('STAFF ACCESS REQUIRED')}</div><h1 className="app-title">{t('This account isn’t approved yet.')}</h1><p>{t('Ask an admin to approve your verified email address, then sign in again.')}</p><div className="auth-actions">{retry && <button className="button button-outline" onClick={retry}>{t('Check access again')}</button>}<button className="button button-primary" onClick={() => void signOut({ redirectUrl: basePath || '/' })}><LogOut size={15} /> {t('Sign out')}</button></div></main>;
}

function AccessCheckFailed({ retry, sessionExpired = false }: { retry: () => void; sessionExpired?: boolean }) {
  useAppLanguage();
  const { signOut } = useClerk();
  return <main className="auth-status-page"><LanguageToggle /><span className="denied-icon"><CircleAlert size={21} /></span><div className="eyebrow">{t('ACCESS CHECK')}</div><h1 className="app-title">{t(sessionExpired ? 'Your sign-in needs refreshing.' : 'We couldn’t verify access.')}</h1><p>{t(sessionExpired ? 'Sign out, then sign in again to refresh your session.' : 'Your program data is still protected. Check your connection and try again.')}</p><div className="auth-actions"><button className="button button-outline" onClick={retry}>{t('Try again')}</button><button className="button button-primary" onClick={() => void signOut({ redirectUrl: basePath || '/' })}><LogOut size={15} /> {t('Sign out')}</button></div></main>;
}

function AuthenticatedWorkspace() {
  const [location, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const staffQuery = useGetAuthMe({
    query: { queryKey: getGetAuthMeQueryKey(), enabled: isLoaded && isSignedIn === true, retry: false },
  });
  const ownProfileQuery = useGetOwnProfile({
    query: { queryKey: getGetOwnProfileQueryKey(), enabled: Boolean(staffQuery.data), retry: false },
  });
  const roleHome = (role: StaffMember['primaryRole']) => role === 'trainer' ? '/trainer' : role === 'mentor' ? '/mentor' : role === 'judge' ? '/judge' : '/';
  const permitted = (staff: StaffMember, path: string) => {
    if (path === '/profile') return true;
    if (path === '/profiles') return staff.primaryRole === 'coordinator';
    const roles = new Set(staff.programRoles.map(({ role }) => role));
    const requestedRole = path.match(/^\/(trainer|mentor|judge)(?:\/|$)/)?.[1];
    if (requestedRole) {
      const validTrainerPath = requestedRole !== 'trainer' || ['/trainer', '/trainer/courses', '/trainer/sessions'].includes(path);
      return roles.has(requestedRole as typeof staff.programRoles[number]['role']) && validTrainerPath;
    }
    if (staff.primaryRole === 'trainer' && (path === '/courses' || path === '/sessions')) return roles.has('trainer');
    if (path === '/participant') return false;
    if (staff.primaryRole !== 'coordinator' && staff.primaryRole !== 'staff') return false;
    const isAdmin = staff.primaryRole === 'coordinator';
    if (!isAdmin && ['/applications', '/mentor-booking', '/team', '/access', '/analytics', '/branding', '/api-integrations', '/communications', '/grants'].includes(path)) return false;
    return ['/', '/businesses', '/programs', '/sessions', '/support', '/pitches', '/courses', '/team-assignments', ...(isAdmin ? ['/communications', '/applications', '/mentor-booking', '/team', '/access', '/analytics', '/branding', '/api-integrations', '/grants', '/profiles'] : [])].includes(path);
  };
  const accessStatus = (staffQuery.error as { status?: number } | null)?.status;
  useEffect(() => {
    if (staffQuery.data && !permitted(staffQuery.data, location)) setLocation(roleHome(staffQuery.data.primaryRole));
    if (staffQuery.isError && accessStatus === 403 && !location.startsWith('/participant')) setLocation('/participant');
  }, [staffQuery.data, staffQuery.isError, accessStatus, location, setLocation]);
  if (!isLoaded || (isSignedIn && (!userLoaded || staffQuery.isLoading))) return <AuthLoading />;
  if (!isSignedIn) return <AuthLanding />;
  if (staffQuery.data && !permitted(staffQuery.data, location)) return <AuthLoading />;
  if (staffQuery.isError || !staffQuery.data) {
    const status = (staffQuery.error as { status?: number } | null)?.status;
    if (location.startsWith('/participant') && status === 403) {
      return location === '/participant/profile' ? <ParticipantProfilePage /> : <ParticipantDashboardPage />;
    }
    if (status === 403) return <AccessDenied retry={() => void staffQuery.refetch()} />;
    return <AccessCheckFailed sessionExpired={status === 401} retry={() => void staffQuery.refetch()} />;
  }
  const displayName = ownProfileQuery.data?.displayName || user?.fullName || user?.primaryEmailAddress?.emailAddress || staffQuery.data.email;
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
  const { language } = useAppLanguage();
  return <QueryClientProvider client={queryClient}><ConfiguredClerkApp language={language} /></QueryClientProvider>;
}

function ConfiguredClerkApp({ language }: { language: 'en' | 'ar' }) {
  const [, setLocation] = useLocation();
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const branding = brandingQuery.data;
  const brandName = getDisplayBrandName(branding?.brandName);
  const primaryColor = branding?.primaryColor || '#28665a';
  useEffect(() => {
    if (!branding) return;
    const toHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      let h = 0, s = 0; const l = (max + min) / 2;
      if (delta) { s = delta / (1 - Math.abs(2 * l - 1)); h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4; h *= 60; if (h < 0) h += 360; }
      return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };
    const primaryHsl = toHsl(branding.primaryColor);
    const accentHsl = toHsl(branding.accentColor);
    const foreground = getAccessibleBrandForeground(branding.primaryColor);
    document.documentElement.style.setProperty('--primary', primaryHsl);
    document.documentElement.style.setProperty('--ring', primaryHsl);
    document.documentElement.style.setProperty('--accent', accentHsl);
    document.documentElement.style.setProperty('--primary-foreground', foreground);
    document.documentElement.style.setProperty('--sidebar-primary', primaryHsl);
    document.documentElement.style.setProperty('--sidebar-primary-foreground', foreground);
    document.title = `${brandName} · Program Hub`;
  }, [branding, brandName]);
  const appearance = {
    theme: shadcn,
    cssLayerName: 'clerk',
    options: {
      logoPlacement: 'inside' as const,
      logoLinkUrl: basePath || '/',
      logoImageUrl: branding?.logoUrl || `${window.location.origin}${basePath}/logo.svg`,
      socialButtonsPlacement: 'bottom' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    variables: {
      colorPrimary: primaryColor,
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
    localization={language === 'ar' ? arSA : {
      signIn: { start: { title: 'Welcome back', subtitle: `Sign in to access your ${brandName} workspace` } },
      signUp: { start: { title: `Create your ${brandName} account`, subtitle: 'Founders: use the email on your application' } },
    }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkQueryClientCacheInvalidator />
    <AuthRouter />
    <Toaster />
  </ClerkProvider>;
}

function AuthRouter() {
  useAppLanguage();
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  if (location === '/verify-certificate') return <CertificateVerificationPage />;
  if (location === '/apply') return <ApplyPage />;
  if (location.startsWith('/participant') && isLoaded && !isSignedIn) return <AuthPage mode="sign-in" participantRedirect />;
  if (location.startsWith('/sign-in')) return <AuthPage mode="sign-in" />;
  if (location.startsWith('/sign-up')) return <AuthPage mode="sign-up" />;
  return <AuthenticatedWorkspace />;
}

function App() {
  return <LanguageProvider><TooltipProvider><WouterRouter base={basePath}><Suspense fallback={<AuthLoading />}><ClerkApp /></Suspense></WouterRouter></TooltipProvider></LanguageProvider>;
}

export default App;
