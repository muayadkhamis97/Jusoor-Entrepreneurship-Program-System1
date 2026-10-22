import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Lock } from 'lucide-react';
import { getGetPublicJudgingFormQueryKey, useGetPublicJudgingForm, useSubmitPublicJudgingResponse } from '@workspace/api-client-react';
import type { JudgingSubmissionReceipt, PublicJudgingForm } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { Rule } from '@workspace/program-editorial/components/ui/rule';
import { getThemeStyle } from '@workspace/program-editorial/lib/theme';
import {
  assessmentForBusiness, buildResponsePayload, emptyAssessment, errorStatus, MAX_ANSWER_LENGTH, publicLoadErrorMessage, publicSubmitErrorMessage, readTokenFromHash,
  submissionKeyFor, validateResponse, type Assessment, type Identity, type SubmissionKey,
} from './judging-form-helpers';
import { LanguageToggle, useAppLanguage } from './language';
import './judging-forms.css';

function useHashToken(): string {
  const [token, setToken] = useState(() => readTokenFromHash(window.location.hash));
  useEffect(() => {
    const update = () => setToken(readTokenFromHash(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return token;
}

export function PublicJudgingFormPage() {
  const { language, t } = useAppLanguage();
  const token = useHashToken();
  const params = { token };
  const form = useGetPublicJudgingForm(params, { query: {
    enabled: token.length > 0, retry: false, queryKey: getGetPublicJudgingFormQueryKey(params),
    staleTime: Infinity, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  } });

  let body;
  if (!token) body = <Notice title={t('This judging link is incomplete.')} text={t('Open the full link you received from the program team. The part after # is needed.')} />;
  else if (form.isLoading) body = <div className="loading-panel" aria-label={t('Loading judging form')}><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
  else if (!form.data) {
    const status = errorStatus(form.error);
    body = <Notice title={t(status === 410 ? 'This form is closed.' : status === 404 ? 'Link not recognised.' : 'The form could not load.')} text={t(publicLoadErrorMessage(status))} retry={status === 404 || status === 410 ? undefined : () => void form.refetch()} />;
  } else body = <JudgingForm key={token} form={form.data} token={token} />;

  return <PaperSurface grain className="jf-public" style={getThemeStyle()}>
    <main lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} className="jf-public-main">
      <header className="jf-public-top">
        <Typography variant="label" tone="accent">{t('GUEST JUDGING')}</Typography>
        <LanguageToggle />
      </header>
      {body}
    </main>
  </PaperSurface>;
}

function Notice({ title, text, retry }: { title: string; text: string; retry?: () => void }) {
  const { t } = useAppLanguage();
  return <div className="jf-public-notice" role="alert">
    <CircleAlert size={22} aria-hidden="true" />
    <Typography as="h1" variant="heading">{title}</Typography>
    <Typography>{text}</Typography>
    {retry && <Button variant="pill" onClick={retry}>{t('Try again')}</Button>}
  </div>;
}

function JudgingForm({ form, token }: { form: PublicJudgingForm; token: string }) {
  const { t } = useAppLanguage();
  const submit = useSubmitPublicJudgingResponse();
  const [identity, setIdentity] = useState<Identity>({ judgeName: '', judgeEmail: '' });
  const [assessment, setAssessment] = useState<Assessment>(emptyAssessment);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [receipt, setReceipt] = useState<JudgingSubmissionReceipt | null>(null);
  const [submitted, setSubmitted] = useState<number[]>([]);
  const keyRef = useRef<Record<number, SubmissionKey>>({});
  const drafts = useRef<Record<string, Assessment>>({});
  const errors = validateResponse(form, identity, assessment);
  const visible = showErrors ? errors : {};

  const setIdentityField = (field: keyof Identity, value: string) => { setIdentity(previous => ({ ...previous, [field]: value })); setSubmitError(''); };
  const setScore = (id: string, value: string) => { setAssessment(previous => ({ ...previous, scores: { ...previous.scores, [id]: value } })); setSubmitError(''); };
  const setAnswer = (id: string, value: string) => { setAssessment(previous => ({ ...previous, answers: { ...previous.answers, [id]: value } })); setSubmitError(''); };

  const onSubmit = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length) { setSubmitError(t('Complete the highlighted fields before submitting.')); return; }
    const payload = buildResponsePayload(form, identity, assessment);
    const key = submissionKeyFor(keyRef.current[payload.businessId] ?? null, payload);
    keyRef.current[payload.businessId] = key;
    setSubmitError('');
    try {
      const result = await submit.mutateAsync({ params: { token }, data: { ...payload, clientSubmissionId: key.id } });
      delete keyRef.current[payload.businessId];
      delete drafts.current[String(payload.businessId)];
      setSubmitted(previous => [...previous, payload.businessId]);
      setReceipt(result);
      window.scrollTo({ top: 0 });
    } catch (caught) {
      setSubmitError(t(publicSubmitErrorMessage(errorStatus(caught))));
    }
  };

  const another = () => {
    setAssessment(emptyAssessment());
    setShowErrors(false);
    setReceipt(null);
  };

  if (receipt) return <section className="jf-public-receipt" aria-live="polite">
    <Typography variant="label" tone="accent">{t('ASSESSMENT RECEIVED')}</Typography>
    <Typography as="h1" variant="heading">{t('Thank you. Your assessment was received.')}</Typography>
    <Typography>{t('Business')}: <b>{receipt.businessName}</b></Typography>
    {receipt.maxScore > 0 && <Typography>{t('Your total score')}: <b className="mono">{receipt.scoreTotal} / {receipt.maxScore}</b></Typography>}
    {form.businesses.length > 1 && <Button variant="primary" onClick={another} data-testid="button-assess-another">{t('Assess another business')}</Button>}
    <Typography className="field-hint">{t('Your name and email will stay filled in for the next assessment on this device until you close the page.')}</Typography>
  </section>;

  const fieldError = (key: string) => visible[key] ? <small id={`err-${key}`} className="jf-field-error" role="alert">{t(visible[key])}</small> : null;
  const describedBy = (key: string, hint?: string) => [hint, visible[key] ? `err-${key}` : ''].filter(Boolean).join(' ') || undefined;

  return <form className="jf-public-form" noValidate onSubmit={event => { event.preventDefault(); void onSubmit(); }}>
    <div>
      <Typography variant="label" tone="accent">{form.programName}</Typography>
      <Typography as="h1" variant="hero" className="jf-public-title">{form.title}</Typography>
      {form.instructions && <Typography className="jf-prewrap">{form.instructions}</Typography>}
    </div>
    <div className="jf-public-privacy"><Lock size={15} aria-hidden="true" /><span>{t('No account is needed. Your answers go only to the program team running this assessment. Other judges cannot see them.')}</span></div>
    <small className="field-hint" role="note">{t('Fields marked * are required.')}</small>

    <fieldset className="jf-public-group" disabled={submit.isPending}>
      <legend><Typography as="span" variant="label">{t('About you')}</Typography></legend>
      <div className="jf-grid">
        <label className="field"><span>{t('Full name')}<i aria-hidden="true"> *</i></span>
          <input className="form-control" autoComplete="name" maxLength={150} required value={identity.judgeName} aria-invalid={!!visible.judgeName} aria-describedby={describedBy('judgeName')} onChange={event => setIdentityField('judgeName', event.target.value)} data-testid="input-judge-name" />
          {fieldError('judgeName')}</label>
        <label className="field"><span>{t('Email')}<i aria-hidden="true"> *</i></span>
          <input className="form-control" type="email" autoComplete="email" dir="ltr" maxLength={254} required value={identity.judgeEmail} aria-invalid={!!visible.judgeEmail} aria-describedby={describedBy('judgeEmail', 'hint-email')} onChange={event => setIdentityField('judgeEmail', event.target.value)} data-testid="input-judge-email" />
          <small id="hint-email" className="field-hint">{t('Used by the program team to identify your assessment. One assessment per business per email.')}</small>
          {fieldError('judgeEmail')}</label>
      </div>
    </fieldset>

    <fieldset className="jf-public-group" disabled={submit.isPending}>
      <legend><Typography as="span" variant="label">{t('Business')}<i aria-hidden="true"> *</i></Typography></legend>
      <label className="field"><span>{t('Which business are you assessing?')}</span>
        <select className="form-control" required value={assessment.businessId} aria-invalid={!!visible.businessId} aria-describedby={describedBy('businessId')} onChange={event => {
          if (assessment.businessId) drafts.current[assessment.businessId] = assessment;
          setAssessment(assessmentForBusiness(event.target.value, drafts.current));
          setShowErrors(false); setSubmitError('');
        }} data-testid="select-judging-business">
          <option value="">{t('Choose…')}</option>
          {form.businesses.map(business => <option key={business.id} value={business.id}>{business.name}{submitted.includes(business.id) ? ` (${t('submitted')})` : ''}</option>)}
        </select>
        {fieldError('businessId')}
        <small className="field-hint">{t('Unsent scores and answers are kept separately for each business while this page stays open.')}</small></label>
    </fieldset>

    {form.criteria.length > 0 && <fieldset className="jf-public-group" disabled={submit.isPending}>
      <legend><Typography as="span" variant="label">{t('Scores')}</Typography></legend>
      {form.criteria.map(criterion => <label key={criterion.id} className="field jf-public-score">
        <span>{criterion.label}<i aria-hidden="true"> *</i></span>
        {criterion.description && <small id={`desc-${criterion.id}`} className="field-hint">{criterion.description}</small>}
        <span className="jf-score-input">
          <input className="form-control mono" type="number" inputMode="decimal" min={0} max={criterion.maxScore} step="any" required value={assessment.scores[criterion.id] ?? ''} aria-invalid={!!visible[`score:${criterion.id}`]} aria-describedby={describedBy(`score:${criterion.id}`, `${criterion.description ? `desc-${criterion.id} ` : ''}range-${criterion.id}`)} onChange={event => setScore(criterion.id, event.target.value)} />
          <span id={`range-${criterion.id}`} className="mono field-hint">0 – {criterion.maxScore}</span>
        </span>
        {fieldError(`score:${criterion.id}`)}
      </label>)}
    </fieldset>}

    {form.questions.length > 0 && <fieldset className="jf-public-group" disabled={submit.isPending}>
      <legend><Typography as="span" variant="label">{t('Written feedback')}</Typography></legend>
      {form.questions.map(question => { const text = assessment.answers[question.id] ?? ''; return <label key={question.id} className="field">
        <span>{question.label}{question.required ? <i aria-hidden="true"> *</i> : <em className="field-hint"> ({t('optional')})</em>}</span>
        <textarea className="form-control resize-y" rows={4} maxLength={MAX_ANSWER_LENGTH} required={question.required} value={text} aria-invalid={!!visible[`answer:${question.id}`]} aria-describedby={describedBy(`answer:${question.id}`, `count-${question.id}`)} onChange={event => setAnswer(question.id, event.target.value)} />
        <small id={`count-${question.id}`} className="field-hint mono">{text.length} / {MAX_ANSWER_LENGTH}</small>
        {fieldError(`answer:${question.id}`)}
      </label>; })}
    </fieldset>}

    <Rule />
    {submitError && <div className="form-error" role="alert"><CircleAlert size={16} />{submitError}</div>}
    <div className="jf-public-submit">
      <Button type="submit" variant="primary" disabled={submit.isPending} data-testid="button-submit-judging">{submit.isPending ? t('Submitting…') : t('Submit assessment')}</Button>
      <small className="field-hint">{t('Names and emails are self-reported. Submitting sends this assessment once; it cannot be edited afterwards.')}</small>
    </div>
  </form>;
}
