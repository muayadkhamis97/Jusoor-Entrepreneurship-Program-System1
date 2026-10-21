import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrainerAttendanceEmptyState, updateTrainerIdSet } from './trainer-dashboard-state';

test('attendance empty state distinguishes missing assignments from unrecorded attendance', () => {
  assert.equal(getTrainerAttendanceEmptyState(0, 0), 'no-assigned-sessions');
  assert.equal(getTrainerAttendanceEmptyState(2, 0), 'no-attendance-yet');
  assert.equal(getTrainerAttendanceEmptyState(2, 1), null);
});

test('per-item mutation state updates do not change other cards', () => {
  const pending = updateTrainerIdSet(new Set([11]), 22, true);
  assert.deepEqual([...pending].sort(), [11, 22]);

  const settled = updateTrainerIdSet(pending, 22, false);
  assert.deepEqual([...settled], [11]);
});
