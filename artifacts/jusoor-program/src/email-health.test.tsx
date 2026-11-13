import assert from 'node:assert/strict';
import test from 'node:test';
import { emailHealthGuidance } from './email-health';
import { emailFailureLabel, emailOperationLabel } from './announcement-email-status';
import { loadArabicTranslations, translate } from './language';

await loadArabicTranslations();

test('Gmail health gives specific permission guidance in English and Arabic', () => {
  const text = emailHealthGuidance({
    step: 'lookup', status: 'failed', httpStatus: 403,
    reason: 'insufficientPermissions', failureKind: 'gmail_needs_reconnect',
  });
  assert.match(text, /missing permission to read mail/);
  assert.match(text, /tick all permission boxes/);
  assert.notEqual(translate(text, 'ar'), text);
});

test('Gmail health, failure reasons and operations have bilingual guidance', () => {
  for (const step of [
    { step: 'profile' as const, status: 'failed' as const, httpStatus: null, reason: null, failureKind: 'gmail_needs_reconnect' },
    { step: 'profile' as const, status: 'failed' as const, httpStatus: 401, reason: null, failureKind: 'gmail_needs_reconnect' },
    { step: 'lookup' as const, status: 'failed' as const, httpStatus: 429, reason: null, failureKind: 'gmail_quota' },
    { step: 'send' as const, status: 'failed' as const, httpStatus: null, reason: null, failureKind: 'delivery_outcome_unknown' },
    { step: 'send' as const, status: 'skipped' as const, httpStatus: null, reason: null, failureKind: null },
    { step: 'metadata' as const, status: 'ok' as const, httpStatus: 200, reason: null, failureKind: null },
  ]) {
    const text = emailHealthGuidance(step);
    assert.notEqual(translate(text, 'ar'), text);
  }
  for (const kind of ['quota', 'needs_reconnect', 'invalid_recipient', 'transient', 'ambiguous']) {
    const text = emailFailureLabel(kind);
    assert.notEqual(translate(text, 'ar'), text);
  }
  for (const op of ['profile_lookup', 'sent_message_lookup', 'send']) {
    const text = emailOperationLabel(op);
    assert.notEqual(translate(text, 'ar'), text);
  }
});
