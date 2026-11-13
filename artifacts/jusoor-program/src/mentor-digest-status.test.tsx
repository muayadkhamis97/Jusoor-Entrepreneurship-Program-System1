import assert from 'node:assert/strict';
import test from 'node:test';
import { loadArabicTranslations, translate } from './language';
import { mentorDigestStatusGuidance, mentorDigestStatusLabel } from './mentor-digest-status';

await loadArabicTranslations();

test('digest statuses have distinct labels, and uncertain deliveries explain the hold', () => {
  assert.equal(mentorDigestStatusLabel('failed'), 'Email failed');
  assert.equal(mentorDigestStatusLabel('uncertain'), 'Email delivery uncertain');
  assert.equal(mentorDigestStatusLabel('retry_authorized'), 'Retry authorized');

  const guidance = mentorDigestStatusGuidance('uncertain');
  assert.ok(guidance);
  assert.match(guidance, /Delivery is on hold/);
  assert.match(guidance, /only after confirming the message is absent/);
  assert.notEqual(translate(guidance, 'ar'), guidance);
  assert.equal(mentorDigestStatusGuidance('failed'), null);
  const authorizedGuidance = mentorDigestStatusGuidance('retry_authorized');
  assert.ok(authorizedGuidance);
  assert.notEqual(translate(authorizedGuidance, 'ar'), authorizedGuidance);
});
