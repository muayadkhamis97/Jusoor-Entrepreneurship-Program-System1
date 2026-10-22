import type {
  JudgingCriterion, JudgingFormDetail, JudgingFormInput, JudgingQuestion, JudgingResponseInput, PublicJudgingForm,
} from '@workspace/api-client-react';

export const MAX_JUDGING_ITEMS = 20;
export const MAX_JUDGING_BUSINESSES = 100;
export const MAX_ANSWER_LENGTH = 4000;

export type CriterionDraft = { id: string; label: string; description: string; maxScore: string };
export type QuestionDraft = { id: string; label: string; required: boolean };
export type FormDraft = {
  programId: string;
  title: string;
  instructions: string;
  businessIds: number[];
  criteria: CriterionDraft[];
  questions: QuestionDraft[];
};

export const newClientId = (): string => globalThis.crypto.randomUUID();

export function emptyFormDraft(): FormDraft {
  return { programId: '', title: '', instructions: '', businessIds: [], criteria: [], questions: [] };
}

export function draftFromDetail(form: JudgingFormDetail): FormDraft {
  return {
    programId: String(form.programId),
    title: form.title,
    instructions: form.instructions,
    businessIds: form.businesses.map(business => business.id),
    criteria: form.criteria.map(criterion => ({ ...criterion, maxScore: String(criterion.maxScore) })),
    questions: form.questions.map(question => ({ ...question })),
  };
}

/** Error keys: title, programId, businessIds, items, criterion:<id>:label|maxScore|description, question:<id>:label. Values are English copy keys. */
export function validateFormDraft(draft: FormDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors.title = 'Enter a form title.';
  else if (draft.title.trim().length > 200) errors.title = 'Keep the title under 200 characters.';
  if (!(Number(draft.programId) >= 1)) errors.programId = 'Choose a program.';
  if (draft.instructions.length > 5000) errors.instructions = 'Keep instructions under 5,000 characters.';
  if (draft.businessIds.length < 1) errors.businessIds = 'Select at least one business.';
  else if (draft.businessIds.length > MAX_JUDGING_BUSINESSES) errors.businessIds = 'Select no more than 100 businesses.';
  if (draft.criteria.length + draft.questions.length < 1) errors.items = 'Add at least one scoring criterion or written question.';
  if (draft.criteria.length > MAX_JUDGING_ITEMS || draft.questions.length > MAX_JUDGING_ITEMS) errors.items = 'Use no more than 20 criteria and 20 questions.';
  const ids = new Set<string>();
  for (const criterion of draft.criteria) {
    if (ids.has(criterion.id)) errors.items = 'Each criterion and question needs a unique ID.';
    ids.add(criterion.id);
    if (!criterion.label.trim()) errors[`criterion:${criterion.id}:label`] = 'Enter a criterion label.';
    else if (criterion.label.trim().length > 200) errors[`criterion:${criterion.id}:label`] = 'Keep labels under 200 characters.';
    if (criterion.description.length > 1000) errors[`criterion:${criterion.id}:description`] = 'Keep descriptions under 1,000 characters.';
    const max = Number(criterion.maxScore);
    if (!criterion.maxScore.trim() || !Number.isInteger(max) || max < 1 || max > 100) errors[`criterion:${criterion.id}:maxScore`] = 'Use a whole number from 1 to 100.';
  }
  for (const question of draft.questions) {
    if (ids.has(question.id)) errors.items = 'Each criterion and question needs a unique ID.';
    ids.add(question.id);
    if (!question.label.trim()) errors[`question:${question.id}:label`] = 'Enter the question.';
    else if (question.label.trim().length > 500) errors[`question:${question.id}:label`] = 'Keep questions under 500 characters.';
  }
  return errors;
}

export function toFormInput(draft: FormDraft): JudgingFormInput {
  return {
    programId: Number(draft.programId),
    title: draft.title.trim(),
    instructions: draft.instructions.trim(),
    businessIds: [...new Set(draft.businessIds)],
    criteria: draft.criteria.map<JudgingCriterion>(criterion => ({
      id: criterion.id, label: criterion.label.trim(), description: criterion.description.trim(), maxScore: Number(criterion.maxScore),
    })),
    questions: draft.questions.map<JudgingQuestion>(question => ({ id: question.id, label: question.label.trim(), required: question.required })),
  };
}

/** Share URL keeps the bearer token in the fragment so it never reaches server logs or Referer headers. */
export function buildShareUrl(origin: string, baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${origin.replace(/\/+$/, '')}${base}/judging#${encodeURIComponent(token)}`;
}

export function readTokenFromHash(hash: string): string {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch { return ''; }
}

export type Identity = { judgeName: string; judgeEmail: string };
export type Assessment = { businessId: string; scores: Record<string, string>; answers: Record<string, string> };

export const emptyAssessment = (): Assessment => ({ businessId: '', scores: {}, answers: {} });
export function assessmentForBusiness(businessId: string, drafts: Record<string, Assessment>): Assessment {
  return drafts[businessId] ?? { ...emptyAssessment(), businessId };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Error keys: judgeName, judgeEmail, businessId, score:<id>, answer:<id>. */
export function validateResponse(form: Pick<PublicJudgingForm, 'criteria' | 'questions' | 'businesses'>, identity: Identity, assessment: Assessment): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = identity.judgeName.trim();
  if (!name) errors.judgeName = 'Enter your full name.';
  else if (name.length > 150) errors.judgeName = 'Keep your name under 150 characters.';
  const email = identity.judgeEmail.trim();
  if (!email) errors.judgeEmail = 'Enter your email address.';
  else if (email.length > 254 || !emailPattern.test(email)) errors.judgeEmail = 'Enter a valid email address, like name@example.com.';
  if (!form.businesses.some(business => String(business.id) === assessment.businessId)) errors.businessId = 'Choose the business you are assessing.';
  for (const criterion of form.criteria) {
    const raw = (assessment.scores[criterion.id] ?? '').trim();
    const value = Number(raw);
    if (!raw) errors[`score:${criterion.id}`] = 'Enter a score for this criterion.';
    else if (!Number.isFinite(value) || value < 0 || value > criterion.maxScore) errors[`score:${criterion.id}`] = 'Enter a score within the allowed range.';
  }
  for (const question of form.questions) {
    const text = assessment.answers[question.id] ?? '';
    if (question.required && !text.trim()) errors[`answer:${question.id}`] = 'This answer is required.';
    else if (text.length > MAX_ANSWER_LENGTH) errors[`answer:${question.id}`] = 'Keep answers under 4,000 characters.';
  }
  return errors;
}

export function buildResponsePayload(form: Pick<PublicJudgingForm, 'criteria' | 'questions'>, identity: Identity, assessment: Assessment): Omit<JudgingResponseInput, 'clientSubmissionId'> {
  return {
    businessId: Number(assessment.businessId),
    judgeName: identity.judgeName.trim(),
    judgeEmail: identity.judgeEmail.trim(),
    scores: form.criteria.map(criterion => ({ criterionId: criterion.id, score: Number(assessment.scores[criterion.id]) })),
    answers: form.questions.map(question => ({ questionId: question.id, text: (assessment.answers[question.id] ?? '').trim() })),
  };
}

export type SubmissionKey = { fingerprint: string; id: string } | null;

/** Reuse the same clientSubmissionId while the payload is unchanged (safe retry); rotate when it changes. */
export function submissionKeyFor(previous: SubmissionKey, payload: unknown, makeId: () => string = newClientId): { fingerprint: string; id: string } {
  const fingerprint = JSON.stringify(payload);
  return previous && previous.fingerprint === fingerprint ? previous : { fingerprint, id: makeId() };
}

export function errorStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status;
  return null;
}

export function serverErrorText(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null;
  const data = error.data;
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null;
}

export function publicLoadErrorMessage(status: number | null): string {
  if (status === 404) return 'This judging link is not valid. Check that you copied the full link, or ask the program team for a new one.';
  if (status === 410) return 'This judging form is closed and no longer accepts assessments.';
  if (status === 429) return 'Too many requests from this connection. Wait a minute, then try again.';
  if (status === 503) return 'Judging forms are temporarily unavailable. Please try again later.';
  return 'The judging form could not load. Check your connection and try again.';
}

export function publicSubmitErrorMessage(status: number | null): string {
  if (status === 400) return 'Some answers were not accepted. Review the highlighted fields and try again.';
  if (status === 404) return 'This judging link is no longer valid. Your answers are still here; contact the program team.';
  if (status === 409) return 'An assessment for this business has already been submitted with this email, or a previous attempt conflicted. Your answers are still here.';
  if (status === 410) return 'This form was closed before your assessment arrived. Your answers are still here; contact the program team.';
  if (status === 429) return 'Too many submissions from this connection. Wait a minute, then submit again. Your answers are still here.';
  if (status === 503) return 'The service is temporarily unavailable. Your answers are still here; try again shortly.';
  return 'Your assessment could not be sent. Your answers are still here; try again.';
}

export function staffErrorMessage(status: number | null, fallback: string): string {
  if (status === 400) return 'Some details were not accepted. Check the highlighted fields and try again.';
  if (status === 403) return 'You do not have access to this program.';
  if (status === 404) return 'This form could not be found.';
  if (status === 409) return 'This form is already open to judges, so its questions, scoring and businesses are locked.';
  if (status === 503) return 'Judging forms are temporarily unavailable. Please try again later.';
  return fallback;
}
