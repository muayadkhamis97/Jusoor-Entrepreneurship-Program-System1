import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantIdeaValidationQueryKey,
  useGetParticipantIdeaValidation,
  useSaveParticipantIdeaValidation,
} from '@workspace/api-client-react';
import type { ParticipantEnrollment, ParticipantIdeaValidationUpdate, ParticipantIdeaValidationWorkbook } from '@workspace/api-client-react';
import { ArrowDown, ArrowRight, Check, CircleAlert, LockKeyhole, Save } from 'lucide-react';
import { currentLanguage, t } from './language';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import './idea-validation.css';

type FieldKey = keyof ParticipantIdeaValidationUpdate;
type WorkbookValues = ParticipantIdeaValidationUpdate;

const fields: { key: FieldKey; title: string; prompt: string; helper: string; placeholder: string; rows: number }[] = [
  {
    key: 'customerSegment',
    title: '01 · The people',
    prompt: 'Who is experiencing this problem?',
    helper: 'Be specific about the people, place, or moment. A clear first audience is easier to learn from.',
    placeholder: 'For example: independent shop owners in Amman who manage orders through WhatsApp…',
    rows: 3,
  },
  {
    key: 'problemStatement',
    title: '02 · The problem',
    prompt: 'What are they trying to do, and what gets in the way?',
    helper: 'Describe what happens today, in their words if you can. Keep the solution out of this sentence.',
    placeholder: 'When [situation], this group struggles to [need] because…',
    rows: 4,
  },
  {
    key: 'riskiestAssumption',
    title: '03 · The uncertainty',
    prompt: 'What must be true for your idea to work?',
    helper: 'Choose the assumption that would most change your direction if it proved wrong.',
    placeholder: 'I believe this group will…',
    rows: 3,
  },
  {
    key: 'mvpExperiment',
    title: '04 · A small experiment',
    prompt: 'What is the simplest way to test that assumption?',
    helper: 'Plan a small, real-world test before building more. Say who you will involve and what you will do.',
    placeholder: 'I will show / offer / ask… to… by…',
    rows: 4,
  },
  {
    key: 'successSignal',
    title: '05 · What to notice',
    prompt: 'What evidence would make you believe the test worked?',
    helper: 'Name an observable signal and a threshold. Decide what you will count before you begin.',
    placeholder: 'A useful signal would be…; I will look for…',
    rows: 3,
  },
  {
    key: 'evidenceAndNextStep',
    title: '06 · Learning and next move',
    prompt: 'What did you learn, and what will you do next?',
    helper: 'Add evidence from the experiment, including surprises. Your next step can be to continue, adjust, or rethink.',
    placeholder: 'What I observed… / What it means… / Next, I will…',
    rows: 4,
  },
];

const emptyValues = (): WorkbookValues => ({
  customerSegment: '',
  problemStatement: '',
  riskiestAssumption: '',
  mvpExperiment: '',
  successSignal: '',
  evidenceAndNextStep: '',
});

function workbookValues(workbook: ParticipantIdeaValidationWorkbook): WorkbookValues {
  return {
    customerSegment: workbook.customerSegment || '',
    problemStatement: workbook.problemStatement || '',
    riskiestAssumption: workbook.riskiestAssumption || '',
    mvpExperiment: workbook.mvpExperiment || '',
    successSignal: workbook.successSignal || '',
    evidenceAndNextStep: workbook.evidenceAndNextStep || '',
  };
}

function WorkbookCard({ workbook }: { workbook: ParticipantIdeaValidationWorkbook }) {
  const client = useQueryClient();
  const save = useSaveParticipantIdeaValidation();
  const [savedAt, setSavedAt] = useState<string | null>(workbook.updatedAt);
  const workbookAnchor = `participant-founder-workbook-${workbook.applicationId}`;
  const formId = `idea-workbook-form-${workbook.applicationId}`;
  const [isOpen, setIsOpen] = useState(() => {
    const hasStarted = Object.values(workbookValues(workbook)).some(value => value.trim().length > 0);
    const hash = typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.slice(1));
    return hasStarted || hash === 'participant-founder-workbook' || hash === workbookAnchor;
  });
  const form = useForm<WorkbookValues>({ defaultValues: workbookValues(workbook) });
  const filledCount = fields.filter(({ key }) => Boolean(form.watch(key)?.trim())).length;
  const progress = Math.round((filledCount / fields.length) * 100);

  useEffect(() => {
    setSavedAt(workbook.updatedAt);
  }, [workbook.updatedAt]);

  useEffect(() => {
    const openFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash === 'participant-founder-workbook' || hash === workbookAnchor) setIsOpen(true);
    };
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [workbookAnchor]);

  const onSubmit = (data: WorkbookValues) => {
    save.mutate({ applicationId: workbook.applicationId, data }, {
      onSuccess: result => {
        setSavedAt(result.updatedAt);
        form.reset(workbookValues(result));
        void client.invalidateQueries({ queryKey: getGetParticipantIdeaValidationQueryKey() });
      },
    });
  };

  const savedLabel = savedAt
    ? `${t('Last saved')} · ${new Date(savedAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
    : t('Not saved yet');

  return <article id={workbookAnchor} className="idea-workbook" data-testid={`idea-workbook-${workbook.applicationId}`}>
    <header className="idea-workbook-head">
      <div className="idea-business-mark" aria-hidden="true">{(workbook.businessName || 'J').slice(0, 1).toUpperCase()}</div>
      <div className="idea-workbook-title">
        <div className="idea-workbook-program">{workbook.programName}</div>
        <h3>{workbook.businessName}</h3>
        <span>{t('Application')} · JSR-{String(workbook.applicationId).padStart(5, '0')}</span>
      </div>
      <div className="idea-workbook-head-actions">
        <div className="idea-private-tag"><LockKeyhole size={13} />{t('Private to you')}</div>
        <button
          type="button"
          className="button button-outline idea-workbook-toggle"
          aria-expanded={isOpen}
          aria-controls={formId}
          onClick={() => setIsOpen(open => !open)}
          data-testid={`button-toggle-idea-workbook-${workbook.applicationId}`}
        >{isOpen ? t('Close workbook') : filledCount > 0 ? t('Continue') : t('Open')}</button>
      </div>
    </header>

    <div className="idea-workbook-summary">
      <div className="idea-progress-row">
        <div className="idea-progress-copy"><span>{t('Your thinking so far')}</span><b>{filledCount} {t('of')} 6 {t('steps started')}</b></div>
        <div className="idea-progress-track" role="progressbar" aria-label={t('Workbook progress')} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
      </div>
    </div>

    <div id={formId} className="idea-workbook-form-panel" hidden={!isOpen} data-testid={`panel-idea-workbook-${workbook.applicationId}`}>
      <Form {...form}>
        <form className="idea-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          {fields.map((field, index) => <section className={`idea-step idea-step-${index + 1}`} key={field.key}>
            <div className="idea-step-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="idea-step-content">
              <div className="idea-step-kicker">{t(field.title)}</div>
              <FormField control={form.control} name={field.key} render={({ field: control }) => <FormItem className="idea-form-item">
                <FormLabel>{t(field.prompt)}</FormLabel>
                <FormControl>
                  <textarea
                    {...control}
                    rows={field.rows}
                    maxLength={field.key === 'customerSegment' || field.key === 'successSignal' ? 2000 : field.key === 'riskiestAssumption' ? 3000 : 5000}
                    placeholder={t(field.placeholder)}
                    data-testid={`input-idea-${field.key}-${workbook.applicationId}`}
                  />
                </FormControl>
                <small>{t(field.helper)}</small>
                <FormMessage />
              </FormItem>} />
            </div>
            {index < fields.length - 1 && <ArrowDown className="idea-step-connector" size={15} aria-hidden="true" />}
          </section>)}

          <div className="idea-save-area">
            <div className="idea-save-note">
              <div className="idea-save-status" aria-live="polite" data-testid={`status-idea-save-${workbook.applicationId}`}>
                {save.isPending ? <><span className="idea-saving-pulse" />{t('Saving your workbook…')}</>
                  : save.isError ? <><CircleAlert size={15} />{t('Your changes could not be saved. Please try again.')}</>
                    : savedAt ? <><Check size={15} />{savedLabel}</>
                      : <>{t('Your draft has not been saved yet.')}</>}
              </div>
              <span>{t('Save an incomplete draft whenever you are ready. Only you can see this workbook.')}</span>
            </div>
            <button className="button button-primary idea-save-button" type="submit" disabled={save.isPending} data-testid={`button-save-idea-${workbook.applicationId}`}>
              {save.isPending ? <><span className="idea-button-dots" />{t('Saving…')}</> : <><Save size={15} />{t('Save draft')}</>}
            </button>
          </div>
        </form>
      </Form>
    </div>
  </article>;
}

export function ParticipantIdeaValidation({ enrollments }: { enrollments: ParticipantEnrollment[] }) {
  const acceptedIds = useMemo(() => enrollments.filter(item => item.applicationStatus === 'accepted').map(item => item.applicationId), [enrollments]);
  const query = useGetParticipantIdeaValidation({
    query: { queryKey: getGetParticipantIdeaValidationQueryKey(), enabled: acceptedIds.length > 0 },
  });
  const grouped = useMemo(() => {
    const accepted = new Set(acceptedIds);
    const workbooks = (query.data?.workbooks || []).filter(workbook => accepted.has(workbook.applicationId));
    const groups = new Map<number, ParticipantIdeaValidationWorkbook[]>();
    workbooks.forEach(workbook => {
      const current = groups.get(workbook.programId) || [];
      current.push(workbook);
      groups.set(workbook.programId, current);
    });
    return [...groups.entries()].map(([programId, items]) => ({ programId, items }));
  }, [acceptedIds, query.data?.workbooks]);

  if (!acceptedIds.length) return null;

  return <section className="participant-section idea-validation-section" data-testid="participant-idea-validation">
    <div className="idea-section-heading">
      <div>
        <div className="idea-eyebrow">{t('PRIVATE FOUNDER WORKBOOK')}</div>
        <h2>{t('Turn a good question into useful evidence.')}</h2>
        <p>{t('Work through your idea one small decision at a time. Save a draft at any point; this workbook is private to you.')}</p>
      </div>
      <div className="idea-path-mark" aria-hidden="true">
        <span>01</span><i /><span>06</span>
      </div>
    </div>

  <div className="idea-reassurance"><LockKeyhole size={16} /><p><b>{t('A private space for your thinking.')}</b> {t('Your workbook is visible only to you. It is not shared with staff or other founders.')}<span className="idea-privacy-note">{t('For privacy, do not enter customers’ names, contact details, or other identifying information.')}</span></p></div>

    {query.isLoading ? <div className="idea-loading" aria-label={t('Loading your private workbooks')}><div /><div /><div /></div>
      : query.isError ? <div className="idea-empty idea-error" role="alert">
        <span className="idea-empty-mark"><CircleAlert size={20} /></span>
        <div><h3>{t('Your workbook could not load.')}</h3><p>{t('Your ideas remain private. Check your connection and try again.')}</p></div>
        <button type="button" className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-idea-workbook">{t('Try again')} <ArrowRight size={14} /></button>
      </div>
      : grouped.length === 0 ? <div className="idea-empty" data-testid="empty-idea-workbook">
        <span className="idea-empty-mark"><ArrowRight size={20} /></span>
        <div><h3>{t('Your workbook is being prepared.')}</h3><p>{t('An idea-validation workbook will appear here for each accepted program. You can begin as soon as it is ready.')}</p></div>
      </div>
      : <div className="idea-program-groups">{grouped.map(group => <div className="idea-program-group" key={group.programId} data-testid={`idea-program-group-${group.programId}`}>
        <div className="idea-program-label"><span>{t('YOUR COHORT')}</span><b>{group.items[0]?.programName}</b><i>{group.items.length} {t(group.items.length === 1 ? 'workbook' : 'workbooks')}</i></div>
        <div className="idea-workbook-list">{group.items.map(workbook => <WorkbookCard key={workbook.applicationId} workbook={workbook} />)}</div>
      </div>)}</div>}
  </section>;
}
