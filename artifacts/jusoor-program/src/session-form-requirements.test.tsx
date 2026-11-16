import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadArabicTranslations, translate } from './language';
import { getSessionProgramTimeZone, getSessionTimeIssue, sessionProgramField, sessionTimeIssueMessage } from './session-form-requirements';

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

test('session editor displays the selected program time zone beside the date', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

  assert.match(app, /renderFieldSupplement=\{\(field, values\) => field\.name === 'scheduledDate'/);
  assert.match(app, /getSessionProgramTimeZone\(programsQuery\.data \|\| \[\], values\.programId\)/);
  assert.match(app, /data-testid="session-program-timezone"/);
});

test('session time zone display follows the selected program and legacy default', () => {
  const programs = [
    { id: 4, timeZone: 'America/New_York' },
    { id: 9, timeZone: 'Europe/London' },
  ];

  assert.equal(getSessionProgramTimeZone(programs, '4'), 'America/New_York');
  assert.equal(getSessionProgramTimeZone(programs, '9'), 'Europe/London');
  assert.equal(getSessionProgramTimeZone(programs, ''), 'Asia/Amman');
  assert.equal(getSessionProgramTimeZone([{ id: 4, timeZone: null }], '4'), 'Asia/Amman');
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

  assert.notEqual(translate('Session time zone', 'ar'), 'Session time zone');
  for (const issue of ['nonexistent', 'repeated', 'invalid-time-zone'] as const) {
    const message = sessionTimeIssueMessage(issue);
    assert.notEqual(translate(message, 'ar'), message);
  }
});
