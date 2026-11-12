import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canAccessStaffNavigationPath,
  getMobilePrimaryNavigationItems,
  getStaffNavigationItems,
  groupStaffNavigationItems,
} from './staff-navigation-items';

const adminPages = ['/analytics', '/branding', '/api-integrations', '/grants', '/applications', '/mentor-booking', '/team', '/profiles', '/access'];

test('Admin-only functions are absent from staff panels and denied by the same navigation policy', () => {
  const staffPaths = getStaffNavigationItems('staff').map(item => item.href);
  for (const path of adminPages) {
    assert.ok(!staffPaths.includes(path), path);
    assert.equal(canAccessStaffNavigationPath('staff', path), false, path);
    assert.equal(canAccessStaffNavigationPath('coordinator', path), true, path);
  }
});

test('Program Staff retain permitted read and operational functions', () => {
  for (const path of ['/', '/programs', '/businesses', '/sessions', '/support', '/communications', '/chat', '/mentor-meeting-reports', '/pitches', '/judging-forms', '/google-sheets', '/courses', '/team-assignments', '/profile']) {
    assert.equal(canAccessStaffNavigationPath('staff', path), true, path);
  }
  assert.equal(canAccessStaffNavigationPath('staff', '/support/?type=mentor'), true);
  assert.equal(canAccessStaffNavigationPath('staff', '/team/'), false);
  assert.equal(canAccessStaffNavigationPath('staff', '/unknown'), false);
});

test('Admin routes are grouped and fit a four-tab mobile bar without losing destinations', () => {
  const items = getStaffNavigationItems('coordinator');
  const sections = groupStaffNavigationItems(items);
  const primary = getMobilePrimaryNavigationItems(items);
  const primaryPaths = new Set(primary.map(item => item.href));
  const overflow = items.filter(item => !primaryPaths.has(item.href));

  assert.deepEqual(sections.map(section => section.group), ['Operations', 'Learning', 'Communication', 'Settings']);
  assert.deepEqual(sections.flatMap(section => section.items.map(item => item.href)).sort(), items.map(item => item.href).sort());
  assert.deepEqual(primary.map(item => item.href), ['/', '/businesses', '/programs', '/sessions']);
  assert.equal(primary.length, 4);
  assert.equal(new Set([...primary, ...overflow].map(item => item.href)).size, items.length);
});

test('specialist accounts never inherit the Program Staff operations panel', () => {
  for (const role of ['mentor', 'trainer', 'judge'] as const) {
    assert.deepEqual(getStaffNavigationItems(role).map(item => item.href), ['/profile']);
    for (const path of ['/', '/support', '/businesses', ...adminPages]) {
      assert.equal(canAccessStaffNavigationPath(role, path), false, `${role}: ${path}`);
    }
  }
});

test('page access and shell navigation consume the same policy without a staff fallback', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(app, /getStaffNavigationItems\(staff\.primaryRole\)/);
  assert.match(app, /return canAccessStaffNavigationPath\(staff\.primaryRole, path\)/);
  const dialog = readFileSync(new URL('./business-participants-dialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /isAdmin && <section className="business-participant-invite"/);
  assert.doesNotMatch(dialog, /Only Admins can invite participants/);
});
