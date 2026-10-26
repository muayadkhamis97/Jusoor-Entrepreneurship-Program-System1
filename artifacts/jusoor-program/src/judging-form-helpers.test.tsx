import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessmentForBusiness, buildResponsePayload, buildShareUrl, emptyFormDraft, publicLoadErrorMessage, publicSubmitErrorMessage, readTokenFromHash,
  submissionKeyFor, toFormInput, validateFormDraft, validateResponse,
} from './judging-form-helpers';
import { getStaffNavigationItems } from './mobile-staff-navigation';
import { canAccessStaffNavigationPath } from './staff-navigation-items';
import { hasArabicTranslation, loadArabicTranslations } from './language';

await loadArabicTranslations();

const form = {
  criteria: [{ id: 'c1', label: 'Team', description: '', maxScore: 10 }],
  questions: [{ id: 'q1', label: 'Strengths', required: true }, { id: 'q2', label: 'Other', required: false }],
  businesses: [{ id: 7, name: 'Alpha' }, { id: 8, name: 'Beta' }],
};
test('business changes keep drafts separate and never carry scores into another business', () => {
  const draft = { businessId: '201', scores: { c1: '7' }, answers: { q1: 'Business A recommendation' } };
  const drafts = { '201': draft };
  assert.deepEqual(assessmentForBusiness('202', drafts), { businessId: '202', scores: {}, answers: {} });
  assert.deepEqual(assessmentForBusiness('201', drafts), draft);
  assert.notEqual(assessmentForBusiness('203', drafts).scores, assessmentForBusiness('204', drafts).scores);
});

test('form drafts need program, title, business and at least one item', () => {
  const errors = validateFormDraft(emptyFormDraft());
  assert.ok(errors.title && errors.programId && errors.businessIds && errors.items);
  const ok = { ...emptyFormDraft(), programId: '2', title: ' Demo day ', businessIds: [3, 3], questions: [{ id: 'q', label: ' Why? ', required: true }] };
  assert.deepEqual(validateFormDraft(ok), {});
  const input = toFormInput(ok);
  assert.equal(input.title, 'Demo day');
  assert.deepEqual(input.businessIds, [3]);
  assert.equal(input.questions[0].label, 'Why?');
});

test('form drafts reject whitespace labels, bad max scores and duplicate ids', () => {
  const draft = { ...emptyFormDraft(), programId: '1', title: 'x', businessIds: [1],
    criteria: [{ id: 'a', label: '  ', description: '', maxScore: '0' }], questions: [{ id: 'a', label: 'ok', required: false }] };
  const errors = validateFormDraft(draft);
  assert.ok(errors['criterion:a:label']);
  assert.ok(errors['criterion:a:maxScore']);
  assert.equal(errors.items, 'Each criterion and question needs a unique ID.');
  assert.ok(validateFormDraft({ ...draft, criteria: [{ id: 'b', label: 'x', description: '', maxScore: '2.5' }] })['criterion:b:maxScore']);
});

test('scores start blank and are required; optional answers may be blank', () => {
  const identity = { judgeName: 'Sam', judgeEmail: 'sam@example.com' };
  const blank = validateResponse(form, identity, { businessId: '7', scores: {}, answers: { q1: 'Good' } });
  assert.ok(blank['score:c1']);
  const over = validateResponse(form, identity, { businessId: '7', scores: { c1: '11' }, answers: { q1: 'Good' } });
  assert.ok(over['score:c1']);
  const ok = validateResponse(form, identity, { businessId: '7', scores: { c1: '0' }, answers: { q1: 'Good' } });
  assert.deepEqual(ok, {});
  assert.ok(validateResponse(form, identity, { businessId: '7', scores: { c1: '3' }, answers: { q1: '   ' } })['answer:q1']);
  assert.ok(validateResponse(form, { judgeName: '', judgeEmail: 'nope' }, { businessId: '99', scores: { c1: '3' }, answers: { q1: 'a' } }).businessId);
  const payload = buildResponsePayload(form, identity, { businessId: '7', scores: { c1: '4' }, answers: { q1: ' Good ' } });
  assert.deepEqual(payload.scores, [{ criterionId: 'c1', score: 4 }]);
  assert.deepEqual(payload.answers, [{ questionId: 'q1', text: 'Good' }, { questionId: 'q2', text: '' }]);
});

test('retry key is stable for unchanged payloads and rotates when changed', () => {
  let n = 0; const make = () => `id-${++n}`;
  const first = submissionKeyFor(null, { a: 1 }, make);
  assert.equal(submissionKeyFor(first, { a: 1 }, make).id, first.id);
  const changed = submissionKeyFor(first, { a: 2 }, make);
  assert.notEqual(changed.id, first.id);
  assert.notEqual(submissionKeyFor(null, { a: 2 }, make).id, changed.id);
});

test('share URL keeps the token in the fragment only', () => {
  const url = buildShareUrl('https://hub.example', '/app/', 'tok/en+1');
  assert.equal(url, 'https://hub.example/app/judging#tok%2Fen%2B1');
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  assert.ok(!parsed.pathname.includes('tok'));
  assert.equal(readTokenFromHash(parsed.hash), 'tok/en+1');
  assert.equal(buildShareUrl('https://hub.example', '/', 'x'), 'https://hub.example/judging#x');
  assert.equal(readTokenFromHash(''), '');
});

test('server statuses map to distinct guidance with Arabic copy', () => {
  const messages = [404, 410, 429, 503].map(publicLoadErrorMessage).concat([400, 404, 409, 410, 429, 503].map(publicSubmitErrorMessage));
  for (const message of messages) assert.ok(hasArabicTranslation(message), message);
  assert.notEqual(publicSubmitErrorMessage(409), publicSubmitErrorMessage(400));
});

test('share-link replacement confirmation and feedback have Arabic translations', () => {
  for (const message of [
    'Replace link', 'REPLACE SHARE LINK', 'Replace this judging link?', 'Replacing…', 'Keep current link',
    'ASSESSMENT COVERAGE', 'Submitted assessments grouped by selected business.', 'No assessments yet.', 'assessment', 'assessments',
    'The current link will stop loading and accepting submissions immediately. Existing assessments and the locked rubric will remain unchanged. The replacement link only accepts new assessments while the form is open.',
    'Replacing the link stops the old link immediately. Submitted assessments and the locked rubric stay unchanged.',
    'The link was replaced. Share the new link with judges; the previous link no longer works.',
    'The share link could not be replaced. Try again.',
  ]) assert.ok(hasArabicTranslation(message), message);
});

test('judging forms navigation is limited to operational staff roles', () => {
  assert.ok(canAccessStaffNavigationPath('coordinator', '/judging-forms'));
  assert.ok(canAccessStaffNavigationPath('staff', '/judging-forms'));
  for (const role of ['trainer', 'mentor', 'judge'] as const) assert.ok(!canAccessStaffNavigationPath(role, '/judging-forms'));
  assert.ok(getStaffNavigationItems('staff').some(item => item.href === '/judging-forms'));
});
