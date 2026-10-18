import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionProgramField } from './session-form-requirements';

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
