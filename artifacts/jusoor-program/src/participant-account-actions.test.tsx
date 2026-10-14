import assert from 'node:assert/strict';
import test from 'node:test';
import { getParticipantAccountRedirectUrl } from './participant-account-actions';
import { translate } from './language';

test('participant sign-out and account switching stay on the app base path', () => {
  assert.equal(getParticipantAccountRedirectUrl('sign-out', '/'), '/');
  assert.equal(getParticipantAccountRedirectUrl('switch-account', '/'), '/participant');
  assert.equal(getParticipantAccountRedirectUrl('sign-out', '/jusoor/'), '/jusoor/');
  assert.equal(getParticipantAccountRedirectUrl('switch-account', '/jusoor/'), '/jusoor/participant');
});

test('participant account actions have Arabic labels and feedback', () => {
  assert.equal(translate('Sign out', 'ar'), 'تسجيل الخروج');
  assert.equal(translate('Switch account', 'ar'), 'تبديل الحساب');
  assert.equal(translate('Signing out…', 'ar'), 'جارٍ تسجيل الخروج…');
  assert.equal(translate('Sign out failed. Please try again.', 'ar'), 'تعذّر تسجيل الخروج. حاول مرة أخرى.');
});
