import assert from 'node:assert/strict';
import test from 'node:test';
import { loadArabicTranslations, translate } from './language';
import { mentorDigestStatusGuidance, mentorDigestStatusLabel } from './mentor-digest-status';

await loadArabicTranslations();

test('digest statuses have distinct labels, and uncertain deliveries explain the hold', () => {
  assert.equal(mentorDigestStatusLabel('failed'), 'Email failed');
  assert.equal(mentorDigestStatusLabel('uncertain'), 'Email delivery uncertain');

  const guidance = mentorDigestStatusGuidance('uncertain');
  assert.ok(guidance);
  assert.match(guidance, /held for review/);
  assert.match(guidance, /not retried automatically/);
  assert.notEqual(translate(guidance, 'ar'), guidance);
  assert.equal(mentorDigestStatusGuidance('failed'), null);
});
