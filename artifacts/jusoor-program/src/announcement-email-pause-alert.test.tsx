import assert from 'node:assert/strict';
import test from 'node:test';
import { announcementEmailPauseMessage } from './announcement-email-pause-alert';
import { loadArabicTranslations, translate } from './language';

await loadArabicTranslations();

test('announcement pause alert distinguishes quota and reconnect states in English and Arabic', () => {
  const cases = [
    [{ quotaPaused: true, reconnectPaused: false }, 'Announcement emails are paused because Gmail has reached a sending limit.'],
    [{ quotaPaused: false, reconnectPaused: true }, 'Announcement emails are paused because Gmail needs to be reconnected.'],
    [{ quotaPaused: true, reconnectPaused: true }, 'Announcement emails are paused due to a Gmail sending limit or connection issue.'],
  ] as const;
  for (const [state, expected] of cases) {
    const message = announcementEmailPauseMessage(state);
    assert.equal(message, expected);
    assert.notEqual(translate(message!, 'ar'), message);
  }
  assert.equal(announcementEmailPauseMessage({ quotaPaused: false, reconnectPaused: false }), null);
  for (const message of [
    'Portal announcements remain available while email is paused.',
    'Next scheduled email check:',
    'Review email health',
  ]) {
    assert.notEqual(translate(message, 'ar'), message);
  }
});

test('pause alert links directly to Communications with Email health selected', async () => {
  const { readFile } = await import('node:fs/promises');
  const component = await readFile(new URL('./announcement-email-pause-alert.tsx', import.meta.url), 'utf8');
  assert.match(component, /href="\/communications\?emailHealth=1"/);
  assert.match(component, /refetchInterval: 30_000/);
});
