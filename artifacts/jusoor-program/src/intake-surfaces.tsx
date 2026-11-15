import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantDashboardQueryKey, getListApplicationsQueryKey,
  getGetParticipantCoursesQueryKey, useGetParticipantCourses,
  getGetParticipantLearningProgressQueryKey, useGetParticipantLearningProgress,
  getGetParticipantIdeaValidationQueryKey, useGetParticipantIdeaValidation,
  getGetParticipantBusinessPlansQueryKey, useGetParticipantBusinessPlans,
  getGetParticipantBusinessTeamsQueryKey, getListApplicationProgramsQueryKey, getGetParticipantProfileQueryKey, useGetParticipantProfile, useGetParticipantDashboard,
  useGetParticipantBusinessTeams,
  useListApplications, useListApplicationPrograms, useReviewApplication,
  useSubmitApplication, useSubmitTrainingAnswer, useAskTrainingQuestion,
} from '@workspace/api-client-react';
import type { ApplicationProgram, EntrepreneurApplication, EntrepreneurApplicationInput, ParticipantBusinessTeam, ParticipantEnrollment, ParticipantAssignment, ParticipantQuestion, TrainingAnswerInput, TrainingQuestionInput } from '@workspace/api-client-react';
import { useClerk, useUser } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import { Button as EditorialButton } from '@workspace/program-editorial/components/ui/button';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { ParticipantAnnouncements } from './communications-surfaces';
import { SessionCalendar } from './session-calendar';
import { AccessibleDialogSurface, UnsavedChangesDialog } from './accessible-dialog';
import { SessionRecordingPlayer } from './session-recording-player';
import {
  ArrowRight, CalendarDays, Check, CircleAlert, Clock3, ExternalLink,
  FileText, Handshake, MapPin, ShieldCheck, Video, BookOpen, Download, ExternalLink as ExternalLinkIcon, Play, Users,
} from 'lucide-react';
import './course-learning.css';
import './participant-business-team.css';
import { CourseDiscussion } from './course-discussion';
import { ParticipantSessionInteractions } from './session-interactions';
import { ParticipantModuleQuizzes } from './course-quizzes';
import { ParticipantLearningProgress } from './learning-progress';
import { ParticipantIdeaValidation } from './idea-validation';
import { ParticipantBusinessPlan } from './founder-business-plan';
import { ParticipantPeerDirectory } from './peer-directory';
import { ParticipantAccountActions } from './participant-account-actions';
import { getGetProgramBrandingQueryKey, useGetProgramBranding, type GetProgramBrandingQueryResult } from '@workspace/api-client-react';
import { getDisplayBrandName, shouldShowBrandCaption, LanguageToggle, currentLanguage, t, useAppLanguage } from './language';
import { getBrandingThemeTokens } from './branding-contrast';
import { applicationSubmitErrorKey } from './application-errors';
import { getParticipantNextAction } from './participant-dashboard-helpers';
import {
  Form, FormControl, FormField, FormItem, FormLabel, useFormField,
} from '@/components/ui/form';

const CoursePackagePlayer = lazy(() => import('./course-package-player').then(module => ({ default: module.CoursePackagePlayer })));

const applicationSchema = z.object({
  programId: z.string().min(1, 'Choose a cohort to apply to.'),
  founderName: z.string().trim().min(2, 'Enter your full name.').max(120, 'Founder name must be 120 characters or fewer.'),
  email: z.string().trim().email('Enter a valid email address.').max(254, 'Email address must be 254 characters or fewer.'),
  phone: z.string().max(40, 'Phone number must be 40 characters or fewer.').optional(),
  businessName: z.string().trim().min(2, 'Enter your venture name.').max(160, 'Venture name must be 160 characters or fewer.'),
  industry: z.string().max(120, 'Industry must be 120 characters or fewer.').optional(),
  website: z.string().max(300, 'Website must be 300 characters or fewer.').optional().refine(value => !value || /^https?:\/\//i.test(value), 'Include http:// or https://'),
  summary: z.string().trim().min(30, 'Tell us at least 30 characters about your venture.').max(3000, 'Venture description must be 3,000 characters or fewer.'),
  supportNeeds: z.string().trim().min(10, 'Tell us at least 10 characters about the support you need.').max(3000, 'Support request must be 3,000 characters or fewer.'),
  contactNote: z.string().max(300).optional(),
});
type ApplicationFormValues = z.infer<typeof applicationSchema>;
type PublicApplicationSubmission = EntrepreneurApplicationInput & { contactNote: string };
const applicationFieldMaxLengths = {
  founderName: 120,
  email: 254,
  phone: 40,
  businessName: 160,
  industry: 120,
  website: 300,
  summary: 3000,
  supportNeeds: 3000,
} as const;

const dateText = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('To be announced');
const word = (value?: string | null) => value ? t(value.replaceAll('_', ' ').replace(/\b\w/g, part => part.toUpperCase())) : '—';
const statusWords: Record<string, string> = { submitted: 'Submitted', under_review: 'In review', accepted: 'Accepted', declined: 'Not selected' };
const statusClass = (status: string) => ['accepted', 'completed', 'confirmed'].includes(status) ? 'badge-good' : ['declined', 'cancelled'].includes(status) ? 'badge-bad' : ['submitted', 'under_review', 'scheduled', 'requested', 'rescheduled'].includes(status) ? 'badge-warm' : 'badge-neutral';

const meetingDateTime = (value: string, timezone?: string | null) => {
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
};

function ApplicationFormMessage() {
  const { error, formMessageId } = useFormField();
  const message = error?.message == null ? '' : String(error.message);
  if (!message) return null;
  return <p id={formMessageId} className="text-[0.8rem] font-medium text-destructive">{t(message)}</p>;
}
type ProgramBranding = GetProgramBrandingQueryResult;

function IntakeBrand({ brand }: { brand?: ProgramBranding }) {
  return <Link href="/" className="intake-brand" data-testid="link-program-home">{brand?.logoUrl ? <img className="intake-logo-image" src={brand.logoUrl} alt="" /> : <span className="brand-mark">{getDisplayBrandName(brand?.brandName).slice(0, 1)}</span>}<span><b>{getDisplayBrandName(brand?.brandName)}</b>{shouldShowBrandCaption(getDisplayBrandName(brand?.brandName)) && <small>{t('PROGRAM HUB')}</small>}</span></Link>;
}

function ParticipantIntakeBrand() {
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  return <IntakeBrand brand={brandingQuery.data} />;
}

function IntakeFrame({ children }: { children: React.ReactNode }) {
  useAppLanguage();
  const brandingQuery = useGetProgramBranding({ query: { queryKey: getGetProgramBrandingQueryKey() } });
  const brand = brandingQuery.data;
  const themeStyle = useMemo(
    () => getBrandingThemeTokens(brand?.primaryColor, brand?.accentColor) as CSSProperties,
    [brand?.primaryColor, brand?.accentColor],
  );
  return <div className="intake-page" style={themeStyle}><header className="intake-top"><IntakeBrand brand={brand} /><div className="intake-header-actions"><LanguageToggle /><Link href="/participant" className="text-link" data-testid="link-applicant-sign-in">{t('Applicant sign in')} <ArrowRight size={14} /></Link></div></header>{children}<footer className="intake-footer footer-brandless"><span>{t('BUILDING THE NEXT GENERATION OF BUSINESSES')}</span></footer></div>;
}

function ProgramLoading() {
  return <div className="loading-panel" aria-label={t('Loading application programs')}><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
}

export function ApplyPage() {
  useAppLanguage();
  const programsQuery = useListApplicationPrograms({ query: { queryKey: getListApplicationProgramsQueryKey() } });
  const submit = useSubmitApplication();
  const client = useQueryClient();
  const [receipt, setReceipt] = useState<{ id: number; status: string } | null>(null);
  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { programId: '', founderName: '', email: '', phone: '', businessName: '', industry: '', website: '', summary: '', supportNeeds: '', contactNote: '' },
  });
  const programs = programsQuery.data || [];
  const selectedProgram = programs.find(program => String(program.id) === form.watch('programId'));
  const onSubmit = (values: ApplicationFormValues) => {
    const data: PublicApplicationSubmission = {
      programId: Number(values.programId),
      founderName: values.founderName.trim(),
      email: values.email.trim(),
      businessName: values.businessName.trim(),
      summary: values.summary.trim(),
      supportNeeds: values.supportNeeds.trim(),
      contactNote: values.contactNote?.trim() ?? '',
      ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
      ...(values.industry?.trim() ? { industry: values.industry.trim() } : {}),
      ...(values.website?.trim() ? { website: values.website.trim() } : {}),
    };
    submit.mutate({ data }, {
      onSuccess: result => {
        setReceipt({ id: result.id, status: result.status });
        form.reset();
        void Promise.all([
          client.invalidateQueries({ queryKey: getListApplicationProgramsQueryKey() }),
          client.invalidateQueries({ queryKey: getListApplicationsQueryKey() }),
          client.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() }),
        ]);
      },
    });
  };

  return <IntakeFrame><main className="intake-main page-enter">
    <section className="intake-hero"><div><div className="eyebrow">{t('YOUR NEXT CHAPTER / START HERE')}</div><h1>{t('Make room for')}<br /><em>{t("what's next.")}</em></h1><p>{t('Bring ambitious founders together with the expertise, structure and connections to move a business forward.')}</p></div><aside className="intake-note"><div className="eyebrow">{t('A NOTE FROM THE PROGRAM')}</div><div><strong>{t('Good ventures grow with the right people around them.')}</strong><p>{t('Tell us where you are, where you want to go, and what would help you get there.')}</p></div></aside></section>
    {receipt ? <section className="intake-success" aria-live="polite" data-testid="success-application"><span className="intake-success-mark"><Check size={24} /></span><div className="eyebrow">{t('APPLICATION RECEIVED')}</div><h1>{t('Thank you for putting your work forward.')}</h1><p>{t('Your application is safely with our program team. Sign in with this email to follow its review status.')}</p><span className="receipt-code">{t('REFERENCE')} / JSR-{String(receipt.id).padStart(5, '0')}</span><p>{t('Create or sign in to an account with')} <b>{t('the same email used in your application')}</b> {t('to check your progress.')}</p><Link href="/sign-up" className="button button-primary" data-testid="link-create-applicant-account">{t('Create your account')} <ArrowRight size={15} /></Link></section>
    : programsQuery.isLoading ? <ProgramLoading /> : programsQuery.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={22} /></span><h3>{t('Programs are taking a moment.')}</h3><p>{t("We couldn't load open cohorts. Your work is saved nowhere yet; retry to continue.")}</p><button className="button button-outline" onClick={() => void programsQuery.refetch()} data-testid="button-retry-programs">{t('Retry loading programs')}</button></div>
     : programs.length === 0 ? <section className="closed-application-state" aria-labelledby="closed-applications-title" data-testid="closed-application-state">
       <PaperSurface variant="panel" className="closed-application-summary">
         <span className="empty-icon"><FileText size={22} aria-hidden="true" /></span>
         <div className="closed-application-summary-copy">
           <Typography variant="label" tone="accent">{t('NO OPEN APPLICATIONS')}</Typography>
           <Typography variant="heading" as="h2" id="closed-applications-title">{t('There are no open applications right now.')}</Typography>
           <Typography variant="body">{t('Future cohort applications will be listed here when applications open.')}</Typography>
         </div>
       </PaperSurface>
       <PaperSurface variant="panel" className="closed-application-guide">
         <Typography variant="label" tone="accent">{t('WHAT YOU CAN DO NOW')}</Typography>
         <Typography variant="heading" as="h3">{t('Get ready for the next cohort')}</Typography>
         <Typography variant="body">{t('Use this time to think through:')}</Typography>
         <ul className="closed-application-prompts">
           <li data-testid="closed-application-prep-item-venture"><Check size={15} aria-hidden="true" /><Typography variant="body" as="span">{t('Who does your venture serve, and what problem does it solve?')}</Typography></li>
           <li data-testid="closed-application-prep-item-progress"><Check size={15} aria-hidden="true" /><Typography variant="body" as="span">{t('What have you built, tested, or learned so far?')}</Typography></li>
           <li data-testid="closed-application-prep-item-support"><Check size={15} aria-hidden="true" /><Typography variant="body" as="span">{t('What support would help your venture take its next step?')}</Typography></li>
         </ul>
       </PaperSurface>
       <div className="closed-application-actions">
         <EditorialButton asChild variant="primary">
           <Link href="/" data-testid="link-closed-explore-program">{t('Explore the program')} <ArrowRight size={15} className="icon-directional" aria-hidden="true" /></Link>
         </EditorialButton>
         <Link href="/participant" className="closed-application-returning" data-testid="link-closed-track-progress">{t('Already applied? Sign in to track progress')} <ArrowRight size={14} className="icon-directional" aria-hidden="true" /></Link>
       </div>
     </section>
    : <div className="intake-grid">
      <Form {...form}><form className="intake-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
         <div className="application-honeypot" aria-hidden="true"><input {...form.register('contactNote')} type="text" tabIndex={-1} autoComplete="off" /></div>
        <section className="intake-form-section"><div className="intake-section-head"><span className="intake-step">01</span><div><h2>{t('Choose your cohort')}</h2><p>{t('Start with the program that fits the work ahead.')}</p></div></div>
            <FormField control={form.control} name="programId" render={({ field }) => <FormItem className="intake-field"><FormLabel>{t('Open program')} <i>*</i></FormLabel><FormControl><select {...field} data-testid="input-programId"><option value="">{t('Select a program')}</option>{programs.map((program: ApplicationProgram) => <option key={program.id} value={String(program.id)}>{program.name} · {word(program.format)}</option>)}</select></FormControl><ApplicationFormMessage />{selectedProgram && <small>{t(selectedProgram.description || 'A program designed to help founders make their next move.')}{selectedProgram.applicationDeadline ? ` ${t('Applications close')} ${dateText(selectedProgram.applicationDeadline)}.` : ''}</small>}</FormItem>} />
        </section>
        <section className="intake-form-section"><div className="intake-section-head"><span className="intake-step">02</span><div><h2>{t('The people and the venture')}</h2><p>{t('We use this to understand who is building and what you are building.')}</p></div></div>
          <div className="intake-fields">
            <TextField form={form} name="founderName" label="Founder name" placeholder="Your full name" testId="input-founderName" />
            <TextField form={form} name="email" label="Email address" type="email" placeholder="you@venture.com" testId="input-email" />
            <TextField form={form} name="businessName" label="Business or venture name" placeholder="What do you call it?" testId="input-businessName" />
            <TextField form={form} name="phone" label="Phone number" placeholder="Optional" testId="input-phone" />
            <TextField form={form} name="industry" label="Industry" placeholder="For example, education or food systems" testId="input-industry" />
            <TextField form={form} name="website" label="Website" placeholder="https://" testId="input-website" />
          </div>
        </section>
        <section className="intake-form-section"><div className="intake-section-head"><span className="intake-step">03</span><div><h2>{t('What are you working toward?')}</h2><p>{t('Specifics help us understand your stage and the kind of support that could matter.')}</p></div></div>
          <div className="intake-fields">
            <TextAreaField form={form} name="summary" label="Tell us about your venture" placeholder="What problem are you solving, who is it for, and what progress have you made so far?" helper="30–3,000 characters" testId="input-summary" />
            <TextAreaField form={form} name="supportNeeds" label="What support would move you forward?" placeholder="Think about mentorship, market access, product development, funding readiness, or something else." helper="10–3,000 characters" testId="input-supportNeeds" />
          </div>
        </section>
        {submit.isError && <div className="form-error" role="alert"><CircleAlert size={16} />{t(applicationSubmitErrorKey(submit.error))}</div>}
        <div className="intake-submit-row"><p>{t('By submitting, you agree that the program team may contact you about this application. Your information is shared only with the program team.')}</p><button className="button button-primary" type="submit" disabled={submit.isPending} data-testid="button-submit-application">{submit.isPending ? t('Sending application…') : <>{t('Submit application')} <ArrowRight size={15} /></>}</button></div>
      </form></Form>
        <aside className="intake-aside"><div className="eyebrow">{t('A CLEAR PROCESS')}</div><h3>{t('What happens next')}</h3><ol><li>{t('We read your application and consider your fit for the cohort.')}</li><li>{t('Our team may contact you for a conversation or more detail.')}</li><li>{t('An admin records a decision. Sign in anytime to follow your status.')}</li></ol><div className="deadline"><CalendarDays size={13} /> {t('Selected cohort deadline')} <b>{selectedProgram ? dateText(selectedProgram.applicationDeadline) : t('Choose a cohort to see its deadline')}</b></div></aside>
    </div>}
  </main></IntakeFrame>;
}

function TextField({ form, name, label, placeholder, type = 'text', testId }: { form: ReturnType<typeof useForm<ApplicationFormValues>>; name: 'founderName' | 'email' | 'phone' | 'businessName' | 'industry' | 'website'; label: string; placeholder: string; type?: string; testId: string }) {
  return <FormField control={form.control} name={name} render={({ field }) => <FormItem className="intake-field"><FormLabel>{t(label)}{['founderName', 'email', 'businessName'].includes(name) && <i> *</i>}</FormLabel><FormControl><input {...field} type={type} maxLength={applicationFieldMaxLengths[name]} autoComplete={name === 'founderName' ? 'name' : name === 'email' ? 'email' : 'off'} placeholder={t(placeholder)} data-testid={testId} /></FormControl><ApplicationFormMessage /></FormItem>} />;
}

function TextAreaField({ form, name, label, placeholder, helper, testId }: { form: ReturnType<typeof useForm<ApplicationFormValues>>; name: 'summary' | 'supportNeeds'; label: string; placeholder: string; helper: string; testId: string }) {
  return <FormField control={form.control} name={name} render={({ field }) => <FormItem className="intake-field field-span"><FormLabel>{t(label)} <i>*</i></FormLabel><FormControl><textarea {...field} maxLength={applicationFieldMaxLengths[name]} placeholder={t(placeholder)} data-testid={testId} /></FormControl><small>{t(helper)}</small><ApplicationFormMessage /></FormItem>} />;
}

export function ApplicationsReviewPage() {
  useAppLanguage();
  const query = useListApplications({ query: { queryKey: getListApplicationsQueryKey(), refetchOnWindowFocus: true } });
  const review = useReviewApplication();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [status, setStatus] = useState<'under_review' | 'accepted' | 'declined'>('under_review');
  const [notes, setNotes] = useState('');
  const records = query.data || [];
  const filtered = useMemo(() => records.filter(record => {
    const matches = `${record.founderName} ${record.businessName} ${record.email} ${record.programName}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter === 'all' || record.status === filter);
  }), [records, search, filter]);
  const active = records.find(record => record.id === activeId) || null;
  useEffect(() => {
    if (active) { setStatus(active.status === 'submitted' ? 'under_review' : active.status); setNotes(active.reviewNotes || ''); setConfirmReviewDiscard(false); }
  }, [active?.id]);
  const [confirmReviewDiscard, setConfirmReviewDiscard] = useState(false);
  const reviewIsDirty = Boolean(active && (
    status !== (active.status === 'submitted' ? 'under_review' : active.status) ||
    notes !== (active.reviewNotes || '')
  ));
  const requestReviewClose = () => {
    if (review.isPending) return;
    if (reviewIsDirty) setConfirmReviewDiscard(true);
    else setActiveId(null);
  };
  const saveReview = () => {
    if (!active) return;
    review.mutate({ id: active.id, data: { status, reviewNotes: notes.trim() || null } }, {
      onSuccess: () => {
        void Promise.all([
          client.invalidateQueries({ queryKey: getListApplicationsQueryKey() }),
          client.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() }),
        ]);
        setActiveId(null);
      },
    });
  };
  const counts = {
    all: records.length,
    submitted: records.filter(app => app.status === 'submitted').length,
    under_review: records.filter(app => app.status === 'under_review').length,
    decided: records.filter(app => ['accepted', 'declined'].includes(app.status)).length,
  };
  return <>
     <div className="page-heading"><div><div className="eyebrow">{t('COHORT INTAKE / ADMIN REVIEW')}</div><h1 className="app-title">{t('Applications')}</h1><p>{t('Read each founder’s story and keep the next decision clear.')}</p></div><Link href="/apply" className="button button-outline" data-testid="link-public-application"><ExternalLink size={14} /> {t('View public form')}</Link></div>
     <div className="review-statline"><div className="review-stat"><b>{counts.all}</b><span>{t('Total received')}</span></div><div className="review-stat"><b>{counts.submitted}</b><span>{t('New submissions')}</span></div><div className="review-stat"><b>{counts.under_review}</b><span>{t('In review')}</span></div><div className="review-stat"><b>{counts.decided}</b><span>{t('Decisions made')}</span></div></div>
    <section className="panel list-panel">
       <div className="review-toolbar"><label className="search-box"><FileText size={15} /><input aria-label={t('Search applications')} placeholder={t('Search founders, ventures or cohorts')} value={search} onChange={event => setSearch(event.target.value)} data-testid="input-search-applications" /></label><label className="filter-select"><span className="sr-only">{t('Filter application status')}</span><select value={filter} onChange={event => setFilter(event.target.value)} data-testid="select-application-status"><option value="all">{t('All statuses')}</option><option value="submitted">{t('Submitted')}</option><option value="under_review">{t('In review')}</option><option value="accepted">{t('Accepted')}</option><option value="declined">{t('Not selected')}</option></select></label><span className="toolbar-count"><b>{filtered.length}</b> {t('shown')}</span></div>
      {query.isLoading ? <div className="loading-panel"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
       : query.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={22} /></span><h3>{t('Applications couldn’t load.')}</h3><p>{t('Review records are unchanged. Try reconnecting to the program workspace.')}</p><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-applications">{t('Retry connection')}</button></div>
       : filtered.length === 0 ? <div className="empty-panel"><span className="empty-icon"><FileText size={22} /></span><h3>{t(records.length ? 'No applications match this view.' : 'The next founder story is still ahead.')}</h3><p>{t(records.length ? 'Try another status or search term.' : 'New submissions will appear here for admin review.')}</p>{records.length > 0 && <button className="button button-quiet" onClick={() => { setFilter('all'); setSearch(''); }} data-testid="button-clear-application-filters">{t('Clear filters')}</button>}</div>
        : <div className="table-wrap" role="region" tabIndex={0} aria-label={t('Scrollable results table')}><table><thead><tr><th>{t('FOUNDER / VENTURE')}</th><th>{t('PROGRAM')}</th><th>{t('SUBMITTED')}</th><th>{t('STATUS')}</th><th /></tr></thead><tbody>{filtered.map((record: EntrepreneurApplication) => <tr key={record.id} data-testid={`row-application-${record.id}`}><td><div className="company-cell"><span className="company-monogram">{record.founderName.slice(0, 1).toUpperCase()}</span><span><b>{record.founderName}</b><small>{record.businessName} · {record.email}</small></span></div></td><td>{record.programName}</td><td>{dateText(record.createdAt)}</td><td><span className={`badge ${statusClass(record.status)}`}><span />{t(statusWords[record.status] || word(record.status))}</span></td><td><button className="button button-quiet" onClick={() => setActiveId(record.id)} data-testid={`button-review-application-${record.id}`}>{t('Review')} <ArrowRight size={13} /></button></td></tr>)}</tbody></table></div>}
    </section>
     {active && <AccessibleDialogSurface className="modal-card" labelledBy="application-review-title" describedBy="application-review-description" initialFocusSelector="#application-review-title" onClose={requestReviewClose} closeOnEscape={!reviewIsDirty && !review.isPending} closeOnOutsideInteraction={!reviewIsDirty && !review.isPending} onDismissAttempt={() => { if (reviewIsDirty && !review.isPending) setConfirmReviewDiscard(true); }} testId={`dialog-application-${active.id}`}>
        <div className="modal-head"><div><nav className="application-review-breadcrumb" aria-label={t('Breadcrumb')}><button type="button" className="application-review-back" onClick={requestReviewClose} disabled={review.isPending} data-testid="button-review-back">{t('Applications')}</button><span aria-hidden="true">/</span><span aria-current="page">{`JSR-${String(active.id).padStart(5, '0')}`}</span></nav><h2 id="application-review-title" className="app-title" tabIndex={-1}>{active.businessName}</h2><p id="application-review-description">{active.founderName} · {active.programName}</p></div><button className="icon-button" aria-label={t('Close review')} onClick={requestReviewClose} disabled={review.isPending} data-testid="button-close-review">×</button></div>
      <div className="modal-form"><div className="application-detail"><div className="application-detail-main">
         <div className="application-detail-card"><h3>{t('Founder and venture')}</h3><div className="application-meta"><div><span>{t('FOUNDER')}</span><b>{active.founderName}</b></div><div><span>{t('EMAIL')}</span><a href={`mailto:${active.email}`}>{active.email}</a></div><div><span>{t('PHONE')}</span><b>{active.phone || t('Not provided')}</b></div><div><span>{t('INDUSTRY')}</span><b>{active.industry || t('Not specified')}</b></div><div><span>{t('WEBSITE')}</span>{active.website ? <a href={active.website} target="_blank" rel="noreferrer">{active.website}</a> : <b>{t('Not provided')}</b>}</div><div><span>{t('SUBMITTED')}</span><b>{dateText(active.createdAt)}</b></div></div></div>
         <div className="application-detail-card"><h3>{t('About the venture')}</h3><p>{active.summary}</p></div><div className="application-detail-card"><h3>{t('Support requested')}</h3><p>{active.supportNeeds}</p></div>
        </div><aside className="review-aside"><h3>{t('Admin decision')}</h3><label className="field">{t('Application status')}<select className="form-control" value={status} onChange={event => setStatus(event.target.value as typeof status)} disabled={active.status === 'accepted' || active.status === 'declined'} data-testid="select-review-status"><option value="under_review">{t('In review')}</option><option value="accepted">{t('Accepted')}</option><option value="declined">{t('Declined')}</option></select></label>{['accepted', 'declined'].includes(active.status) && <small>{t('This is a final decision. You can update its internal notes here.')}</small>}<label className="field">{t('Internal review notes')}<textarea className="review-note" value={notes} onChange={event => setNotes(event.target.value)} maxLength={3000} placeholder={t('Notes for the program team only')} data-testid="input-review-notes" /><small>{t('These notes are visible to admins only.')}</small></label>{review.isError && <div className="form-error" role="alert"><CircleAlert size={15} />{t('Decision not saved. Try again.')}</div>}<button className="button button-primary" onClick={saveReview} disabled={review.isPending} data-testid="button-save-review">{review.isPending ? t('Saving decision…') : <><Check size={15} /> {t('Save decision')}</>}</button></aside></div></div>
      </AccessibleDialogSurface>}
     {confirmReviewDiscard && <UnsavedChangesDialog onKeepEditing={() => setConfirmReviewDiscard(false)} onDiscard={() => { setConfirmReviewDiscard(false); setActiveId(null); }} />}
  </>;
}

const participantNavigationSections = [
  { id: 'participant-next-action', label: 'Next action', acceptedOnly: false },
  { id: 'participant-program-progress', label: 'Cohort', acceptedOnly: false },
  { id: 'participant-updates', label: 'Updates & reminders', acceptedOnly: false },
  { id: 'participant-sessions', label: 'What’s coming up', acceptedOnly: true },
  { id: 'participant-mentoring', label: 'Mentoring', acceptedOnly: true },
  { id: 'participant-learning', label: 'Learning', acceptedOnly: true },
  { id: 'participant-founder-workbook', label: 'Founder workbook', acceptedOnly: true },
  { id: 'participant-business-plan-workbook', label: 'Business plan workbook', acceptedOnly: true },
  { id: 'participant-founder-support', label: 'Founder support', acceptedOnly: true },
  { id: 'participant-assignments', label: 'Assignments', acceptedOnly: true },
  { id: 'participant-business-team', label: 'Business team', acceptedOnly: true },
] as const;

function ParticipantSectionNavigation({ hasAcceptedEnrollment }: { hasAcceptedEnrollment: boolean }) {
  const [activeId, setActiveId] = useState('participant-next-action');
  const visibleSections = participantNavigationSections.filter(section => !section.acceptedOnly || hasAcceptedEnrollment);

  useEffect(() => {
    const sections = visibleSections
      .map(({ id }) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    const updateActive = () => {
      const marker = ((document.querySelector('.participant-section-nav') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0) + 40;
      const current = sections.filter(section => section.getBoundingClientRect().top <= marker).at(-1) ?? sections[0];
      if (current) setActiveId(current.id);
    };
    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(scheduleUpdate, { rootMargin: '-90px 0px 0px 0px', threshold: 0 });
    sections.forEach(section => observer?.observe(section));
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [hasAcceptedEnrollment]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    url.hash = id;
    window.history.pushState(null, '', url);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setActiveId(id);
    window.dispatchEvent(new Event('hashchange'));
  };

  return <nav className="participant-section-nav" aria-label={t('On this page')} data-testid="participant-section-nav">
    <span className="participant-section-nav-label">{t('On this page')}</span>
    <div className="participant-section-nav-links">
      {visibleSections.map(section => <a
        key={section.id}
        href={`#${section.id}`}
        aria-current={activeId === section.id ? 'location' : undefined}
        data-testid={`link-${section.id}`}
        onClick={event => handleClick(event, section.id)}
      >{t(section.label)}</a>)}
    </div>
  </nav>;
}

export function ParticipantDashboardPage() {
  useAppLanguage();
  const { signOut } = useClerk();
  const query = useGetParticipantDashboard({ query: { queryKey: getGetParticipantDashboardQueryKey(), refetchOnWindowFocus: true, refetchInterval: 60_000 } });
  const profileQuery = useGetParticipantProfile({ query: { queryKey: getGetParticipantProfileQueryKey(), retry: false } });
  const { user } = useUser();
  const enrollments = query.data?.applications || [];
  const hasAcceptedEnrollment = enrollments.some(enrollment => enrollment.applicationStatus === 'accepted');
  const acceptedEnrollments = enrollments.filter(enrollment => enrollment.applicationStatus === 'accepted');
  const nextActionCoursesQuery = useGetParticipantCourses({ query: { queryKey: getGetParticipantCoursesQueryKey(), enabled: hasAcceptedEnrollment } });
  const nextActionProgressQuery = useGetParticipantLearningProgress({ query: { queryKey: getGetParticipantLearningProgressQueryKey(), enabled: hasAcceptedEnrollment } });
  const nextActionIdeaQuery = useGetParticipantIdeaValidation({ query: { queryKey: getGetParticipantIdeaValidationQueryKey(), enabled: hasAcceptedEnrollment } });
  const nextActionPlanQuery = useGetParticipantBusinessPlans({ query: { queryKey: getGetParticipantBusinessPlansQueryKey(), enabled: hasAcceptedEnrollment } });
  const nextAction = getParticipantNextAction({
    enrollments,
    courses: nextActionCoursesQuery.data,
    learningProgress: nextActionProgressQuery.data,
    ideaWorkbooks: nextActionIdeaQuery.data?.workbooks,
    businessPlans: nextActionPlanQuery.data?.plans,
  });
  const nextActionSources = [nextActionCoursesQuery, nextActionProgressQuery, nextActionIdeaQuery, nextActionPlanQuery];
  const nextActionError = hasAcceptedEnrollment && !nextAction && nextActionSources.some(source => source.isError);
  const nextActionLoading = hasAcceptedEnrollment && !nextAction && nextActionSources.some(source => source.isLoading);
  const retryNextActionSources = () => void Promise.all(nextActionSources.map(source => source.refetch()));
  const learningNow = Date.now();
  const hasAvailableCourseModule = (nextActionCoursesQuery.data?.programs || []).some(program => program.modules.some(module =>
    !module.releaseAt || new Date(module.releaseAt).getTime() <= learningNow));
  const hasProgressModules = (nextActionProgressQuery.data?.programs || []).some(program => program.modules.length > 0);
  const hasAvailableLearningModules = hasAvailableCourseModule || hasProgressModules;
  const learningQueriesPendingOrFailed = nextActionCoursesQuery.isLoading || nextActionCoursesQuery.isError ||
    nextActionProgressQuery.isLoading || nextActionProgressQuery.isError;
  const name = profileQuery.data?.displayName || user?.firstName || user?.fullName || 'Founder';
  useEffect(() => {
    if (query.isLoading || query.isError) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [query.isLoading, query.isError, query.data?.applications?.length]);
  return <div className="intake-page"><header className="intake-top"><ParticipantIntakeBrand /><div className="intake-header-actions"><LanguageToggle /><Link href="/" className="text-link" data-testid="link-participant-sign-out-home">{t('Program hub')} <ArrowRight size={14} /></Link></div></header>
    <main className="participant-wrap page-enter"><div className="participant-header"><div><div className="eyebrow">{t('YOUR PROGRAM JOURNEY / PRIVATE VIEW')}</div><h1>{t('Welcome,')} {name.split(' ')[0]}.</h1><p>{t('A clear view of your cohort, next steps, updates, and learning.')}</p></div><div className="participant-header-actions"><Link className="button button-outline" href="/participant/chat" data-testid="link-participant-chat">{t('Chat')}</Link><Link className="button button-outline" href="/participant/profile" data-testid="link-participant-profile">{t('Edit profile')}</Link><span className="participant-role-label">{t('PARTICIPANT')}</span><ParticipantAccountActions signOut={signOut} name={name} /></div></div>
      {query.isLoading ? <div className="loading-panel"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
        : query.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={22} /></span><h3>{t('Your progress view isn’t available just yet.')}</h3><p>{t('Check that you’re signed in with the same verified email used on your application or invitation. Your records remain private.')}</p><div className="auth-actions"><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-participant">{t('Retry connection')}</button><Link className="button button-primary" href="/sign-in" data-testid="link-participant-sign-in">{t('Sign in again')}</Link></div></div>
         : enrollments.length === 0 ? <><div className="intake-success"><span className="intake-success-mark"><ShieldCheck size={24} /></span><div className="eyebrow">{t('PRIVATE FOUNDER VIEW')}</div><h1>{t('No program access linked yet.')}</h1><p>{t('This account does not have a program application or invitation associated with it. Sign in using the same verified email you used when applying or the email Admin invited, or start an application to a current cohort.')}</p><Link href="/apply" className="button button-primary" data-testid="link-start-application">{t('Explore open programs')} <ArrowRight size={15} /></Link></div><ParticipantAnnouncements announcements={query.data?.announcements || []} /></>
           : <>
             <ParticipantSectionNavigation hasAcceptedEnrollment={hasAcceptedEnrollment} />
             <section id="participant-next-action" className="participant-anchor-section" aria-labelledby="participant-next-action-title" data-testid="participant-page-next-action">
               <div className="participant-next-action">
                 <div>
                   <span className="eyebrow">{t('YOUR NEXT ACTION')}</span>
                   <h2 id="participant-next-action-title">{nextAction ? t(nextAction.titleKey) : nextActionError ? t('Your next action could not be checked.') : t('Checking your next step…')}</h2>
                   {nextAction
                     ? <p>{t(nextAction.descriptionKey)}{nextAction.detail && <> <strong>{nextAction.detail}</strong></>}{nextAction.stepKey && <> <span>{t(nextAction.stepKey)}</span></>}{nextAction.date && <span className="participant-next-action-time"> · {t(nextAction.dateLabelKey || 'Date')}: {dateText(nextAction.date)}{nextAction.time ? ` · ${nextAction.time}` : ''}</span>}</p>
                     : nextActionError
                       ? <p role="alert">{t('We could not check assignments, sessions, learning or workbooks. Retry to find your next action.')}</p>
                       : <p role="status" aria-live="polite">{t('Checking assignments, sessions, learning and workbooks…')}</p>}
                 </div>
                 {nextAction?.href && nextAction.buttonLabelKey
                 ? <a className="button button-primary participant-primary-action" href={nextAction.href}>{t(nextAction.buttonLabelKey)} <ArrowRight size={15} /></a>
                   : nextActionError
                     ? <button type="button" className="button button-outline" onClick={retryNextActionSources} data-testid="button-retry-next-action">{t('Retry')}</button>
                     : null}
               </div>
             </section>
             <section id="participant-program-progress" className="participant-anchor-section participant-dashboard-section" aria-label={t('Your cohort')}>
               {enrollments.map((enrollment: ParticipantEnrollment) => <EnrollmentCard key={enrollment.applicationId} enrollment={enrollment} section="cohort" />)}
             </section>
             <section id="participant-updates" className="participant-anchor-section participant-dashboard-section">
               <ParticipantAnnouncements announcements={query.data?.announcements || []} />
             </section>
             {acceptedEnrollments.length > 0 && <>
               <section id="participant-sessions" className="participant-anchor-section participant-dashboard-section">
                 {acceptedEnrollments.map(enrollment => <EnrollmentCard key={enrollment.applicationId} enrollment={enrollment} section="sessions" />)}
               </section>
               <section id="participant-mentoring" className="participant-anchor-section participant-dashboard-section">
                 {acceptedEnrollments.map(enrollment => <EnrollmentCard key={enrollment.applicationId} enrollment={enrollment} section="mentoring" />)}
               </section>
               <section id="participant-learning" className="participant-anchor-section participant-dashboard-section">
                 <header className="participant-section-head participant-learning-hub-head">
                   <div><span className="eyebrow">{t('ONLINE INCUBATION / YOUR PROGRESS')}</span><h2>{t('Learning')}</h2><p>{t('Your course progress, learning time and a guided sequence of released materials in one place.')}</p></div>
                   <div className="lp-live-group"><span className="lp-live"><i aria-hidden="true" />{t('ACTIVE TIME TRACKING')}</span><small className="lp-live-explanation">{t('We count time while this page is visible and a course card is in view. Program Admins can see your total and cohort averages.')}</small></div>
                 </header>
                 <div className="offline-learning-note" role="note"><Download size={16} aria-hidden="true" /><div className="offline-learning-note-copy"><div className="offline-learning-note-title"><b>{t('Prepare materials for offline study')}</b></div><div className="offline-learning-note-body">{t('Uploaded files can be saved on a device. External links and interactive SCORM or xAPI packages require internet access; interactive lessons do not run offline.')}</div></div></div>
                 {hasAvailableLearningModules || learningQueriesPendingOrFailed
                   ? <><ParticipantLearningProgress showHeading={false} showEmpty={false} /><ParticipantProgramLearning showHeading={false} showEmpty={false} showOfflineNote={false} /></>
                   : <div className="participant-empty-line" data-testid="participant-learning-empty"><BookOpen size={17} aria-hidden="true" /><p>{t('No learning modules are available yet. Your cohort’s resources will appear here when released.')}</p></div>}
               </section>
               <section id="participant-founder-workbook" className="participant-anchor-section participant-dashboard-section">
                 <ParticipantIdeaValidation enrollments={acceptedEnrollments} />
               </section>
               <section id="participant-business-plan-workbook" className="participant-anchor-section participant-dashboard-section">
                 <ParticipantBusinessPlan enrollments={acceptedEnrollments} />
               </section>
               <section id="participant-founder-support" className="participant-anchor-section participant-dashboard-section">
                 {acceptedEnrollments.map(enrollment => <EnrollmentCard key={enrollment.applicationId} enrollment={enrollment} section="support" />)}
               </section>
               <section id="participant-assignments" className="participant-anchor-section participant-dashboard-section">
                 {acceptedEnrollments.map(enrollment => <ParticipantLearning key={enrollment.applicationId} enrollment={enrollment} />)}
               </section>
               <section id="participant-business-team" className="participant-anchor-section participant-dashboard-section">
                 <ParticipantBusinessTeams />
                 {acceptedEnrollments.map(enrollment => <EnrollmentCard key={enrollment.applicationId} enrollment={enrollment} section="team" />)}
               </section>
             </>}
           </>}
    </main><footer className="intake-footer footer-brandless"><span>{t('YOUR PROGRESS IS PRIVATE TO YOU')}</span></footer>
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

const participantBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function ParticipantProgramLearning({ showHeading = true, showEmpty = true, showOfflineNote = true }: { showHeading?: boolean; showEmpty?: boolean; showOfflineNote?: boolean } = {}) {
  useAppLanguage();
  const query = useGetParticipantCourses({ query: { queryKey: getGetParticipantCoursesQueryKey(), refetchOnWindowFocus: true } });
  const [activePackage, setActivePackage] = useState<{ id: number; title: string } | null>(null);
  const now = Date.now();
  if (query.isLoading) return <section className="participant-section participant-course-section" data-testid="participant-courses-loading">{showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Loading your released learning path.')}</p></div></div>}<div className="loading-panel"><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div></section>;
  if (query.isError) return <section className="participant-section participant-course-section">{showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Your accepted cohort learning materials.')}</p></div></div>}<div className="empty-panel error-panel" data-testid="error-participant-courses"><span className="empty-icon"><CircleAlert size={20} /></span><h3>{t('Your learning path couldn’t load.')}</h3><p>{t('Try reconnecting. Your cohort progress and materials remain private.')}</p><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-participant-courses">{t('Retry learning')}</button></div></section>;
  const programs = query.data?.programs || [];
   if (!programs.length) return showEmpty ? <section className="participant-section participant-course-section" data-testid="empty-participant-courses">{showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Your accepted cohort learning materials.')}</p></div></div>}<div className="empty-panel"><span className="empty-icon"><BookOpen size={20} /></span><h3>{t('Your learning path is being prepared.')}</h3><p>{t('Once released by your program team, modules and resources for your accepted cohort will appear here.')}</p></div></section> : null;
  return <><section className="participant-section participant-course-section" data-testid="participant-course-learning">
     {showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('A guided sequence of released modules and useful materials.')}</p></div><span className="badge badge-neutral">{programs.reduce((total, program) => total + program.modules.length, 0)} {t('released modules')}</span></div>}
      {showOfflineNote && <div className="offline-learning-note" role="note"><Download size={16} aria-hidden="true" /><div className="offline-learning-note-copy"><div className="offline-learning-note-title"><b>{t('Prepare materials for offline study')}</b></div><div className="offline-learning-note-body">{t('Uploaded files can be saved on a device. External links and interactive SCORM or xAPI packages require internet access; interactive lessons do not run offline.')}</div></div></div>}
     {programs.map(program => {
      const modules = program.modules.filter(module => !module.releaseAt || new Date(module.releaseAt).getTime() <= now).sort((a, b) => a.position - b.position);
      return <article className="participant-course-program" key={program.programId} data-testid={`participant-course-program-${program.programId}`}>
         <header className="participant-course-banner"><span className="participant-course-icon"><BookOpen size={17} /></span><div><h3>{program.programName}</h3><span>{modules.length} {t('learning')} {t(modules.length === 1 ? 'module' : 'modules')} {t('available')}</span></div></header>
         {!modules.length ? <div className="empty-panel"><p>{t('Your next module will appear here when your cohort releases it.')}</p></div> : modules.map((module, index) => <section className="participant-course-module" id={`participant-course-module-${module.id}`} key={module.id} data-testid={`participant-course-module-${module.id}`}><span className="participant-course-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{module.title}</h4>{module.description && <p>{module.description}</p>}<div className="participant-course-items">{module.materials.map(material => {
          const isUploadedFile = material.kind !== 'link' && material.kind !== 'scorm' && material.kind !== 'xapi' && Boolean(material.fileName);
          const href = material.kind === 'link' ? material.externalUrl || undefined : isUploadedFile ? `${participantBasePath}/api/participant/courses/materials/${material.id}/download` : undefined;
           const languageTag = material.language === 'ar' ? 'العربية' : 'English';
           if (material.kind === 'scorm' || material.kind === 'xapi') return <button className="participant-course-item participant-package-launch" type="button" key={material.id} onClick={() => setActivePackage({ id: material.id, title: material.title })} data-testid={`button-launch-course-package-${material.id}`}><Play size={13} />{material.title}<span className="participant-content-language">{languageTag}</span><span className="participant-material-mode">{t('Online only')}</span></button>;
           return href ? <a className="participant-course-item" key={material.id} href={href} download={isUploadedFile ? true : undefined} target={material.kind === 'link' ? '_blank' : undefined} rel={material.kind === 'link' ? 'noreferrer' : undefined} data-testid={`link-participant-course-material-${material.id}`}>{material.kind === 'link' ? <ExternalLinkIcon size={13} /> : <Download size={13} />}{material.title}<span className="participant-content-language">{languageTag}</span><span className="participant-material-mode">{t(material.kind === 'link' ? 'Internet required' : 'Save to device')}</span></a> : <span className="participant-course-item" key={material.id} data-testid={`text-participant-course-material-${material.id}`}><BookOpen size={13} />{material.title}<span className="participant-content-language">{languageTag}</span></span>;
          })}</div><ParticipantModuleQuizzes moduleId={module.id} /><CourseDiscussion moduleId={module.id} participant /></div></section>)}
      </article>;
    })}
   </section>{activePackage && <Suspense fallback={<div className="modal-backdrop" role="presentation"><section className="modal-card" role="status">{t('Loading course package…')}</section></div>}><CoursePackagePlayer materialId={activePackage.id} title={activePackage.title} onClose={() => setActivePackage(null)} /></Suspense>}</>;
}

type EnrollmentSection = 'cohort' | 'sessions' | 'mentoring' | 'support' | 'team';

function EnrollmentCard({ enrollment, section }: { enrollment: ParticipantEnrollment; section: EnrollmentSection }) {
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const support = enrollment.support;
  if (section === 'cohort') return <article className="participant-section participant-cohort-card" data-testid={`card-participant-application-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Your cohort')}</h2><p>{enrollment.enrollmentSource === 'admin_invitation' ? t('Participant access assigned') : t('Application received')} {dateText(enrollment.submittedAt)}</p></div><span className={`badge ${statusClass(enrollment.applicationStatus)}`} data-testid={`status-application-${enrollment.applicationId}`}><span />{statusWords[enrollment.applicationStatus] || word(enrollment.applicationStatus)}</span></div>
    <div className="participant-program"><div><div className="eyebrow">{word(enrollment.program.format)} {t('COHORT')}</div><h3>{enrollment.program.name}</h3><p>{enrollment.program.description || t('Your founder journey starts here.')}</p>{enrollment.business && <div className="participant-stage"><span>{t('Current venture stage')}</span><b>{word(enrollment.business.stage)}</b></div>}</div><div className="program-window"><span>{t('PROGRAM WINDOW')}</span><b>{dateText(enrollment.program.startDate)} — {dateText(enrollment.program.endDate)}</b></div></div>
  </article>;

  if (section === 'team') return <ParticipantPeerDirectory programId={enrollment.program.id} />;

  if (section === 'sessions') return <ParticipantSessionsSection enrollment={enrollment} calendarDate={calendarDate} onSelectDate={setCalendarDate} />;

  if (section === 'mentoring') return <ParticipantMentoringSection enrollment={enrollment} />;

  const founderSupport = support.filter(item => item.type !== 'mentor');
  return <section className="participant-section" data-testid={`founder-support-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Founder support')}</h2><p>{t('Support arranged for your business.')}</p></div></div>
    <div className="participant-card">{founderSupport.length === 0
      ? <div className="participant-empty-line" data-testid={`participant-founder-support-empty-${enrollment.applicationId}`}><Handshake size={17} aria-hidden="true" /><p>{t('No support engagements are linked yet. Your admin will update this space as support is arranged.')}</p></div>
      : founderSupport.map(item => <div className="participant-entry" key={item.id} data-testid={`support-participant-${item.id}`}><div className="calendar-icon"><Handshake size={16} /></div><div className="participant-entry-copy"><b>{item.topic}</b><span>{word(item.type)} {t('with')} {item.provider}{item.scheduledDate ? ` · ${dateText(item.scheduledDate)}` : ''}</span></div><span className={`badge ${statusClass(item.status)}`}>{word(item.status)}</span></div>)}</div>
  </section>;
}

function ParticipantSessionsSection({ enrollment, calendarDate, onSelectDate }: {
  enrollment: ParticipantEnrollment;
  calendarDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
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
        <SessionCalendar sessions={enrollment.sessions} selectedDate={calendarDate} onSelectDate={onSelectDate} />
        {!displayedSessions.length
          ? <p className="session-info">{t('No sessions are scheduled for this date. Choose another day or show all dates.')}</p>
          : displayedSessions.map(session => <div className="participant-entry" id={`participant-session-${session.id}`} key={session.id} data-testid={`session-participant-${session.id}`}>
            <div className="date-block"><b>{new Date(`${session.scheduledDate}T12:00:00`).getDate()}</b><span>{new Date(`${session.scheduledDate}T12:00:00`).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: 'short' }).toUpperCase()}</span></div>
            <div className="participant-entry-copy"><b>{session.title}</b><span>{word(session.type)} · {word(session.deliveryMode)}{session.startTime ? ` · ${session.startTime}` : ''}{session.facilitator ? ` · ${session.facilitator}` : ''}</span>{session.location && <span><MapPin size={11} /> {session.location}</span>}<div className="participant-entry-links">{session.zoomUrl && session.status === 'scheduled' && <EditorialButton asChild variant="primary" size="md" className="participant-session-join min-h-11"><a href={session.zoomUrl} target="_blank" rel="noopener noreferrer"><Video size={16} aria-hidden="true" /> {t('Join session')}</a></EditorialButton>}</div><SessionRecordingPlayer url={session.recordingUrl} title={session.title} /><ParticipantSessionInteractions sessionId={session.id} programId={enrollment.program.id} businessName={enrollment.business?.businessName} /></div>
            <span className={`badge ${statusClass(session.status)}`}>{word(session.status)}</span>
          </div>)}
      </div></div>}
  </section>;
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
          : meetings.map(meeting => <div className="participant-entry" key={`${meeting.bookingProvider}-${meeting.id}`} data-testid={`meeting-participant-${meeting.bookingProvider}-${meeting.id}`}><div className="calendar-icon"><CalendarDays size={16} /></div><div className="participant-entry-copy"><b>{t(meeting.eventName)}</b><span>{meetingDateTime(meeting.startsAt, meeting.timezone)} – {meetingDateTime(meeting.endsAt, meeting.timezone)}</span><span>{meeting.bookingProvider}</span>{meeting.timezone && <span>{meeting.timezone}</span>}</div><span className={`badge ${statusClass(meeting.status)}`}>{word(meeting.status)}</span></div>)}</div>
        <div className="participant-card"><h3>{t('Mentor support')}</h3>{mentorSupport.length
          ? mentorSupport.map(item => <div className="participant-entry" key={item.id} data-testid={`support-participant-${item.id}`}><div className="calendar-icon"><Handshake size={16} /></div><div className="participant-entry-copy"><b>{item.topic}</b><span>{word(item.type)} {t('with')} {item.provider}{item.scheduledDate ? ` · ${dateText(item.scheduledDate)}` : ''}</span>{item.mentorBookingUrl && <div className="participant-entry-links"><a href={item.mentorBookingUrl} target="_blank" rel="noreferrer"><CalendarDays size={12} /> {t('Book mentoring session')}</a></div>}</div><span className={`badge ${statusClass(item.status)}`}>{word(item.status)}</span></div>)
          : <div className="participant-empty-line"><Handshake size={17} aria-hidden="true" /><p>{t('No mentor support is scheduled yet.')}</p></div>}</div>
      </div>}
  </section>;
}

function ParticipantLearning({ enrollment }: { enrollment: ParticipantEnrollment }) {
  const queryClient = useQueryClient();
  const submit = useSubmitTrainingAnswer();
  const ask = useAskTrainingQuestion();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [feedback, setFeedback] = useState('');
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
  const submitAnswer = (event: FormEvent<HTMLFormElement>, assignment: ParticipantAssignment) => {
    event.preventDefault();
    const answer = (answers[assignment.id] || '').trim();
    if (!answer) return;
    const data: TrainingAnswerInput = { answer };
    submit.mutate({ id: assignment.id, data }, { onSuccess: () => { invalidate(); setAnswers(old => ({ ...old, [assignment.id]: '' })); } });
  };
  const askQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [kind, rawId] = context.split(':');
    const data: TrainingQuestionInput = {
      programId: enrollment.program.id,
      question: question.trim(),
      ...(kind === 'assignment' && rawId ? { assignmentId: Number(rawId) } : {}),
      ...(kind === 'session' && rawId ? { sessionId: Number(rawId) } : {}),
    };
    ask.mutate({ data }, { onSuccess: () => { invalidate(); setQuestion(''); setFeedback('Your question has been sent to the training team.'); } });
  };
  return <section className="participant-section" data-testid={`participant-learning-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Assignments and trainer questions')}</h2><p>{t('Your assignment work and a direct channel to your trainer.')}</p></div><span className="badge badge-neutral">{enrollment.assignments.length} {t('assignments')}</span></div>
    <div className="participant-grid">
      <div className="participant-card"><h3>{t('Assignments')}</h3>{enrollment.assignments.length === 0 ? <div className="participant-empty-line" data-testid={`participant-assignments-empty-${enrollment.applicationId}`}><FileText size={17} aria-hidden="true" /><p>{t('No assignments have been shared yet.')}</p></div> : enrollment.assignments.map(assignment => <article className="participant-assignment" id={`participant-assignment-${assignment.id}`} key={assignment.id} data-testid={`assignment-participant-${assignment.id}`}>
        <div className="assignment-heading"><div><b>{assignment.title}</b><span>{assignment.sessionTitle || t('Cohort work')} · {t('Due')} {dateText(assignment.dueDate)}</span></div><span className={`badge ${statusClass(assignment.status || 'requested')}`}><span />{word(assignment.status || 'not_started')}</span></div>
        <p>{assignment.instructions}</p>
        {assignment.answer && <div className="assignment-feedback"><b>{t('Your submitted answer')}</b><p>{assignment.answer}</p></div>}
        {assignment.feedback && <div className="assignment-feedback trainer-feedback"><b>{t('Trainer feedback')}{assignment.score !== null ? ` · ${assignment.score}/100` : ''}</b><p>{assignment.feedback}</p></div>}
        <form onSubmit={event => submitAnswer(event, assignment)} className="participant-answer-form"><label htmlFor={`answer-${assignment.id}`}>{assignment.answer ? t('Update your answer') : t('Your answer')}</label><textarea id={`answer-${assignment.id}`} value={answers[assignment.id] ?? ''} onChange={event => setAnswers(old => ({ ...old, [assignment.id]: event.target.value }))} required maxLength={12000} rows={4} placeholder={t('Write your response here. Text only.')} data-testid={`input-participant-answer-${assignment.id}`} /><button className="button button-primary" disabled={submit.isPending} data-testid={`button-submit-answer-${assignment.id}`}>{submit.isPending ? t('Submitting…') : assignment.answer ? t('Update submission') : t('Submit answer')}</button>{submit.isError && <span className="form-error" role="alert">{t('Your answer was not saved. Try again.')}</span>}</form>
      </article>)}</div>
      <div className="participant-card"><h3>{t('Ask your trainer')}</h3>{enrollment.questions.length === 0 ? <p className="session-info">{t('Ask about an assignment or session. Replies from your trainer will stay with your cohort here.')}</p> : <div className="participant-questions">{enrollment.questions.map((item: ParticipantQuestion) => <article key={item.id} className="participant-question" data-testid={`question-participant-${item.id}`}><span className="question-context">{item.assignmentTitle || item.sessionTitle || t('Cohort question')}</span><p>{item.question}</p>{item.reply ? <div className="question-reply"><b>{t('Trainer reply')}</b><p>{item.reply}</p></div> : <span className="badge badge-warm"><span />{t('Awaiting reply')}</span>}</article>)}</div>}
        <form className="participant-question-form" onSubmit={askQuestion}><label htmlFor={`question-context-${enrollment.applicationId}`}>{t('Related to')}</label><select id={`question-context-${enrollment.applicationId}`} value={context} onChange={event => setContext(event.target.value)} data-testid={`select-question-context-${enrollment.applicationId}`}><option value="">{t('General cohort question')}</option>{enrollment.sessions.map(session => <option key={`session-${session.id}`} value={`session:${session.id}`}>{session.title}</option>)}{enrollment.assignments.map(item => <option key={`assignment-${item.id}`} value={`assignment:${item.id}`}>{item.title}</option>)}</select><label htmlFor={`question-text-${enrollment.applicationId}`}>{t('Your question')}</label><textarea id={`question-text-${enrollment.applicationId}`} value={question} onChange={event => setQuestion(event.target.value)} minLength={5} maxLength={3000} required rows={3} placeholder={t('What would you like your trainer to clarify?')} data-testid={`input-participant-question-${enrollment.applicationId}`} /><button className="button button-primary participant-primary-action" disabled={ask.isPending} data-testid={`button-ask-trainer-${enrollment.applicationId}`}>{ask.isPending ? t('Sending…') : t('Send question')}</button>{feedback && <span className="role-success" role="status">{t(feedback)}</span>}{ask.isError && <span className="form-error" role="alert">{t('Your question was not sent. Please try again.')}</span>}</form>
      </div>
    </div>
     <div className="participant-support-note" role="note"><Handshake size={15} aria-hidden="true" /><span><b>{t('Need program support?')}</b> {t('Contact the program team if you need help outside a session.')}</span></div>
  </section>;
}
