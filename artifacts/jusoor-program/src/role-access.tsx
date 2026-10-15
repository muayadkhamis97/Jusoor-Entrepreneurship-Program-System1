import { useState } from 'react';
import {
  ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ClipboardCheck,
  FileText, Handshake, LockKeyhole, MessageCircle, Presentation, Shield,
  UserRound, Users, Video, X,
} from 'lucide-react';
import { t, useAppLanguage } from './language';
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
      <div><div className="eyebrow">{t('GOVERNANCE / ROLE ACCESS')}</div><h1 className="app-title">{t('Clear roles. Shared purpose.')}</h1><p>{t('See what each Jusoor role can reach, and preview the workspace each role is designed for.')}</p></div>
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
      <div className="matrix-foot"><span>{t('SCOPED ACCESS FOLLOWS ASSIGNMENT OR PERSONAL OWNERSHIP')}</span><span>{t('JUSOOR PROGRAM HUB')} <i /></span></div>
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
      <article className="role-preview">
        <div className="preview-window-top"><div className="preview-brand"><span className="brand-mark">J</span><span><b>Jusoor</b><small>{t('PROGRAM HUB')}</small></span></div><div className="preview-window-context"><span className="preview-window-dot" /> {t(role.title).toUpperCase()} {t('WORKSPACE')}</div><span className="preview-lock"><LockKeyhole size={13} /> {t('VISUAL PREVIEW')}</span></div>
        <div className="preview-body">
          <aside className="preview-rail"><span className="preview-rail-label">{t('WORKSPACE')}</span><div className="preview-nav-item active"><BriefcaseBusiness size={14} />{t(selected === 'participant' ? 'My journey' : selected === 'judge' ? 'Assigned pitches' : selected === 'mentor' ? 'My engagements' : selected === 'trainer' ? 'Cohort desk' : 'Overview')}</div><div className="preview-nav-item"><CalendarDays size={14} />{t(selected === 'participant' ? 'Sessions' : selected === 'judge' ? 'Scorecards' : selected === 'mentor' ? 'Schedule' : 'Program work')}</div><div className="preview-nav-item"><MessageCircle size={14} />{t(selected === 'trainer' || selected === 'participant' ? 'Questions' : 'Support')}</div><div className="preview-rail-rule" /><div className="preview-role-identity"><span>{t(role.title).split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase()}</span><div><b>{t(role.title)}</b><small>{t(role.kind)}</small></div></div></aside>
          <div className="preview-workspace-content">
            <div className="preview-workspace-heading"><div><div className="eyebrow">{t(preview.note).toUpperCase()}</div><h3>{t(preview.headline)}</h3></div><span className="illustrative-stamp">{t('ILLUSTRATIVE')}</span></div>
            <div className="preview-item-list">{preview.items.map((item, index) => <div className="preview-item" key={item.title} data-testid={`preview-item-${selected}-${index}`}><span className={`preview-item-icon preview-tone-${index}`} aria-hidden="true">{selected === 'participant' && index === 1 ? <Video size={15} /> : selected === 'trainer' && index === 2 ? <ClipboardCheck size={15} /> : selected === 'judge' && index === 1 ? <Presentation size={15} /> : selected === 'mentor' && index === 1 ? <FileText size={15} /> : <BriefcaseBusiness size={15} />}</span><div className="preview-item-copy"><small>{t(item.label)}</small><b>{translatePreviewCopy(item.title)}</b><span>{translatePreviewCopy(item.meta)}</span></div><span className="preview-item-tag">{t(item.tag)}</span></div>)}</div>
            <div className="preview-actions"><span>{t('AVAILABLE IN THIS ROLE')}</span><div>{preview.actions.map(action => <button type="button" disabled key={action} className="preview-action-button" data-testid={`preview-action-${selected}-${slug(action)}`}>{t(action)}<ArrowRight size={12} /></button>)}</div></div>
          </div>
        </div>
        <div className="preview-bottom-note"><LockKeyhole size={13} /><span>{t('Preview only — illustrative data; actions disabled; no role access is granted.')}</span></div>
      </article>
      </TabsContent>
      </Tabs>
      <div className="access-preview-caption"><span><b>{t(role.title)}</b> · {t(role.summary)}</span><span><Shield size={14} /> {t('Your actual workspace depends on your approved role.')}</span></div>
    </section>
  </div>;
}
