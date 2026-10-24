import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CircleAlert, ClipboardCopy, Eye, Lock, Plus, RefreshCw, Trash2, Trophy } from 'lucide-react';
import {
  getGetJudgingFormQueryKey, getListBusinessesQueryKey, getListJudgingFormLinkHistoryQueryKey, getListJudgingFormResponsesQueryKey, getListJudgingFormsQueryKey,
  useCreateJudgingForm, useGetJudgingForm, useListBusinesses, useListJudgingFormLinkHistory, useListJudgingFormResponses, useListJudgingForms, useListPrograms,
  useRotateJudgingFormShareLink, useUpdateJudgingForm, useUpdateJudgingFormStatus,
} from '@workspace/api-client-react';
import type { JudgingFormDetail, JudgingFormSummary } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Dialog } from '@workspace/program-editorial/components/ui/dialog';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { Rule } from '@workspace/program-editorial/components/ui/rule';
import {
  buildShareUrl, draftFromDetail, emptyFormDraft, errorStatus, MAX_JUDGING_ITEMS, newClientId, staffErrorMessage, toFormInput, validateFormDraft,
  type FormDraft,
} from './judging-form-helpers';
import { currentLanguage, t, useAppLanguage } from './language';
import './judging-forms.css';

type Selection = number | 'new' | null;

const dateTime = (value: string) => new Intl.DateTimeFormat(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const statusLabel: Record<JudgingFormSummary['status'], string> = { draft: 'Draft', open: 'Accepting responses', closed: 'Closed' };
const statusTone: Record<JudgingFormSummary['status'], string> = { draft: 'warm', open: 'good', closed: 'neutral' };

function StatusBadge({ status }: { status: JudgingFormSummary['status'] }) {
  return <span className={`badge badge-${statusTone[status]}`} data-testid={`status-${status}`}><span />{t(statusLabel[status])}</span>;
}

function Skeleton() {
  return <div className="loading-panel" aria-label={t('Loading judging forms')}><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="empty-panel error-panel" role="alert"><div className="empty-icon"><CircleAlert size={22} /></div><h3>{t(message)}</h3><button className="button button-outline" onClick={retry}><RefreshCw size={15} /> {t('Try again')}</button></div>;
}

export function JudgingFormsPage() {
  useAppLanguage();
  const list = useListJudgingForms();
  const [selected, setSelected] = useState<Selection>(null);
  const forms = list.data ?? [];

  return <div className="jf-page">
    <div className="page-heading">
      <div>
        <div className="eyebrow">{t('PITCH DAY / GUEST JUDGING')}</div>
        <h1 className="app-title">{t('Judging forms')}</h1>
        <p>{t('Collect consistent assessments from guest judges with one shared link. Judges do not need an account.')}</p>
      </div>
      <div className="jf-heading-actions">
        <Link href="/pitches" className="text-link"><Trophy size={14} /> {t('Pitch & grants')}</Link>
        <button className="button button-primary" onClick={() => setSelected('new')} data-testid="button-new-judging-form"><Plus size={16} /> {t('New judging form')}</button>
      </div>
    </div>
    <div className="jf-layout">
      <aside className="panel jf-list" aria-label={t('Judging forms')}>
        <Typography variant="label" tone="accent">{t('YOUR FORMS')}</Typography>
        {list.isLoading ? <Skeleton /> : list.isError ? <LoadError message="Judging forms could not load." retry={() => void list.refetch()} />
          : forms.length === 0 ? <div className="jf-empty-small"><p>{t('No judging forms yet.')}</p><button className="button button-outline" onClick={() => setSelected('new')}><Plus size={15} /> {t('Create the first form')}</button></div>
          : <ul className="jf-list-items">{forms.map(form => <li key={form.id}>
            <button type="button" className={`jf-list-item ${selected === form.id ? 'active' : ''}`} aria-current={selected === form.id ? 'true' : undefined} onClick={() => setSelected(form.id)} data-testid={`judging-form-${form.id}`}>
              <span className="jf-list-title">{form.title}</span>
              <span className="jf-list-meta">{form.programName}</span>
              <span className="jf-list-row"><StatusBadge status={form.status} /><span className="mono">{form.responseCount} {t(form.responseCount === 1 ? 'response' : 'responses')}</span></span>
            </button>
          </li>)}</ul>}
      </aside>
      <section className="jf-main">
        {selected === null ? <div className="empty-panel"><div className="empty-icon"><Eye size={21} /></div><h3>{t('Choose a form to manage')}</h3><p>{t('Select a judging form to edit drafts, share its link, or review private responses.')}</p></div>
          : selected === 'new' ? <FormEditor key="new" initial={emptyFormDraft()} onSaved={id => setSelected(id)} onCancel={() => setSelected(null)} />
          : <FormWorkspace key={selected} formId={selected} />}
      </section>
    </div>
  </div>;
}

function FormWorkspace({ formId }: { formId: number }) {
  const detail = useGetJudgingForm(formId, { query: {
    enabled: formId > 0,
    queryKey: getGetJudgingFormQueryKey(formId),
    refetchInterval: query => query.state.data?.status === 'open' ? 30_000 : false,
  } });
  if (detail.isLoading) return <Skeleton />;
  if (detail.isError || !detail.data) return <LoadError message={staffErrorMessage(errorStatus(detail.error), 'This form could not load.')} retry={() => void detail.refetch()} />;
  const form = detail.data;
  const frozen = form.publishedAt !== null;
  return <div className="jf-stack">
    <div className="panel jf-form-head">
      <div>
        <Typography variant="label" tone="accent">{form.programName}</Typography>
        <Typography as="h2" variant="heading">{form.title}</Typography>
        <div className="jf-list-row"><StatusBadge status={form.status} /><span className="mono">{form.responseCount} {t(form.responseCount === 1 ? 'response' : 'responses')}</span>{form.publishedAt && <span className="field-hint">{t('First opened')} {dateTime(form.publishedAt)}</span>}</div>
      </div>
      {frozen && <StatusControls form={form} />}
    </div>
    {frozen ? <FrozenConfig form={form} /> : <FormEditor key={form.id} formId={form.id} initial={draftFromDetail(form)} />}
    {frozen && <CoveragePanel form={form} />}
    <SharePanel form={form} />
    {frozen && <ResponsesPanel form={form} />}
  </div>;
}

function CoveragePanel({ form }: { form: JudgingFormDetail }) {
  return <div className="panel jf-section" data-testid="judging-assessment-coverage">
    <div className="jf-section-head"><Typography as="h3" variant="label" tone="accent">{t('ASSESSMENT COVERAGE')}</Typography></div>
    <p className="field-hint">{t('Submitted assessments grouped by selected business.')}</p>
    <ul className="jf-coverage-list">
      {form.businesses.map(business => <li key={business.id} className="jf-coverage-item">
        <span className="jf-coverage-name">{business.name}</span>
        <span className={`badge ${business.assessmentCount === 0 ? 'badge-warm' : 'badge-good'}`} data-testid={`judging-business-coverage-${business.id}`}>
          {business.assessmentCount === 0
            ? t('No assessments yet.')
            : `${business.assessmentCount} ${t(business.assessmentCount === 1 ? 'assessment' : 'assessments')}`}
        </span>
      </li>)}
    </ul>
  </div>;
}

function StatusControls({ form }: { form: JudgingFormDetail }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateJudgingFormStatus();
  const [error, setError] = useState('');
  const next = form.status === 'open' ? 'closed' : 'open';
  const run = async () => {
    setError('');
    try {
      await mutation.mutateAsync({ formId: form.id, data: { status: next } });
      void queryClient.invalidateQueries({ queryKey: getGetJudgingFormQueryKey(form.id) });
      void queryClient.invalidateQueries({ queryKey: getListJudgingFormsQueryKey() });
    } catch (caught) { setError(staffErrorMessage(errorStatus(caught), 'The form status could not be changed. Try again.')); }
  };
  return <div className="jf-status-controls">
    <Button variant={next === 'closed' ? 'pill' : 'primary'} onClick={() => void run()} disabled={mutation.isPending} data-testid="button-toggle-judging-status">
      {mutation.isPending ? t('Updating…') : next === 'closed' ? t('Close to new responses') : t('Reopen form')}
    </Button>
    <small className="field-hint">{t(next === 'closed' ? 'Closing keeps every response. You can reopen later.' : 'Reopening accepts responses again with the same locked questions.')}</small>
    {error && <div className="form-error" role="alert"><CircleAlert size={16} />{t(error)}</div>}
  </div>;
}

function FrozenConfig({ form }: { form: JudgingFormDetail }) {
  return <div className="panel jf-section">
    <div className="jf-section-head"><Lock size={16} aria-hidden="true" /><Typography as="h3" variant="label">{t('LOCKED CONFIGURATION')}</Typography></div>
    <p className="field-hint">{t('This form has been opened to judges, so its questions, scoring and businesses can no longer change. This keeps every response comparable.')}</p>
    {form.instructions && <><Typography variant="label">{t('Instructions for judges')}</Typography><p className="jf-prewrap">{form.instructions}</p></>}
    <Rule />
    <Typography variant="label">{t('Businesses')}</Typography>
    <ul className="jf-chips">{form.businesses.map(business => <li key={business.id}>{business.name}</li>)}</ul>
    <Typography variant="label">{t('Always collected')}</Typography>
    <ul className="jf-chips"><li>{t('Judge name')} *</li><li>{t('Judge email')} *</li></ul>
    {form.criteria.length > 0 && <><Typography variant="label">{t('Scoring criteria')}</Typography>
      <ol className="jf-readonly-list">{form.criteria.map(criterion => <li key={criterion.id}><b>{criterion.label}</b> <span className="mono">/ {criterion.maxScore}</span>{criterion.description && <p>{criterion.description}</p>}</li>)}</ol></>}
    {form.questions.length > 0 && <><Typography variant="label">{t('Written questions')}</Typography>
      <ol className="jf-readonly-list">{form.questions.map(question => <li key={question.id}>{question.label} <span className="field-hint">{t(question.required ? 'Required' : 'Optional')}</span></li>)}</ol></>}
  </div>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <small id={id} className="jf-field-error" role="alert">{t(message)}</small> : null;
}

function FormEditor({ initial, formId, onSaved, onCancel }: { initial: FormDraft; formId?: number; onSaved?: (id: number) => void; onCancel?: () => void }) {
  const queryClient = useQueryClient();
  const programs = useListPrograms();
  const createForm = useCreateJudgingForm();
  const updateForm = useUpdateJudgingForm();
  const openForm = useUpdateJudgingFormStatus();
  const [draft, setDraft] = useState<FormDraft>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [showErrors, setShowErrors] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const programId = Number(draft.programId);
  const businessParams = { programId };
  const businesses = useListBusinesses(businessParams, { query: { enabled: programId > 0, queryKey: getListBusinessesQueryKey(businessParams) } });
  const errors = useMemo(() => validateFormDraft(draft), [draft]);
  const visible = showErrors ? errors : {};
  const dirty = JSON.stringify(draft) !== saved;
  const saving = createForm.isPending || updateForm.isPending;
  const programLocked = formId !== undefined;
  const programName = programs.data?.find(program => program.id === programId)?.name;

  const patch = (change: Partial<FormDraft>) => { setDraft(previous => ({ ...previous, ...change })); setMessage(null); };
  const refresh = (id: number) => {
    void queryClient.invalidateQueries({ queryKey: getListJudgingFormsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetJudgingFormQueryKey(id) });
  };

  const save = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length) { setMessage({ kind: 'error', text: 'Fix the highlighted fields before saving.' }); return; }
    const data = toFormInput(draft);
    try {
      const result = formId === undefined ? await createForm.mutateAsync({ data }) : await updateForm.mutateAsync({ formId, data });
      setSaved(JSON.stringify(draft));
      setMessage({ kind: 'ok', text: 'Draft saved.' });
      refresh(result.id);
      if (formId === undefined) onSaved?.(result.id);
    } catch (caught) {
      setMessage({ kind: 'error', text: staffErrorMessage(errorStatus(caught), 'The draft could not be saved. Your changes are still here; try again.') });
    }
  };

  const confirmOpenForm = async () => {
    if (formId === undefined) return;
    try {
      await openForm.mutateAsync({ formId, data: { status: 'open' } });
      setConfirmOpen(false);
      refresh(formId);
    } catch (caught) {
      setConfirmOpen(false);
      setMessage({ kind: 'error', text: staffErrorMessage(errorStatus(caught), 'The form could not be opened. Try again.') });
    }
  };

  const updateCriterion = (id: string, change: Partial<FormDraft['criteria'][number]>) => patch({ criteria: draft.criteria.map(item => item.id === id ? { ...item, ...change } : item) });
  const updateQuestion = (id: string, change: Partial<FormDraft['questions'][number]>) => patch({ questions: draft.questions.map(item => item.id === id ? { ...item, ...change } : item) });
  const toggleBusiness = (id: number, checked: boolean) => patch({ businessIds: checked ? [...draft.businessIds, id] : draft.businessIds.filter(value => value !== id) });
  const businessList = businesses.data ?? [];

  return <form className="panel jf-section jf-editor" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="jf-section-head"><Typography as="h3" variant="label" tone="accent">{t(formId === undefined ? 'NEW DRAFT' : 'DRAFT / EDITABLE')}</Typography></div>
    <small className="field-hint form-required-note" role="note">{t('Fields marked * are required.')}</small>

    <div className="jf-grid">
      <label className="field">
        <span>{t('Program')}<i aria-hidden="true"> *</i></span>
        {programLocked
          ? <input className="form-control" value={programName ?? (programs.isLoading ? t('Loading programs…') : `#${draft.programId}`)} readOnly aria-describedby="jf-program-hint" />
          : <select className="form-control" value={draft.programId} required aria-invalid={!!visible.programId} aria-describedby="jf-program-hint jf-program-error" onChange={event => patch({ programId: event.target.value, businessIds: [] })} data-testid="input-judging-program">
            <option value="">{t('Choose…')}</option>
            {(programs.data ?? []).map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>}
        <small id="jf-program-hint" className="field-hint">{t(programLocked ? 'The program cannot change after the first save.' : 'Only programs assigned to you are listed. This cannot change after the first save.')}</small>
        {programs.isError && <small className="jf-field-error" role="alert">{t('Programs could not load.')}</small>}
        <FieldError id="jf-program-error" message={visible.programId} />
      </label>
      <label className="field">
        <span>{t('Form title')}<i aria-hidden="true"> *</i></span>
        <input className="form-control" value={draft.title} maxLength={200} required aria-invalid={!!visible.title} aria-describedby="jf-title-error" onChange={event => patch({ title: event.target.value })} data-testid="input-judging-title" />
        <FieldError id="jf-title-error" message={visible.title} />
      </label>
      <label className="field field-wide">
        <span>{t('Instructions for judges')}</span>
        <textarea className="form-control resize-y" rows={3} maxLength={5000} value={draft.instructions} aria-describedby="jf-instructions-hint" onChange={event => patch({ instructions: event.target.value })} />
        <small id="jf-instructions-hint" className="field-hint">{t('Shown at the top of the guest form. Optional.')}</small>
      </label>
    </div>

    <Rule />
    <fieldset className="jf-fieldset" aria-describedby="jf-business-hint jf-business-error">
      <legend><Typography as="span" variant="label">{t('Businesses to assess')}<i aria-hidden="true"> *</i></Typography></legend>
      <small id="jf-business-hint" className="field-hint">{t('Judges pick one of these businesses for each assessment. Select up to 100.')}</small>
      {programId <= 0 ? <p className="field-hint">{t('Choose a program to see its businesses.')}</p>
        : businesses.isLoading ? <div className="skeleton skeleton-table" aria-label={t('Loading businesses')} />
        : businesses.isError ? <div className="form-error" role="alert"><CircleAlert size={16} />{t('Business choices could not load.')} <button type="button" className="text-link" onClick={() => void businesses.refetch()}>{t('Try again')}</button></div>
        : businessList.length === 0 ? <p className="field-hint">{t('No businesses have been added to this program yet.')}</p>
        : <div className="jf-checkbox-grid">{businessList.map(business => <label key={business.id} className="jf-check">
          <input type="checkbox" checked={draft.businessIds.includes(business.id)} onChange={event => toggleBusiness(business.id, event.currentTarget.checked)} />
          <span>{business.businessName}</span>
        </label>)}</div>}
      <span className="mono field-hint">{draft.businessIds.length} {t('selected')}</span>
      <FieldError id="jf-business-error" message={visible.businessIds} />
    </fieldset>

    <Rule />
    <div className="jf-fixed">
      <Lock size={15} aria-hidden="true" />
      <div><Typography as="span" variant="label">{t('Always collected')}</Typography><p className="field-hint">{t('Judge name and email are always required and cannot be removed. They are self-reported by the guest and are not verified.')}</p></div>
    </div>

    <Rule />
    <div className="jf-section-head">
      <Typography as="h3" variant="label">{t('Scoring criteria')}</Typography>
      <button type="button" className="button button-outline" disabled={draft.criteria.length >= MAX_JUDGING_ITEMS} onClick={() => patch({ criteria: [...draft.criteria, { id: newClientId(), label: '', description: '', maxScore: '10' }] })} data-testid="button-add-criterion"><Plus size={15} /> {t('Add criterion')}</button>
    </div>
    {draft.criteria.length === 0 && <p className="field-hint">{t('No scoring criteria yet. Judges will only answer written questions.')}</p>}
    {draft.criteria.map((criterion, index) => <div key={criterion.id} className="jf-item" role="group" aria-label={`${t('Criterion')} ${index + 1}`}>
      <span className="jf-item-number mono">{String(index + 1).padStart(2, '0')}</span>
      <div className="jf-grid">
        <label className="field"><span>{t('Criterion label')}<i aria-hidden="true"> *</i></span>
          <input className="form-control" value={criterion.label} maxLength={200} aria-invalid={!!visible[`criterion:${criterion.id}:label`]} aria-describedby={`c-${criterion.id}-label`} onChange={event => updateCriterion(criterion.id, { label: event.target.value })} />
          <FieldError id={`c-${criterion.id}-label`} message={visible[`criterion:${criterion.id}:label`]} /></label>
        <label className="field"><span>{t('Maximum score')}<i aria-hidden="true"> *</i></span>
          <input className="form-control" type="number" inputMode="numeric" min={1} max={100} step={1} value={criterion.maxScore} aria-invalid={!!visible[`criterion:${criterion.id}:maxScore`]} aria-describedby={`c-${criterion.id}-max-hint c-${criterion.id}-max`} onChange={event => updateCriterion(criterion.id, { maxScore: event.target.value })} />
          <small id={`c-${criterion.id}-max-hint`} className="field-hint">{t('Whole number from 1 to 100.')}</small>
          <FieldError id={`c-${criterion.id}-max`} message={visible[`criterion:${criterion.id}:maxScore`]} /></label>
        <label className="field field-wide"><span>{t('Guidance for judges')}</span>
          <textarea className="form-control resize-y" rows={2} maxLength={1000} value={criterion.description} onChange={event => updateCriterion(criterion.id, { description: event.target.value })} />
          <FieldError id={`c-${criterion.id}-desc`} message={visible[`criterion:${criterion.id}:description`]} /></label>
      </div>
      <button type="button" className="icon-button" aria-label={`${t('Remove criterion')} ${index + 1}`} onClick={() => patch({ criteria: draft.criteria.filter(item => item.id !== criterion.id) })}><Trash2 size={16} /></button>
    </div>)}

    <Rule />
    <div className="jf-section-head">
      <Typography as="h3" variant="label">{t('Written questions')}</Typography>
      <button type="button" className="button button-outline" disabled={draft.questions.length >= MAX_JUDGING_ITEMS} onClick={() => patch({ questions: [...draft.questions, { id: newClientId(), label: '', required: false }] })} data-testid="button-add-question"><Plus size={15} /> {t('Add question')}</button>
    </div>
    {draft.questions.length === 0 && <p className="field-hint">{t('No written questions yet.')}</p>}
    {draft.questions.map((question, index) => <div key={question.id} className="jf-item" role="group" aria-label={`${t('Question')} ${index + 1}`}>
      <span className="jf-item-number mono">{String(index + 1).padStart(2, '0')}</span>
      <div className="jf-grid">
        <label className="field field-wide"><span>{t('Question')}<i aria-hidden="true"> *</i></span>
          <input className="form-control" value={question.label} maxLength={500} aria-invalid={!!visible[`question:${question.id}:label`]} aria-describedby={`q-${question.id}-label`} onChange={event => updateQuestion(question.id, { label: event.target.value })} />
          <FieldError id={`q-${question.id}-label`} message={visible[`question:${question.id}:label`]} /></label>
        <label className="jf-check"><input type="checkbox" checked={question.required} onChange={event => updateQuestion(question.id, { required: event.currentTarget.checked })} /><span>{t('Judges must answer this question')}</span></label>
      </div>
      <button type="button" className="icon-button" aria-label={`${t('Remove question')} ${index + 1}`} onClick={() => patch({ questions: draft.questions.filter(item => item.id !== question.id) })}><Trash2 size={16} /></button>
    </div>)}
    <FieldError id="jf-items-error" message={visible.items} />

    {message && <div className={message.kind === 'ok' ? 'jf-success' : 'form-error'} role={message.kind === 'ok' ? 'status' : 'alert'}>{message.kind === 'error' && <CircleAlert size={16} />}{t(message.text)}</div>}
    <div className="modal-actions jf-actions">
      {onCancel && <button type="button" className="button button-quiet" onClick={onCancel} disabled={saving}>{t('Cancel')}</button>}
      <Button type="submit" variant="pill" disabled={saving} data-testid="button-save-judging-form">{saving ? t('Saving…') : t('Save draft')}</Button>
      {formId !== undefined && <Button type="button" variant="primary" disabled={saving || dirty} onClick={() => setConfirmOpen(true)} data-testid="button-open-judging-form">{t('Open to judges')}</Button>}
    </div>
    {formId !== undefined && dirty && <small className="field-hint">{t('Save your changes before opening the form.')}</small>}
    <Dialog open={confirmOpen} onOpenChange={open => { if (!openForm.isPending) setConfirmOpen(open); }} eyebrow={t('OPEN TO JUDGES')} title={t('Open this form and lock it?')} description={t('Opening permanently freezes the questions, scoring criteria and business list. They cannot be edited later, even if you close the form. Anyone with the link can submit, and judge names and emails are self-reported, not verified.')}>
      <div className="jf-dialog-actions">
        <Button type="button" variant="text" onClick={() => setConfirmOpen(false)} disabled={openForm.isPending}>{t('Keep editing')}</Button>
        <Button type="button" variant="primary" onClick={() => void confirmOpenForm()} disabled={openForm.isPending} data-testid="button-confirm-open-judging">{openForm.isPending ? t('Opening…') : t('Open and lock form')}</Button>
      </div>
    </Dialog>
  </form>;
}

function SharePanel({ form }: { form: JudgingFormDetail }) {
  const queryClient = useQueryClient();
  const rotateLink = useRotateJudgingFormShareLink();
  const linkHistory = useListJudgingFormLinkHistory(form.id, {
    query: { enabled: form.publishedAt !== null, queryKey: getListJudgingFormLinkHistoryQueryKey(form.id) },
  });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [rotateSuccess, setRotateSuccess] = useState(false);
  useEffect(() => { setCopyState('idle'); }, [form.id, form.shareToken]);
  if (form.status === 'draft') return <div className="panel jf-section"><Typography as="h3" variant="label">{t('SHARE LINK')}</Typography><p className="field-hint">{t('The share link becomes available after you open the form to judges.')}</p></div>;
  if (!form.shareToken) return <div className="panel jf-section"><Typography as="h3" variant="label">{t('SHARE LINK')}</Typography><div className="form-error" role="alert"><CircleAlert size={16} />{t('The share link is unavailable for this form. The stored link could not be read, so no link is shown. Contact your platform administrator.')}</div></div>;
  const url = buildShareUrl(window.location.origin, import.meta.env.BASE_URL, form.shareToken);
  const replaceLink = async () => {
    setRotateError('');
    try {
      const updated = await rotateLink.mutateAsync({ formId: form.id });
      queryClient.setQueryData(getGetJudgingFormQueryKey(form.id), updated);
      void queryClient.invalidateQueries({ queryKey: getListJudgingFormsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListJudgingFormLinkHistoryQueryKey(form.id) });
      setConfirmRotate(false);
      setRotateSuccess(true);
    } catch (caught) {
      setRotateError(staffErrorMessage(errorStatus(caught), 'The share link could not be replaced. Try again.'));
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopyState('copied'); } catch { setCopyState('failed'); }
  };
  return <div className="panel jf-section">
    <Typography as="h3" variant="label">{t('SHARE LINK')}</Typography>
    <label className="field">
      <span>{t('Guest judging link')}</span>
      <input className="form-control mono" readOnly value={url} onFocus={event => event.currentTarget.select()} data-testid="input-judging-share-url" dir="ltr" />
    </label>
    <div className="jf-list-row">
      <button type="button" className="button button-outline" onClick={() => void copy()} data-testid="button-copy-judging-link"><ClipboardCopy size={15} /> {t('Copy link')}</button>
      <span role="status" className={copyState === 'failed' ? 'jf-field-error' : 'field-hint'}>{copyState === 'copied' ? t('Link copied.') : copyState === 'failed' ? t('Copy failed. Select the link above and copy it manually.') : ''}</span>
    </div>
    <div className="jf-list-row">
      <Button variant="pill" onClick={() => { setRotateError(''); setRotateSuccess(false); setConfirmRotate(true); }} disabled={rotateLink.isPending} data-testid="button-replace-judging-link">
        {t('Replace link')}
      </Button>
      <span className="field-hint">{t('Replacing the link stops the old link immediately. Submitted assessments and the locked rubric stay unchanged.')}</span>
    </div>
    {rotateSuccess && <p className="jf-success" role="status">{t('The link was replaced. Share the new link with judges; the previous link no longer works.')}</p>}
    {rotateError && <div className="form-error" role="alert"><CircleAlert size={16} />{t(rotateError)}</div>}
    {form.status === 'closed' && <p className="field-hint">{t('This form is closed, so the link does not accept new responses until you reopen it.')}</p>}
    <p className="field-hint">{t('Anyone with this link can submit an assessment without signing in. Names and emails are self-reported and not verified. Guest responses stay here and are not added to signed-in judge scorecards or pitch scores.')}</p>
    <div className="jf-section jf-link-history" aria-label={t('Link replacement history')}>
      <div className="jf-section-head"><Typography as="h3" variant="label">{t('LINK REPLACEMENT HISTORY')}</Typography></div>
      <p className="field-hint">{t('Staff email addresses and replacement times are shown here. Share tokens are never included.')}</p>
      {linkHistory.isLoading ? <p className="field-hint" role="status">{t('Loading replacement history…')}</p>
        : linkHistory.isError ? <LoadError message="Replacement history could not load." retry={() => void linkHistory.refetch()} />
          : !linkHistory.data?.length ? <p className="field-hint">{t('No link replacements have been recorded.')}</p>
            : <ul className="jf-history-list">{linkHistory.data.map(entry => <li key={entry.id}>
              <span>{entry.actorEmail}</span><time dateTime={entry.replacedAt}>{dateTime(entry.replacedAt)}</time>
            </li>)}</ul>}
    </div>
    <Dialog open={confirmRotate} onOpenChange={open => { if (!rotateLink.isPending) setConfirmRotate(open); }} eyebrow={t('REPLACE SHARE LINK')} title={t('Replace this judging link?')} description={t('The current link will stop loading and accepting submissions immediately. Existing assessments and the locked rubric will remain unchanged. The replacement link only accepts new assessments while the form is open.')}>
      <div className="jf-dialog-actions">
        <Button type="button" variant="text" onClick={() => setConfirmRotate(false)} disabled={rotateLink.isPending}>{t('Keep current link')}</Button>
        <Button type="button" variant="primary" onClick={() => void replaceLink()} disabled={rotateLink.isPending} data-testid="button-confirm-replace-judging-link">{rotateLink.isPending ? t('Replacing…') : t('Replace link')}</Button>
      </div>
    </Dialog>
  </div>;
}

function ResponsesPanel({ form }: { form: JudgingFormDetail }) {
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  return <div className="panel jf-section">
    <div className="jf-section-head"><Typography as="h3" variant="label" tone="accent">{t('PRIVATE RESPONSES')}</Typography><span className="mono field-hint">{form.responseCount} {t('total')}</span></div>
    <p className="field-hint">{t('Visible only to authorized program staff. Judge identities are self-reported and not verified.')}</p>
    {cursors.map((beforeId, index) => <ResponsePage key={beforeId ?? 'latest'} form={form} beforeId={beforeId} isLast={index === cursors.length - 1} onOlder={next => setCursors(previous => [...previous, next])} />)}
  </div>;
}

function ResponsePage({ form, beforeId, isLast, onOlder }: { form: JudgingFormDetail; beforeId?: number; isLast: boolean; onOlder: (beforeId: number) => void }) {
  const params = beforeId === undefined ? undefined : { beforeId };
  const page = useListJudgingFormResponses(form.id, params, { query: { queryKey: getListJudgingFormResponsesQueryKey(form.id, params) } });
  if (page.isLoading) return <div className="skeleton skeleton-table" aria-label={t('Loading responses')} />;
  if (page.isError || !page.data) return <LoadError message={staffErrorMessage(errorStatus(page.error), 'Responses could not load.')} retry={() => void page.refetch()} />;
  const { responses, nextBeforeId } = page.data;
  const criterionLabel = (id: string) => form.criteria.find(criterion => criterion.id === id);
  const questionLabel = (id: string) => form.questions.find(question => question.id === id)?.label ?? t('Question');
  if (!responses.length && beforeId === undefined) return <div className="empty-panel"><div className="empty-icon"><Eye size={21} /></div><h3>{t('No responses yet.')}</h3><p>{t(form.status === 'open' ? 'Share the link with judges. Their assessments will appear here.' : 'Open the form to start collecting assessments.')}</p></div>;
  return <>
    <ul className="jf-responses">{responses.map(response => <li key={response.id} className="jf-response">
      <div className="jf-response-head">
        <div><b>{response.businessName}</b><span className="field-hint">{dateTime(response.submittedAt)}</span></div>
        {response.maxScore > 0 && <span className="jf-score mono">{response.scoreTotal} / {response.maxScore}</span>}
      </div>
      <p className="jf-judge"><span>{response.judgeName}</span> <span dir="ltr">{response.judgeEmail}</span> <span className="badge badge-neutral"><span />{t('Self-reported')}</span></p>
      {response.scores.length > 0 && <table className="jf-table"><caption className="sr-only">{t('Rubric breakdown')}</caption><thead><tr><th scope="col">{t('Criterion')}</th><th scope="col">{t('Score')}</th></tr></thead><tbody>
        {response.scores.map(score => { const criterion = criterionLabel(score.criterionId); return <tr key={score.criterionId}><td>{criterion?.label ?? t('Criterion')}</td><td className="mono">{score.score}{criterion ? ` / ${criterion.maxScore}` : ''}</td></tr>; })}
      </tbody></table>}
      {response.answers.length > 0 && <dl className="jf-answers">{response.answers.map(answer => <div key={answer.questionId}><dt>{questionLabel(answer.questionId)}</dt><dd className="jf-prewrap">{answer.text.trim() ? answer.text : <span className="field-hint">{t('No answer')}</span>}</dd></div>)}</dl>}
    </li>)}</ul>
    {isLast && nextBeforeId !== null && <button type="button" className="button button-outline jf-older" onClick={() => onOlder(nextBeforeId)} data-testid="button-older-responses">{t('Load older responses')}</button>}
    {isLast && nextBeforeId === null && responses.length > 0 && <p className="field-hint jf-older">{t('All responses are shown.')}</p>}
  </>;
}
