import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('booking drafts stay local during refresh and clear only on save or explicit discard', () => {
  const hook = read('./use-mentor-booking-draft.ts');
  assert.match(hook, /if \(!dirtyRef.current && !pendingRef.current\) apply\(next, true\)/);
  assert.match(hook, /googleCalendarBookingUrl.trim\(\) === b.googleCalendarBookingUrl.trim\(\)/);
  assert.match(hook, /window.confirm/);
  assert.match(hook, /window.addEventListener\('beforeunload'/);
  assert.match(hook, /window.removeEventListener\('beforeunload'/);
  assert.doesNotMatch(hook, /sessionStorage|localStorage/);
  const surface = read('./role-surfaces.tsx');
  assert.match(surface, /useMentorBookingDraft\(query.data, saveBookingSettings.isPending\)/);
  assert.match(surface, /beforeLeave=\{confirmLeave\}/);
  assert.match(surface, /data-testid="button-discard-booking-draft"/);
  assert.match(surface, /onSuccess: saved => \{ markSaved\(saved\);/);
});

test('navigation guard tracks same-document history and restores a cancelled pop', () => {
  const guard = read('./unsaved-navigation.ts');
  assert.match(guard, /history.pushState =/);
  assert.match(guard, /history.replaceState =/);
  assert.match(guard, /history.go\(targetIndex === undefined \? 1 : currentIndex - targetIndex\)/);
  assert.match(guard, /event.stopImmediatePropagation\(\)/);
  assert.match(read('./main.tsx'), /installUnsavedNavigationGuard\(\)/);
});
