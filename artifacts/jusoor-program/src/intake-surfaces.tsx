import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantDashboardQueryKey, getListApplicationsQueryKey,
  getListApplicationProgramsQueryKey, useGetParticipantDashboard,
  useListApplications, useListApplicationPrograms, useReviewApplication,
  useSubmitApplication,
} from '@workspace/api-client-react';
import type { ApplicationProgram, EntrepreneurApplication, EntrepreneurApplicationInput, ParticipantEnrollment } from '@workspace/api-client-react';
import { useUser } from '@clerk/react';
import { Link } from 'wouter';
import {
  ArrowRight, CalendarDays, Check, CircleAlert, Clock3, ExternalLink,
  FileText, Handshake, MapPin, ShieldCheck, Video,
} from 'lucide-react';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';

const applicationSchema = z.object({
  programId: z.string().min(1, 'Choose a cohort to apply to.'),
  founderName: z.string().trim().min(2, 'Enter your full name.').max(160),
  email: z.string().trim().email('Enter a valid email address.').max(320),
  phone: z.string().max(50).optional(),
  businessName: z.string().trim().min(2, 'Enter your venture name.').max(180),
  industry: z.string().max(120).optional(),
  website: z.string().max(500).optional().refine(value => !value || /^https?:\/\//i.test(value), 'Include http:// or https://'),
  summary: z.string().trim().min(30, 'Tell us at least 30 characters about your venture.').max(3000),
  supportNeeds: z.string().trim().min(10, 'Tell us at least 10 characters about the support you need.').max(1500),
});
type ApplicationFormValues = z.infer<typeof applicationSchema>;

const dateText = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'To be announced';
const word = (value?: string | null) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, part => part.toUpperCase()) : '—';
const statusWords: Record<string, string> = { submitted: 'Submitted', under_review: 'In review', accepted: 'Accepted', declined: 'Not selected' };
const statusClass = (status: string) => ['accepted', 'completed'].includes(status) ? 'badge-good' : ['declined', 'cancelled'].includes(status) ? 'badge-bad' : ['submitted', 'under_review', 'scheduled', 'requested'].includes(status) ? 'badge-warm' : 'badge-neutral';

function IntakeBrand() {
  return <Link href="/" className="intake-brand" data-testid="link-jusoor-home"><span className="brand-mark">J</span><span><b>Jusoor</b><small>ENTREPRENEURSHIP PROGRAM</small></span></Link>;
}

function IntakeFrame({ children }: { children: React.ReactNode }) {
  return <div className="intake-page"><header className="intake-top"><IntakeBrand /><Link href="/participant" className="text-link" data-testid="link-applicant-sign-in">Applicant sign in <ArrowRight size={14} /></Link></header>{children}<footer className="intake-footer"><span>JUSOOR ENTREPRENEURSHIP PROGRAM</span><span>BUILDING THE NEXT GENERATION OF BUSINESSES</span></footer></div>;
}

function ProgramLoading() {
  return <div className="loading-panel" aria-label="Loading application programs"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
}

export function ApplyPage() {
  const programsQuery = useListApplicationPrograms({ query: { queryKey: getListApplicationProgramsQueryKey() } });
  const submit = useSubmitApplication();
  const client = useQueryClient();
  const [receipt, setReceipt] = useState<{ id: number; status: string } | null>(null);
  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { programId: '', founderName: '', email: '', phone: '', businessName: '', industry: '', website: '', summary: '', supportNeeds: '' },
  });
  const programs = programsQuery.data || [];
  const selectedProgram = programs.find(program => String(program.id) === form.watch('programId'));
  const onSubmit = (values: ApplicationFormValues) => {
    const data: EntrepreneurApplicationInput = {
      programId: Number(values.programId),
      founderName: values.founderName.trim(),
      email: values.email.trim(),
      businessName: values.businessName.trim(),
      summary: values.summary.trim(),
      supportNeeds: values.supportNeeds.trim(),
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
    <section className="intake-hero"><div><div className="eyebrow">YOUR NEXT CHAPTER / START HERE</div><h1>Make room for<br /><em>what's next.</em></h1><p>Jusoor brings ambitious founders together with the expertise, structure and connections to move a business forward.</p></div><aside className="intake-note"><div className="eyebrow">A NOTE FROM JUSOOR</div><div><strong>Good ventures grow with the right people around them.</strong><p>Tell us where you are, where you want to go, and what would help you get there.</p></div></aside></section>
    {receipt ? <section className="intake-success" aria-live="polite" data-testid="success-application"><span className="intake-success-mark"><Check size={24} /></span><div className="eyebrow">APPLICATION RECEIVED</div><h1>Thank you for putting your work forward.</h1><p>Your application is safely with our program team. Sign in with this email to follow its review status.</p><span className="receipt-code">REFERENCE / JSR-{String(receipt.id).padStart(5, '0')}</span><p>Create or sign in to an account with <b>the same email used in your application</b> to check your progress.</p><Link href="/sign-up" className="button button-primary" data-testid="link-create-applicant-account">Create your account <ArrowRight size={15} /></Link></section>
    : programsQuery.isLoading ? <ProgramLoading /> : programsQuery.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={22} /></span><h3>Programs are taking a moment.</h3><p>We couldn't load open cohorts. Your work is saved nowhere yet; retry to continue.</p><button className="button button-outline" onClick={() => void programsQuery.refetch()} data-testid="button-retry-programs">Retry loading programs</button></div>
    : programs.length === 0 ? <div className="empty-panel"><span className="empty-icon"><FileText size={22} /></span><h3>There are no open applications right now.</h3><p>Check back soon for the next Jusoor cohort. We look forward to hearing about your work.</p></div>
    : <div className="intake-grid">
      <Form {...form}><form className="intake-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <section className="intake-form-section"><div className="intake-section-head"><span className="intake-step">01</span><div><h2>Choose your cohort</h2><p>Start with the program that fits the work ahead.</p></div></div>
          <FormField control={form.control} name="programId" render={({ field }) => <FormItem className="intake-field"><FormLabel>Open program <i>*</i></FormLabel><FormControl><select {...field} data-testid="input-programId"><option value="">Select a program</option>{programs.map((program: ApplicationProgram) => <option key={program.id} value={String(program.id)}>{program.name} · {word(program.format)}</option>)}</select></FormControl><FormMessage />{selectedProgram && <small>{selectedProgram.description || 'A Jusoor program designed to help founders make their next move.'}{selectedProgram.applicationDeadline ? ` Applications close ${dateText(selectedProgram.applicationDeadline)}.` : ''}</small>}</FormItem>} />
        </section>
        <section className="intake-form-section"><div className="intake-section-head"><span className="intake-step">02</span><div><h2>The people and the venture</h2><p>We use this to understand who is building and what you are building.</p></div></div>
          <div className="intake-fields">
            <TextField form={form} name="founderName" label="Founder name" placeholder="Your full name" testId="input-founderName" />
            <TextField form={form} name="email" label="Email address" type="email" placeholder="you@venture.com" testId="input-email" />
            <TextField form={form} name="businessName" label="Business or venture name" placeholder="What do you call it?" testId="input-businessName" />
            <TextField form={form} name="phone" label="Phone number" placeholder="Optional" testId="input-phone" />
            <TextField form={form} name="industry" label="Industry" placeholder="For example, education or food systems" testId="input-industry" />
            <TextField form={form} name="website" label="Website" placeholder="https://" testId="input-website" />
          </div>
        </section>
        <section className="intake-form-section"><div className="intake-section-head"><span className="intake-step">03</span><div><h2>What are you working toward?</h2><p>Specifics help us understand your stage and the kind of support that could matter.</p></div></div>
          <div className="intake-fields">
            <TextAreaField form={form} name="summary" label="Tell us about your venture" placeholder="What problem are you solving, who is it for, and what progress have you made so far?" helper="30–3,000 characters" testId="input-summary" />
            <TextAreaField form={form} name="supportNeeds" label="What support would move you forward?" placeholder="Think about mentorship, market access, product development, funding readiness, or something else." helper="10–1,500 characters" testId="input-supportNeeds" />
          </div>
        </section>
        {submit.isError && <div className="form-error" role="alert"><CircleAlert size={16} />We couldn’t submit your application. Check your connection and try again.</div>}
        <div className="intake-submit-row"><p>By submitting, you agree that Jusoor may contact you about this application. Your information is shared only with the program team.</p><button className="button button-primary" type="submit" disabled={submit.isPending} data-testid="button-submit-application">{submit.isPending ? 'Sending application…' : <>Submit application <ArrowRight size={15} /></>}</button></div>
      </form></Form>
       <aside className="intake-aside"><div className="eyebrow">A CLEAR PROCESS</div><h3>What happens next</h3><ol><li>We read your application and consider your fit for the cohort.</li><li>Our team may contact you for a conversation or more detail.</li><li>A coordinator records a decision. Sign in anytime to follow your status.</li></ol><div className="deadline"><CalendarDays size={13} /> Selected cohort deadline <b>{selectedProgram ? dateText(selectedProgram.applicationDeadline) : 'Choose a cohort to see its deadline'}</b></div></aside>
    </div>}
  </main></IntakeFrame>;
}

function TextField({ form, name, label, placeholder, type = 'text', testId }: { form: ReturnType<typeof useForm<ApplicationFormValues>>; name: 'founderName' | 'email' | 'phone' | 'businessName' | 'industry' | 'website'; label: string; placeholder: string; type?: string; testId: string }) {
  return <FormField control={form.control} name={name} render={({ field }) => <FormItem className="intake-field"><FormLabel>{label}{['founderName', 'email', 'businessName'].includes(name) && <i> *</i>}</FormLabel><FormControl><input {...field} type={type} autoComplete={name === 'founderName' ? 'name' : name === 'email' ? 'email' : 'off'} placeholder={placeholder} data-testid={testId} /></FormControl><FormMessage /></FormItem>} />;
}

function TextAreaField({ form, name, label, placeholder, helper, testId }: { form: ReturnType<typeof useForm<ApplicationFormValues>>; name: 'summary' | 'supportNeeds'; label: string; placeholder: string; helper: string; testId: string }) {
  return <FormField control={form.control} name={name} render={({ field }) => <FormItem className="intake-field field-span"><FormLabel>{label} <i>*</i></FormLabel><FormControl><textarea {...field} placeholder={placeholder} data-testid={testId} /></FormControl><small>{helper}</small><FormMessage /></FormItem>} />;
}

export function ApplicationsReviewPage() {
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
    if (active) { setStatus(active.status === 'submitted' ? 'under_review' : active.status); setNotes(active.reviewNotes || ''); }
  }, [active?.id]);
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
    <div className="page-heading"><div><div className="eyebrow">COHORT INTAKE / COORDINATOR REVIEW</div><h1 className="app-title">Applications</h1><p>Read each founder’s story and keep the next decision clear.</p></div><Link href="/apply" className="button button-outline" data-testid="link-public-application"><ExternalLink size={14} /> View public form</Link></div>
    <div className="review-statline"><div className="review-stat"><b>{counts.all}</b><span>Total received</span></div><div className="review-stat"><b>{counts.submitted}</b><span>New submissions</span></div><div className="review-stat"><b>{counts.under_review}</b><span>In review</span></div><div className="review-stat"><b>{counts.decided}</b><span>Decisions made</span></div></div>
    <section className="panel list-panel">
      <div className="review-toolbar"><label className="search-box"><FileText size={15} /><input aria-label="Search applications" placeholder="Search founders, ventures or cohorts" value={search} onChange={event => setSearch(event.target.value)} data-testid="input-search-applications" /></label><label className="filter-select"><span className="sr-only">Filter application status</span><select value={filter} onChange={event => setFilter(event.target.value)} data-testid="select-application-status"><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="under_review">In review</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></label><span className="toolbar-count"><b>{filtered.length}</b> shown</span></div>
      {query.isLoading ? <div className="loading-panel"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={22} /></span><h3>Applications couldn’t load.</h3><p>Review records are unchanged. Try reconnecting to the program workspace.</p><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-applications">Retry connection</button></div>
      : filtered.length === 0 ? <div className="empty-panel"><span className="empty-icon"><FileText size={22} /></span><h3>{records.length ? 'No applications match this view.' : 'The next founder story is still ahead.'}</h3><p>{records.length ? 'Try another status or search term.' : 'New submissions will appear here for coordinator review.'}</p>{records.length > 0 && <button className="button button-quiet" onClick={() => { setFilter('all'); setSearch(''); }} data-testid="button-clear-application-filters">Clear filters</button>}</div>
      : <div className="table-wrap"><table><thead><tr><th>FOUNDER / VENTURE</th><th>PROGRAM</th><th>SUBMITTED</th><th>STATUS</th><th /></tr></thead><tbody>{filtered.map((record: EntrepreneurApplication) => <tr key={record.id} data-testid={`row-application-${record.id}`}><td><div className="company-cell"><span className="company-monogram">{record.founderName.slice(0, 1).toUpperCase()}</span><span><b>{record.founderName}</b><small>{record.businessName} · {record.email}</small></span></div></td><td>{record.programName}</td><td>{dateText(record.createdAt)}</td><td><span className={`badge ${statusClass(record.status)}`}><span />{statusWords[record.status] || word(record.status)}</span></td><td><button className="button button-quiet" onClick={() => setActiveId(record.id)} data-testid={`button-review-application-${record.id}`}>Review <ArrowRight size={13} /></button></td></tr>)}</tbody></table></div>}
    </section>
    {active && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveId(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="application-review-title" data-testid={`dialog-application-${active.id}`}>
      <div className="modal-head"><div><div className="eyebrow">APPLICATION / JSR-{String(active.id).padStart(5, '0')}</div><h2 id="application-review-title" className="app-title">{active.businessName}</h2><p>{active.founderName} · {active.programName}</p></div><button className="icon-button" aria-label="Close review" onClick={() => setActiveId(null)} data-testid="button-close-review">×</button></div>
      <div className="modal-form"><div className="application-detail"><div className="application-detail-main">
        <div className="application-detail-card"><h3>Founder and venture</h3><div className="application-meta"><div><span>FOUNDER</span><b>{active.founderName}</b></div><div><span>EMAIL</span><a href={`mailto:${active.email}`}>{active.email}</a></div><div><span>PHONE</span><b>{active.phone || 'Not provided'}</b></div><div><span>INDUSTRY</span><b>{active.industry || 'Not specified'}</b></div><div><span>WEBSITE</span>{active.website ? <a href={active.website} target="_blank" rel="noreferrer">{active.website}</a> : <b>Not provided</b>}</div><div><span>SUBMITTED</span><b>{dateText(active.createdAt)}</b></div></div></div>
        <div className="application-detail-card"><h3>About the venture</h3><p>{active.summary}</p></div><div className="application-detail-card"><h3>Support requested</h3><p>{active.supportNeeds}</p></div>
       </div><aside className="review-aside"><h3>Coordinator decision</h3><label className="field">Application status<select className="form-control" value={status} onChange={event => setStatus(event.target.value as typeof status)} disabled={active.status === 'accepted' || active.status === 'declined'} data-testid="select-review-status"><option value="under_review">In review</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></label>{['accepted', 'declined'].includes(active.status) && <small>This is a final decision. You can update its internal notes here.</small>}<label className="field">Internal review notes<textarea className="review-note" value={notes} onChange={event => setNotes(event.target.value)} maxLength={3000} placeholder="Notes for the program team only" data-testid="input-review-notes" /><small>These notes are visible to coordinators only.</small></label>{review.isError && <div className="form-error" role="alert"><CircleAlert size={15} />Decision not saved. Try again.</div>}<button className="button button-primary" onClick={saveReview} disabled={review.isPending} data-testid="button-save-review">{review.isPending ? 'Saving decision…' : <><Check size={15} /> Save decision</>}</button></aside></div></div>
    </section></div>}
  </>;
}

export function ParticipantDashboardPage() {
  const query = useGetParticipantDashboard({ query: { queryKey: getGetParticipantDashboardQueryKey(), refetchOnWindowFocus: true } });
  const { user } = useUser();
  const enrollments = query.data?.applications || [];
  const name = user?.firstName || user?.fullName || 'Founder';
  return <div className="intake-page"><header className="intake-top"><IntakeBrand /><Link href="/" className="text-link" data-testid="link-participant-sign-out-home">Jusoor hub <ArrowRight size={14} /></Link></header>
    <main className="participant-wrap page-enter"><div className="participant-header"><div><div className="eyebrow">YOUR JUSOOR JOURNEY / PRIVATE VIEW</div><h1>Welcome, {name.split(' ')[0]}.</h1><p>Your application status, upcoming sessions and support in one place.</p></div><span className="role-chip">PARTICIPANT</span></div>
      {query.isLoading ? <div className="loading-panel"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={22} /></span><h3>Your progress view isn’t available just yet.</h3><p>Check that you’re signed in with the same email used on your application. Your records remain private.</p><div className="auth-actions"><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-participant">Retry connection</button><Link className="button button-primary" href="/sign-in" data-testid="link-participant-sign-in">Sign in again</Link></div></div>
      : enrollments.length === 0 ? <div className="intake-success"><span className="intake-success-mark"><ShieldCheck size={24} /></span><div className="eyebrow">PRIVATE FOUNDER VIEW</div><h1>No applications linked yet.</h1><p>This account does not have an application associated with it. Sign in using the same verified email you entered on your application, or start an application to a current cohort.</p><Link href="/apply" className="button button-primary" data-testid="link-start-application">Explore open programs <ArrowRight size={15} /></Link></div>
      : <>{enrollments.map((enrollment: ParticipantEnrollment) => <EnrollmentCard key={enrollment.applicationId} enrollment={enrollment} />)}</>}
    </main><footer className="intake-footer"><span>JUSOOR ENTREPRENEURSHIP PROGRAM</span><span>YOUR PROGRESS IS PRIVATE TO YOU</span></footer>
  </div>;
}

function EnrollmentCard({ enrollment }: { enrollment: ParticipantEnrollment }) {
  const scheduled = enrollment.sessions.filter(session => session.status === 'scheduled').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const support = enrollment.support;
  return <article data-testid={`card-participant-application-${enrollment.applicationId}`}>
    <section className="participant-section"><div className="participant-section-head"><div><h2>Your cohort</h2><p>Application received {dateText(enrollment.submittedAt)}</p></div><span className={`badge ${statusClass(enrollment.applicationStatus)}`} data-testid={`status-application-${enrollment.applicationId}`}><span />{statusWords[enrollment.applicationStatus] || word(enrollment.applicationStatus)}</span></div>
      <div className="participant-program"><div><div className="eyebrow">{word(enrollment.program.format)} COHORT</div><h3>{enrollment.program.name}</h3><p>{enrollment.program.description || 'Your Jusoor founder journey starts here.'}</p>{enrollment.business && <div className="participant-stage"><span>Current venture stage</span><b>{word(enrollment.business.stage)}</b></div>}</div><div className="program-window"><span>PROGRAM WINDOW</span><b>{dateText(enrollment.program.startDate)} — {dateText(enrollment.program.endDate)}</b></div></div>
    </section>
    <section className="participant-section"><div className="participant-section-head"><div><h2>What’s coming up</h2><p>Sessions planned for your cohort.</p></div><span className="badge badge-neutral">{scheduled.length} upcoming</span></div>
      <div className="participant-grid"><div className="participant-card"><h3>Sessions</h3>{enrollment.sessions.length === 0 ? <p className="session-info">No sessions have been shared yet. Check back as your cohort schedule takes shape.</p> : enrollment.sessions.map(session => <div className="participant-entry" key={session.id} data-testid={`session-participant-${session.id}`}><div className="date-block"><b>{new Date(`${session.scheduledDate}T12:00:00`).getDate()}</b><span>{new Date(`${session.scheduledDate}T12:00:00`).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</span></div><div className="participant-entry-copy"><b>{session.title}</b><span>{word(session.type)} · {word(session.deliveryMode)}{session.startTime ? ` · ${session.startTime}` : ''}{session.facilitator ? ` · ${session.facilitator}` : ''}</span>{session.location && <span><MapPin size={11} /> {session.location}</span>}<div className="participant-entry-links">{session.zoomUrl && session.status === 'scheduled' && <a href={session.zoomUrl} target="_blank" rel="noreferrer"><Video size={12} /> Join session</a>}{session.recordingUrl && <a href={session.recordingUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Recording</a>}</div></div><span className={`badge ${statusClass(session.status)}`}>{word(session.status)}</span></div>)}</div>
      <div className="participant-card"><h3>Founder support</h3>{support.length === 0 ? <p className="session-info">No support engagements are linked yet. Your coordinator will update this space as support is arranged.</p> : support.map(item => <div className="participant-entry" key={item.id} data-testid={`support-participant-${item.id}`}><div className="calendar-icon"><Handshake size={16} /></div><div className="participant-entry-copy"><b>{item.topic}</b><span>{word(item.type)} with {item.provider}{item.scheduledDate ? ` · ${dateText(item.scheduledDate)}` : ''}</span></div><span className={`badge ${statusClass(item.status)}`}>{word(item.status)}</span></div>)}</div></div>
    </section>
  </article>;
}
