import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProgramSelection } from './program-selection';

test('program selection only restores an id present in the current authorized options', () => {
  const authorizedPrograms = [{ id: 4 }, { id: 9 }];
  assert.equal(resolveProgramSelection(9, authorizedPrograms), 9);
  assert.equal(resolveProgramSelection(31, authorizedPrograms), null);
  assert.equal(resolveProgramSelection(null, authorizedPrograms), null);
});

test('pages that require a selected program default to the first authorized option', () => {
  assert.equal(resolveProgramSelection(null, [{ id: 4 }, { id: 9 }], true), 4);
  assert.equal(resolveProgramSelection(31, [{ id: 4 }, { id: 9 }], true), 4);
  assert.equal(resolveProgramSelection(9, [{ id: 4 }, { id: 9 }], true), 9);
  assert.equal(resolveProgramSelection(null, [], true), null);
});
