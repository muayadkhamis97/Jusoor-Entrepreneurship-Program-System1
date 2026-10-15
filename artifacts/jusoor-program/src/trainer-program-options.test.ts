import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainerProgramOptions } from './trainer-program-options';

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
