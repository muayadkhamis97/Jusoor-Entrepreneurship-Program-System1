import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedOptionValues, updateMultiSelectValue } from './program-multiselect';

const programs = ['12', '24', '31'];

test('select all chooses every available program in stable option order', () => {
  assert.equal(updateMultiSelectValue('24', programs, null, true), '12,24,31');
});

test('select all can be cleared and individual selections can be toggled', () => {
  assert.equal(updateMultiSelectValue('12,24,31', programs, null, false), '');
  assert.equal(updateMultiSelectValue('12,24', programs, '31', true), '12,24,31');
  assert.equal(updateMultiSelectValue('12,24,31', programs, '24', false), '12,31');
});

test('selection is limited to currently available program options', () => {
  assert.deepEqual(selectedOptionValues('12,archived,31', programs), ['12', '31']);
  assert.deepEqual(selectedOptionValues('12,12,31', programs), ['12', '31']);
  assert.equal(updateMultiSelectValue('12,archived', programs, 'archived', true), '12');
});
