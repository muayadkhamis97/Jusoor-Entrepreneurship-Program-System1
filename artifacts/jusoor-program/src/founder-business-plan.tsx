import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantBusinessPlansQueryKey,
  useGetParticipantBusinessPlans,
  useSaveParticipantBusinessPlan,
} from '@workspace/api-client-react';
import type { ParticipantBusinessPlan, ParticipantBusinessPlanUpdate, ParticipantEnrollment } from '@workspace/api-client-react';
import { ArrowRight, Check, CircleAlert, LockKeyhole, Save } from 'lucide-react';
import { currentLanguage, t } from './language';
import { setParticipantWorkbookDirty } from './participant-workbook-unsaved';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import './founder-business-plan.css';

type PlanValues = ParticipantBusinessPlanUpdate;
type PlanField = { key: keyof PlanValues; title: string; prompt: string; helper: string; placeholder: string; rows: number };

const fields: PlanField[] = [
  {
    key: 'acquisitionChannels',
    title: '01 · Find customers',
    prompt: 'Where will your first customers discover you?',
    helper: 'Choose a few realistic channels your target customers already use.',
    placeholder: 'For example: referrals from local shop owners, Instagram, community events…',
    rows: 3,
  },
  {
    key: 'outreachActions',
    title: '02 · Start conversations',
    prompt: 'What will you do this week to reach them?',
    helper: 'Write down a specific action, who you will contact, and a small weekly target.',
    placeholder: 'Each week I will… / I will speak with… / My target is…',
    rows: 4,
  },
  {
    key: 'fulfillmentSteps',
    title: '03 · Deliver reliably',
    prompt: 'What needs to happen from order to delivery?',
    helper: 'List the few key steps, who is responsible, and what the customer should expect.',
    placeholder: '1. Confirm the request…  2. Prepare…  3. Deliver…  4. Follow up…',
    rows: 4,
  },
  {
    key: 'reviewSignals',
    title: '04 · Review and improve',
    prompt: 'Which small set of signals will you review?',
    helper: 'Pick simple numbers you can check regularly, such as conversations, orders, repeat buyers, or delivery time.',
    placeholder: 'Every week I will track… and aim for…',
    rows: 3,
  },
];

function valuesFromPlan(plan: ParticipantBusinessPlan): PlanValues {
  return {
    acquisitionChannels: plan.acquisitionChannels || '',
    outreachActions: plan.outreachActions || '',
    fulfillmentSteps: plan.fulfillmentSteps || '',
    reviewSignals: plan.reviewSignals || '',
  };
}

function BusinessPlanCard({ plan }: { plan: ParticipantBusinessPlan }) {
  const client = useQueryClient();
  const save = useSaveParticipantBusinessPlan();
  const [savedAt, setSavedAt] = useState<string | null>(plan.updatedAt);
  const workbookAnchor = `participant-business-plan-workbook-${plan.applicationId}`;
  const formId = `business-plan-form-${plan.applicationId}`;
  const [isOpen, setIsOpen] = useState(() => {
    const hasStarted = Object.values(valuesFromPlan(plan)).some(value => value.trim().length > 0);
    const hash = typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.slice(1));
    return hasStarted || hash === 'participant-business-plan-workbook' || hash === workbookAnchor;
  });
  const form = useForm<PlanValues>({ defaultValues: valuesFromPlan(plan) });
  const isDirty = form.formState.isDirty;
  const filledCount = fields.filter(({ key }) => Boolean(form.watch(key)?.trim())).length;
  const progress = Math.round((filledCount / fields.length) * 100);

  useEffect(() => {
    setParticipantWorkbookDirty(`business-plan:${plan.applicationId}`, isDirty);
  }, [plan.applicationId, isDirty]);
  useEffect(() => () => setParticipantWorkbookDirty(`business-plan:${plan.applicationId}`, false), [plan.applicationId]);

  useEffect(() => setSavedAt(plan.updatedAt), [plan.updatedAt]);

  useEffect(() => {
    const openFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash === 'participant-business-plan-workbook' || hash === workbookAnchor) setIsOpen(true);
    };
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [workbookAnchor]);

  const onSubmit = (data: PlanValues) => {
    save.mutate({ applicationId: plan.applicationId, data }, {
      onSuccess: result => {
        setSavedAt(result.updatedAt);
        form.reset(valuesFromPlan(result));
        void client.invalidateQueries({ queryKey: getGetParticipantBusinessPlansQueryKey() });
      },
    });
  };

  const savedLabel = savedAt
    ? `${t('Last saved')} · ${new Date(savedAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
    : t('Not saved yet');

  return <article id={workbookAnchor} className="founder-plan-card" data-testid={`founder-business-plan-${plan.applicationId}`}>
    <header className="founder-plan-head">
      <div className="idea-business-mark" aria-hidden="true">{(plan.businessName || 'J').slice(0, 1).toUpperCase()}</div>
      <div className="idea-workbook-title">
        <div className="idea-workbook-program">{plan.programName}</div>
        <h3>{plan.businessName}</h3>
        <span>{t('Application')} · JSR-{String(plan.applicationId).padStart(5, '0')}</span>
      </div>
      <div className="founder-plan-head-actions">
        <div className="idea-private-tag"><LockKeyhole size={13} />{t('Private to you')}</div>
        <button
          type="button"
          className="button button-outline idea-workbook-toggle"
          aria-expanded={isOpen}
          aria-controls={formId}
          onClick={() => setIsOpen(open => !open)}
          data-testid={`button-toggle-business-plan-${plan.applicationId}`}
        >{isOpen ? t('Close workbook') : filledCount > 0 ? t('Continue') : t('Open')}</button>
      </div>
    </header>
    <div className="idea-workbook-summary">
      <div className="idea-progress-row">
        <div className="idea-progress-copy"><span>{t('Your plan so far')}</span><b>{filledCount} {t('of')} 4 {t('steps started')}</b></div>
        <div className="idea-progress-track" role="progressbar" aria-label={t('Business plan progress')} aria-valuetext={`${filledCount} ${t('of')} 4 ${t('steps started')}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
      </div>
    </div>
    <div id={formId} className="founder-plan-form-panel" hidden={!isOpen} data-testid={`panel-business-plan-${plan.applicationId}`}>
      <Form {...form}>
        <form className="founder-plan-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          {fields.map((field, index) => <section className="idea-step" key={field.key}>
            <div className="idea-step-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="idea-step-content">
              <div className="idea-step-kicker">{t(field.title)}</div>
              <FormField control={form.control} name={field.key} render={({ field: control }) => <FormItem className="idea-form-item">
                <FormLabel>{t(field.prompt)}</FormLabel>
                <FormControl><textarea {...control} rows={field.rows} maxLength={field.key === 'outreachActions' || field.key === 'fulfillmentSteps' ? 5000 : 3000} placeholder={t(field.placeholder)} data-testid={`input-business-plan-${field.key}-${plan.applicationId}`} /></FormControl>
                <small>{t(field.helper)}</small>
              </FormItem>} />
            </div>
          </section>)}
          <div className="idea-save-area">
            <div className="idea-save-note">
              <div className="idea-save-status" role="status" aria-live="polite" data-testid={`status-business-plan-save-${plan.applicationId}`}>
                {save.isPending ? <><span className="idea-saving-pulse" />{t('Saving your plan…')}</>
                  : save.isError ? <><CircleAlert size={15} />{t('Your changes could not be saved. Please try again.')}</>
                    : savedAt ? <><Check size={15} />{savedLabel}</>
                      : <>{t('Your draft has not been saved yet.')}</>}
              </div>
              <span>{t('Save an incomplete draft whenever you are ready. Only you can see this plan.')}</span>
            </div>
            <button className="button button-primary participant-primary-action idea-save-button" type="submit" disabled={save.isPending} data-testid={`button-save-business-plan-${plan.applicationId}`}>
              {save.isPending ? <><span className="idea-button-dots" />{t('Saving…')}</> : <><Save size={15} />{t('Save plan')}</>}
            </button>
          </div>
        </form>
      </Form>
    </div>
  </article>;
}

export function ParticipantBusinessPlan({ enrollments }: { enrollments: ParticipantEnrollment[] }) {
  const acceptedIds = useMemo(() => enrollments.filter(item => item.applicationStatus === 'accepted').map(item => item.applicationId), [enrollments]);
  const query = useGetParticipantBusinessPlans({
    query: { queryKey: getGetParticipantBusinessPlansQueryKey(), enabled: acceptedIds.length > 0 },
  });
  const plans = useMemo(() => {
    const accepted = new Set(acceptedIds);
    return (query.data?.plans || []).filter(plan => accepted.has(plan.applicationId));
  }, [acceptedIds, query.data?.plans]);

  if (!acceptedIds.length) return null;

  return <section className="participant-section founder-plan-section" data-testid="participant-business-plan">
    <div className="idea-section-heading">
      <div>
        <div className="idea-eyebrow">{t('CUSTOMER ACQUISITION / OPERATIONS')}</div>
        <h2>{t('Reach customers and deliver consistently.')}</h2>
        <p>{t('Turn your idea into a practical weekly plan for finding customers, serving them, and learning what works.')}</p>
      </div>
      <div className="idea-path-mark" aria-hidden="true"><span>01</span><i /><span>04</span></div>
    </div>
    <div className="idea-reassurance"><LockKeyhole size={16} /><p><b>{t('A private space for your business plan.')}</b> {t('Your plan is visible only to you. It is not shared with staff or other founders.')}<span className="idea-privacy-note">{t('Use general notes rather than customers’ names, contact details, or other identifying information.')}</span></p></div>
    {query.isLoading ? <div className="idea-loading" aria-label={t('Loading your private business plans')}><div /><div /><div /></div>
      : query.isError ? <div className="idea-empty idea-error" role="alert">
        <span className="idea-empty-mark"><CircleAlert size={20} /></span>
        <div><h3>{t('Your business plan could not load.')}</h3><p>{t('Your plan remains private. Check your connection and try again.')}</p></div>
        <button type="button" className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-business-plan">{t('Try again')} <ArrowRight size={14} /></button>
      </div>
      : plans.length === 0 ? <div className="idea-empty" data-testid="empty-business-plan">
        <span className="idea-empty-mark"><ArrowRight size={20} /></span>
        <div><h3>{t('Your plan is being prepared.')}</h3><p>{t('A private business plan will appear here for each accepted program.')}</p></div>
      </div>
      : <div className="founder-plan-list">{plans.map(plan => <BusinessPlanCard key={plan.applicationId} plan={plan} />)}</div>}
  </section>;
}
