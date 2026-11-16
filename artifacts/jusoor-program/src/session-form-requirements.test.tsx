import assert from 'node:assert/strict';
import test from 'node:test';
import { loadArabicTranslations, translate } from './language';
import { getSessionTimeIssue, sessionProgramField, sessionTimeIssueMessage } from './session-form-requirements';

const programs = [
  { id: 4, name: 'Growth Lab' },
  { id: 9, name: 'Startup Studio' },
];

test('Program Staff must choose an assigned cohort and get guidance if none are listed', () => {
  const field = sessionProgramField(programs, false);

  assert.equal(field.required, true);
  assert.equal(field.hint, 'Choose an assigned cohort. If none are listed, ask an admin to assign you to one.');
  assert.deepEqual(field.options, [
    { value: '4', label: 'Growth Lab' },
    { value: '9', label: 'Startup Studio' },
  ]);
});

test('Admin may leave the cohort blank to schedule a session for all cohorts', () => {
  const field = sessionProgramField(programs, true);

  assert.equal(field.required, false);
  assert.equal(field.hint, undefined);
});

test('session scheduling detects local times skipped by spring-forward', () => {
  const issue = getSessionTimeIssue('2026-03-08', '02:30', 'America/New_York');

  assert.equal(issue, 'nonexistent');
  assert.match(sessionTimeIssueMessage(issue!), /Choose another start time before saving/);
});

test('session scheduling detects local times repeated by fall-back', () => {
  const issue = getSessionTimeIssue('2026-11-01', '01:30', 'America/New_York');

  assert.equal(issue, 'repeated');
  assert.match(sessionTimeIssueMessage(issue!), /occurs twice/);
  assert.equal(getSessionTimeIssue('2026-11-01', '03:30', 'America/New_York'), null);
});

test('daylight-saving scheduling warnings are translated into Arabic', async () => {
  await loadArabicTranslations();

  for (const issue of ['nonexistent', 'repeated', 'invalid-time-zone'] as const) {
    const message = sessionTimeIssueMessage(issue);
    assert.notEqual(translate(message, 'ar'), message);
  }
});
