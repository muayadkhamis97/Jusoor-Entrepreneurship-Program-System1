import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainerProgramOptions, trainerSessionOptions } from './trainer-program-options';

test('trainer assignment choices use authorized program names instead of numeric cohort ids', () => {
  assert.deepEqual(
    trainerProgramOptions([
      { id: 12, name: 'Jusoor Growth Lab 2026' },
      { id: 31, name: 'Women in Tech Cohort' },
    ], 'Program name unavailable'),
    [
      { id: 12, label: 'Jusoor Growth Lab 2026' },
      { id: 31, label: 'Women in Tech Cohort' },
    ],
  );
});

test('missing or blank program names show a useful fallback without exposing ids', () => {
  assert.deepEqual(
    trainerProgramOptions([
      { id: 12, name: null },
      { id: 31, name: '  ' },
    ], 'Program name unavailable'),
    [
      { id: 12, label: 'Program name unavailable' },
      { id: 31, label: 'Program name unavailable' },
    ],
  );
});

test('trainer assignment session choices include only sessions from the selected program', () => {
  const sessions = [
    { id: 101, programId: 12, title: 'Customer discovery' },
    { id: 202, programId: 31, title: 'Product planning' },
    { id: 303, programId: null, title: 'Unlinked session' },
  ];

  assert.deepEqual(trainerSessionOptions(sessions, 12), [
    { id: 101, title: 'Customer discovery' },
  ]);
  assert.deepEqual(trainerSessionOptions(sessions, 31), [
    { id: 202, title: 'Product planning' },
  ]);
});

test('trainer assignment session choices are empty without a selected program or program sessions', () => {
  const sessions = [
    { id: 101, programId: 12, title: 'Customer discovery' },
  ];

  assert.deepEqual(trainerSessionOptions(sessions, null), []);
  assert.deepEqual(trainerSessionOptions(sessions, 31), []);
});
