import { useState } from 'react';
import {
  ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ClipboardCheck,
  FileText, Handshake, LockKeyhole, MessageCircle, Presentation, Shield, UserRound,
  Users, X,
} from 'lucide-react';
import { currentLanguage, t, useAppLanguage } from './language';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';

type RoleKey = 'coordinator' | 'staff' | 'participant' | 'trainer' | 'mentor' | 'judge';
type Access = 'full' | 'limited' | 'none';
type MatrixRow = { area: string; detail: string; icon: typeof Shield; access: Record<RoleKey, Access> };
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const translatePreviewCopy = (copy: string) => {
  if (copy === 'Cedar & Clay Foods' || copy === 'Venture Launch · Spring') return copy;
  if (copy === 'Assigned session · Venture Launch') return `${t('Assigned session')} · Venture Launch`;
  return t(copy);
};

const roles: { id: RoleKey; title: string; kind: string; summary: string }[] = [
  { id: 'coordinator', title: 'Admin', kind: 'Platform administrator', summary: 'Stewards access and the full program operation.' },
  { id: 'staff', title: 'Program Staff', kind: 'Program operations', summary: 'Moves cohorts and ventures through program delivery.' },
  { id: 'participant', title: 'Participant', kind: 'Founder workspace', summary: 'Follows their own application and program journey.' },
  { id: 'trainer', title: 'Trainer', kind: 'Cohort delivery', summary: 'Supports assigned sessions, learning and questions.' },
  { id: 'mentor', title: 'Mentor', kind: 'Founder support', summary: 'Works only within assigned support engagements.' },
  { id: 'judge', title: 'Judge', kind: 'Pitch evaluation', summary: 'Scores only assigned pitch and demo-day ventures.' },
];

const matrix: MatrixRow[] = [
  { area: 'Application decisions', detail: 'Review and decide applications', icon: FileText, access: { coordinator: 'full', staff: 'none', participant: 'limited', trainer: 'none', mentor: 'none', judge: 'none' } },
  { area: 'Team roles', detail: 'Manage team roles and access', icon: Users, access: { coordinator: 'full', staff: 'none', participant: 'none', trainer: 'none', mentor: 'none', judge: 'none' } },
  { area: 'Programs & businesses', detail: 'Operate cohorts and venture records', icon: BriefcaseBusiness, access: { coordinator: 'full', staff: 'full', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Sessions & recordings', detail: 'Operate sessions; access assigned learning', icon: CalendarDays, access: { coordinator: 'full', staff: 'full', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Course materials', detail: 'Released materials follow each resource’s role allowlist', icon: BookOpen, access: { coordinator: 'full', staff: 'none', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Course quizzes', detail: 'Admins author and review all; trainers review assigned, released attempts; participants take published quizzes in accepted, released modules', icon: ClipboardCheck, access: { coordinator: 'full', staff: 'none', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Module release schedule', detail: 'Program staff set dates; admins manage module content', icon: CalendarDays, access: { coordinator: 'full', staff: 'limited', participant: 'none', trainer: 'none', mentor: 'none', judge: 'none' } },
  { area: 'Support engagements', detail: 'Operate support; work assigned engagements', icon: Handshake, access: { coordinator: 'full', staff: 'full', participant: 'limited', trainer: 'none', mentor: 'limited', judge: 'none' } },
  { area: 'Pitch evaluations', detail: 'Record event results and judge feedback', icon: Presentation, access: { coordinator: 'full', staff: 'full', participant: 'none', trainer: 'none', mentor: 'none', judge: 'limited' } },
  { area: 'Financial grant tracking', detail: 'Record award receipts and corrections', icon: Presentation, access: { coordinator: 'full', staff: 'none', participant: 'none', trainer: 'none', mentor: 'none', judge: 'none' } },
  { area: 'Assignments & responses', detail: 'Create text assignments, submit work and review answers', icon: BookOpen, access: { coordinator: 'none', staff: 'none', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Questions & replies', detail: 'Ask questions, reply within assigned cohorts', icon: MessageCircle, access: { coordinator: 'none', staff: 'none', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Course discussions', detail: 'Start module topics and reply within assigned cohorts', icon: MessageCircle, access: { coordinator: 'full', staff: 'none', participant: 'limited', trainer: 'limited', mentor: 'none', judge: 'none' } },
  { area: 'Role assignment', detail: 'Assign trainers, mentors and judges', icon: UserRound, access: { coordinator: 'full', staff: 'none', participant: 'none', trainer: 'none', mentor: 'none', judge: 'none' } },
];

const previewData: Record<RoleKey, { headline: string; note: string; items: { label: string; title: string; meta: string; tag: string }[]; actions: string[] }> = {
  coordinator: {
    headline: 'Program operations at a glance',
    note: 'Illustrative admin workspace',
    items: [
      { label: 'APPLICATIONS', title: 'New applications to review', meta: 'Decision queue · illustrative', tag: 'Review' },
      { label: 'COHORTS', title: 'Venture Launch · Spring', meta: 'Program setup and delivery', tag: 'Active' },
      { label: 'ACCESS', title: 'Team roles and assignments', meta: 'Staff, trainers, mentors, judges', tag: 'Manage' },
    ],
    actions: ['Review applications', 'Manage team roles', 'Assign program team'],
  },
  staff: {
    headline: 'Program delivery overview',
    note: 'Illustrative Program Staff workspace',
    items: [
      { label: 'PROGRAM', title: 'Venture Launch · Spring', meta: 'Cohort operations', tag: 'Active' },
      { label: 'SESSIONS', title: 'Founder finance clinic', meta: 'Session planning', tag: 'Upcoming' },
      { label: 'PITCHES & GRANTS', title: 'Demo day preparation', meta: 'Venture and grant operations', tag: 'In progress' },
    ],
    actions: ['Manage programs', 'Coordinate support', 'Prepare pitch day'],
  },
  participant: {
    headline: 'Your founder journey',
    note: 'Illustrative participant workspace',
    items: [
      { label: 'APPLICATION', title: 'Your application', meta: 'Your own application and progress', tag: 'In review' },
      { label: 'NEXT SESSION', title: 'Customer discovery lab', meta: 'Session and recording access', tag: 'Upcoming' },
      { label: 'ASSIGNMENT', title: 'Map your first ten customers', meta: 'Your submission and trainer reply', tag: 'Due soon' },
    ],
    actions: ['View your progress', 'Open your assignments', 'Ask a question'],
  },
  trainer: {
    headline: 'Assigned cohort work',
    note: 'Illustrative trainer workspace',
    items: [
      { label: 'ASSIGNED SESSION', title: 'Customer discovery lab', meta: 'Assigned session · Venture Launch', tag: 'Upcoming' },
      { label: 'TEXT ASSIGNMENT', title: 'Interview reflection', meta: 'Create assignment for cohort', tag: 'Draft' },
      { label: 'PARTICIPANT ANSWER', title: 'A founder response for review', meta: 'Score, review and reply to questions', tag: 'To review' },
    ],
    actions: ['Create text assignment', 'Review responses', 'Reply to a question'],
  },
  mentor: {
    headline: 'Assigned support engagements',
    note: 'Illustrative mentor workspace',
    items: [
      { label: 'ASSIGNED ENGAGEMENT', title: 'Customer discovery planning', meta: 'Illustrative founder · schedule and status', tag: 'Scheduled' },
      { label: 'WORKING NOTES', title: 'Agree next customer interviews', meta: 'Notes for this engagement only', tag: 'In progress' },
    ],
    actions: ['Update schedule', 'Update engagement status', 'Save working notes'],
  },
  judge: {
    headline: 'Assigned pitch ventures',
    note: 'Illustrative judge workspace',
    items: [
      { label: 'ASSIGNED PITCH', title: 'Cedar & Clay Foods', meta: 'Illustrative venture · Demo day', tag: 'Assigned' },
      { label: 'OWN SCORECARD', title: 'Your evaluation', meta: 'Submit or update your scorecard', tag: 'Not submitted' },
    ],
    actions: ['Score assigned venture', 'Update your scorecard'],
  },
};

const actualWorkspaceHeadings: Record<RoleKey, { kicker: string; title: string; description: string }> = {
  coordinator: {
    kicker: 'OPERATIONS / LIVE VIEW',
    title: 'Good work, moving.',
    description: 'A clear view of the founders, milestones and next moments in your program.',
  },
  staff: {
    kicker: 'OPERATIONS / LIVE VIEW',
    title: 'Good work, moving.',
    description: 'A clear view of the founders, milestones and next moments in your program.',
  },
  participant: {
    kicker: 'YOUR PROGRAM JOURNEY / PRIVATE VIEW',
    title: 'Welcome,',
    description: 'Your application status, upcoming sessions and support in one place.',
  },
  trainer: {
    kicker: 'COHORT DELIVERY / TRAINER DESK',
    title: 'The work, in motion.',
    description: 'Your sessions, participant answers and open questions — together.',
  },
  mentor: {
    kicker: 'FOUNDER ENABLEMENT / MENTOR DESK',
    title: 'Support, with context.',
    description: 'Your assigned engagements and the next useful step for each founder.',
  },
  judge: {
    kicker: 'PITCH & DEMO DAY / JUDGE DESK',
    title: 'A fair read, clearly scored.',
    description: 'Review the ventures assigned to you and submit an individual scorecard for each.',
  },
};
const previewUserName = 'Amina Saeed';
const previewUserInitials = previewUserName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const previewSessionDate = new Date('2026-10-18T12:00:00');

function PreviewBrand({ participant = false }: { participant?: boolean }) {
  return <div className={participant ? 'intake-brand' : 'brand'} aria-label={t('Program Hub')}>
    <span className="brand-mark" aria-hidden="true">J</span>
    <span><b>{t('Program Hub')}</b><small>{t('PROGRAM HUB')}</small></span>
  </div>;
}

function PreviewActions({ role, actions }: { role: RoleKey; actions: string[] }) {
  return <div className="preview-actions" aria-label={t('Available actions')}>
    {actions.map(action => <button type="button" disabled key={action} className="button button-quiet preview-action-button" data-testid={`preview-action-${role}-${slug(action)}`}>{t(action)}<ArrowRight size={12} /></button>)}
  </div>;
}

function PreviewNote() {
  return <div className="preview-bottom-note"><LockKeyhole size={13} /><span>{t('Preview only — illustrative data; actions disabled; no role access is granted.')}</span></div>;
}

function OperationsWorkspacePreview({ role, preview }: { role: RoleKey; preview: typeof previewData[RoleKey] }) {
  const headings = actualWorkspaceHeadings[role];
  const navigation = role === 'coordinator'
    ? ['Overview', 'Businesses', 'Programs', 'Sessions', 'Analytics', 'Team']
    : ['Overview', 'Businesses', 'Programs', 'Sessions', 'Support'];
  return <div className="preview-operations-layout">
    <aside className="preview-operations-sidebar" aria-label={t('Main navigation')}>
      <PreviewBrand />
      <div className="preview-operations-tag"><span />{t('PROGRAM OPERATIONS')}</div>
      <nav className="preview-operations-nav">{navigation.map((label, index) => <div className={`preview-operations-nav-item ${index === 0 ? 'active' : ''}`} key={label}>
        {index === 0 ? <BriefcaseBusiness size={13} /> : index === 1 ? <Users size={13} /> : index === 2 ? <BookOpen size={13} /> : index === 3 ? <CalendarDays size={13} /> : <MessageCircle size={13} />}
        <span>{t(label)}</span>
      </div>)}</nav>
        <div className="preview-operations-profile"><span>{previewUserInitials}</span><div><b>{t(role === 'coordinator' ? 'Admin' : 'Program Staff')}</b><small>{t('Program team')}</small></div></div>
    </aside>
    <div className="preview-operations-main">
      <div className="preview-operations-topbar"><div><span>{t('PROGRAM HUB')}</span><i>/</i><b>{t('Overview')}</b></div><div><CalendarDays size={12} />{t('Today')}<span className="preview-operations-role">{t(role === 'coordinator' ? 'ADMIN' : 'STAFF')}</span></div></div>
      <nav className="preview-operations-mobile-nav" aria-label={t('Main navigation')}>{navigation.slice(0, 4).map(label => <span key={label}>{t(label)}</span>)}</nav>
      <main className="preview-operations-content">
        <header className="page-heading preview-workspace-heading" data-testid={`preview-heading-${role}`}>
          <div><div className="eyebrow">{t(headings.kicker)}</div><h1 className="app-title">{t(headings.title)}</h1><p>{t(headings.description)}</p></div>
        </header>
        <section className="preview-operations-metrics" aria-label={t('Program overview')}>
          {preview.items.map((item, index) => <article className="metric-card" key={item.label}>
            <div className="metric-top"><span>{t(item.label)}</span><span className={`metric-icon metric-icon-${index}`}><BriefcaseBusiness size={13} /></span></div>
            <b className="metric-value">{index === 0 ? '24' : index === 1 ? '8' : '3'}</b>
            <span className="metric-bottom">{t(item.tag)}</span>
          </article>)}
        </section>
        <section className="panel preview-operations-list">
          <div className="preview-operations-list-head"><div><div className="eyebrow">{t('PROGRAM SNAPSHOT')}</div><h2>{t(preview.headline)}</h2></div><span>{t('ILLUSTRATIVE')}</span></div>
          {preview.items.map(item => <div className="preview-operations-row" key={item.title}><span className="preview-operations-row-icon"><BriefcaseBusiness size={13} /></span><div><b>{translatePreviewCopy(item.title)}</b><small>{translatePreviewCopy(item.meta)}</small></div><span>{t(item.tag)}</span></div>)}
          <PreviewActions role={role} actions={preview.actions} />
        </section>
      </main>
    </div>
  </div>;
}

function SpecialistWorkspacePreview({ role, preview }: { role: RoleKey; preview: typeof previewData[RoleKey] }) {
  const headings = actualWorkspaceHeadings[role];
  const previewLanguage = currentLanguage() === 'ar' ? 'EN' : 'AR';
  const sectionTitle = role === 'trainer' ? 'Assigned sessions' : role === 'mentor' ? 'Your support engagements' : 'Founder presentations';
  const sectionKicker = role === 'trainer' ? 'TEACHING CALENDAR' : role === 'mentor' ? 'YOUR ENGAGEMENTS' : 'YOUR SCORECARDS';
  const first = preview.items[0];
  return <div className="preview-specialist-shell">
    <header className="preview-specialist-topbar">
      <PreviewBrand />
      <div className="preview-specialist-actions">
        <button type="button" className="button button-quiet" disabled><Users size={12} />{t('All pages')}</button>
        <span className="role-chip">{t(roles.find(item => item.id === role)!.title)}</span>
        <span className="preview-specialist-user"><i>{previewUserInitials}</i><b>{previewUserName}</b></span>
        <span className="preview-language">{previewLanguage}</span>
        <button type="button" className="button button-quiet preview-signout" disabled>{t('Sign out')}</button>
      </div>
    </header>
    <main className="preview-specialist-main">
      <header className="role-heading preview-workspace-heading" data-testid={`preview-heading-${role}`}>
        <div><div className="eyebrow">{t(headings.kicker)}</div><h1 className="app-title">{t(headings.title)}</h1><p>{t(headings.description)}</p></div>
        <span className="role-count">{preview.items.length} {t(role === 'trainer' ? 'assigned sessions' : role === 'mentor' ? 'engagements' : 'assigned ventures')}</span>
      </header>
      <section className="role-feature-grid preview-specialist-feature">
        <article className="role-feature"><div className="eyebrow">{t(role === 'trainer' ? 'UP NEXT' : role === 'mentor' ? 'NEXT STEP' : 'ASSIGNED PITCH')}</div><h2>{translatePreviewCopy(first.title)}</h2><p>{translatePreviewCopy(first.meta)}</p><button type="button" disabled className="button button-primary preview-specialist-feature-action">{t(preview.actions[0])}<ArrowRight size={12} /></button></article>
        <article className="role-note"><Check size={16} /><div><b>{t(role === 'trainer' ? 'Participant responses' : role === 'mentor' ? 'Assigned support' : 'Your scorecards')}</b><span>{t(role === 'trainer' ? 'Review work and respond within your assigned sessions.' : role === 'mentor' ? 'Work only with founders assigned to you.' : 'Only assigned ventures appear in your judging workspace.')}</span></div></article>
      </section>
      <section className="role-section">
        <div className="role-section-title"><div><div className="eyebrow">{t(sectionKicker)}</div><h2>{t(sectionTitle)}</h2></div></div>
        <div className="role-list">{preview.items.slice(1).concat(preview.items.slice(0, 1)).map(item => <article className="role-row" key={item.title}>
          <span className="role-date"><CalendarDays size={15} /></span>
          <div className="role-row-copy"><b>{translatePreviewCopy(item.title)}</b><span>{translatePreviewCopy(item.meta)}</span></div>
          <span className="badge badge-neutral"><span />{t(item.tag)}</span>
        </article>)}</div>
        <PreviewActions role={role} actions={preview.actions.slice(1)} />
      </section>
    </main>
  </div>;
}

function ParticipantWorkspacePreview({ role, preview }: { role: RoleKey; preview: typeof previewData[RoleKey] }) {
  const first = preview.items[0];
  const previewLanguage = currentLanguage() === 'ar' ? 'EN' : 'AR';
  return <div className="preview-participant-shell">
    <header className="intake-top preview-participant-top">
      <PreviewBrand participant />
      <div className="intake-header-actions"><span className="preview-language">{previewLanguage}</span><span className="text-link">{t('Program hub')}<ArrowRight size={12} /></span></div>
    </header>
    <main className="participant-wrap preview-participant-main">
      <header className="participant-header preview-workspace-heading" data-testid={`preview-heading-${role}`}>
        <div><div className="eyebrow">{t(actualWorkspaceHeadings.participant.kicker)}</div><h1>{t(actualWorkspaceHeadings.participant.title)} {previewUserName.split(' ')[0]}.</h1><p>{t(actualWorkspaceHeadings.participant.description)}</p></div>
      </header>
      <section className="participant-program">
        <div><div className="eyebrow">{t('YOUR PROGRAM')}</div><h3>{translatePreviewCopy(first.title)}</h3><p>{translatePreviewCopy(first.meta)}</p></div>
        <div className="program-window"><span>{t('APPLICATION STATUS')}</span><b>{t(first.tag)}</b></div>
      </section>
      <section className="participant-grid preview-participant-grid">
        <article className="participant-card"><h3>{t('Upcoming session')}</h3><div className="participant-entry"><span className="date-block"><b>{previewSessionDate.getDate()}</b><span>{previewSessionDate.toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: 'short' }).toUpperCase()}</span></span><div className="participant-entry-copy"><b>{translatePreviewCopy(preview.items[1].title)}</b><span>{translatePreviewCopy(preview.items[1].meta)}</span><span className="participant-entry-links">{t('Join session')}</span></div></div></article>
        <article className="participant-card"><h3>{t('Your next step')}</h3><div className="participant-stage"><span>{translatePreviewCopy(preview.items[2]?.title ?? preview.items[1].title)}</span><b>{t(preview.items[2]?.tag ?? preview.items[1].tag)}</b></div><div className="preview-participant-actions"><PreviewActions role={role} actions={preview.actions} /></div></article>
      </section>
    </main>
  </div>;
}

function AccessMark({ value }: { value: Access }) {
  if (value === 'full') return <span className="access-mark access-yes"><Check size={13} /><span>{t('Allowed')}</span></span>;
  if (value === 'limited') return <span className="access-mark access-limited"><span className="access-dot" /><span>{t('Scoped')}</span></span>;
  return <span className="access-mark access-no"><X size={13} /><span>{t('No access')}</span></span>;
}

export function RoleAccessPage() {
  useAppLanguage();
  const [selected, setSelected] = useState<RoleKey>('coordinator');
  const role = roles.find(item => item.id === selected)!;
  const preview = previewData[selected];
  return <div className="access-page" data-testid="page-role-access">
    <header className="page-heading access-heading">
      <div><div className="eyebrow">{t('GOVERNANCE / ROLE ACCESS')}</div><h1 className="app-title">{t('Clear roles. Shared purpose.')}</h1><p>{t('See what each role can access, and preview the workspace designed for that role.')}</p></div>
      <div className="access-heading-stamp"><Shield size={17} /><span>{t('ADMIN VIEW')}</span></div>
    </header>

    <div className="access-notice" role="note">
      <div className="access-notice-icon"><LockKeyhole size={17} /></div>
      <p><b>{t('Preview only — illustrative data; actions disabled; no role access is granted.')}</b><span>{t('This page is a static guide. It does not impersonate users, change access, or show live participant data.')}</span></p>
    </div>

    <section className="panel access-matrix-section" aria-labelledby="matrix-title">
      <div className="access-section-head">
        <div><div className="eyebrow">{t('ACCESS MATRIX')}</div><h2 id="matrix-title" className="app-title">{t('Who can do what')}</h2><p>{t('Scoped access is limited to the person’s own work or assigned activity.')}</p></div>
        <div className="matrix-legend"><span><i className="legend-full" />{t('Allowed')}</span><span><i className="legend-limited" />{t('Scoped')}</span><span><i className="legend-none" />{t('No access')}</span></div>
      </div>
      <div className="access-table-wrap" role="region" tabIndex={0} aria-label={t('Scrollable results table')}>
        <table className="access-table">
          <thead><tr><th scope="col">{t('WORKSPACE AREA')}</th>{roles.map(item => <th scope="col" key={item.id}>{t(item.title)}</th>)}</tr></thead>
          <tbody>{matrix.map(row => {
            const Icon = row.icon;
            return <tr key={row.area} data-testid={`row-access-${slug(row.area)}`}>
              <th scope="row"><span className="matrix-area"><i><Icon size={15} /></i><span><b>{t(row.area)}</b><small>{t(row.detail)}</small></span></span></th>
              {roles.map(item => <td key={item.id} data-testid={`access-cell-${item.id}-${slug(row.area)}`}><AccessMark value={row.access[item.id]} /></td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="matrix-foot"><span>{t('SCOPED ACCESS FOLLOWS ASSIGNMENT OR PERSONAL OWNERSHIP')}</span><span>{t('PROGRAM HUB')} <i /></span></div>
    </section>

    <section className="access-preview-section" aria-labelledby="preview-title">
      <div className="access-section-head preview-head">
        <div><div className="eyebrow">{t('WORKSPACE PREVIEW')}</div><h2 id="preview-title" className="app-title">{t('A view for every role')}</h2><p>{t('Select a role to see its workspace shape using fictional examples.')}</p></div>
        <span className="preview-count">{t('06 ROLES')}</span>
      </div>
      <Tabs value={selected} onValueChange={value => setSelected(value as RoleKey)}>
      <TabsList className="role-selector h-auto bg-transparent p-0 text-foreground" aria-label={t('Select workspace role')}>
        {roles.map((item, index) => <TabsTrigger key={item.id} type="button" value={item.id} className={`role-select ${selected === item.id ? 'selected' : ''}`} data-testid={`button-preview-${item.id}`}>
          <span className="role-select-index">0{index + 1}</span><span className="role-select-title">{t(item.title)}</span><span className="role-select-kind">{t(item.kind)}</span>
        </TabsTrigger>)}
      </TabsList>
      <TabsContent value={selected} className="role-preview-tab mt-0 outline-none" aria-label={`${t(role.title)} ${t('workspace preview')}`} data-testid="panel-role-preview">
      <article className={`role-preview role-preview-${selected}`}>
        {selected === 'participant'
          ? <ParticipantWorkspacePreview role={selected} preview={preview} />
          : selected === 'trainer' || selected === 'mentor' || selected === 'judge'
            ? <SpecialistWorkspacePreview role={selected} preview={preview} />
            : <OperationsWorkspacePreview role={selected} preview={preview} />}
        <PreviewNote />
      </article>
      </TabsContent>
      </Tabs>
      <div className="access-preview-caption"><span><b>{t(role.title)}</b> · {t(role.summary)}</span><span><Shield size={14} /> {t('Your actual workspace depends on your approved role.')}</span></div>
    </section>
  </div>;
}
