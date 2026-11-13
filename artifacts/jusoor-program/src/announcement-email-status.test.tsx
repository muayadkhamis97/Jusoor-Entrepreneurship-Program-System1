import assert from 'node:assert/strict';
import test from 'node:test';
import { announcementEmailStateMessage } from './announcement-email-status';
import { loadArabicTranslations, translate } from './language';

await loadArabicTranslations();

test('announcement email pause and reconnect messages are clear in English and Arabic', () => {
  const quotaMessage = announcementEmailStateMessage('quota_paused');
  assert.match(quotaMessage, /daily Gmail sending limit/);
  assert.match(quotaMessage, /resume automatically/);
  assert.notEqual(translate(quotaMessage, 'ar'), quotaMessage);

  const reconnectMessage = announcementEmailStateMessage('needs_reconnect');
  assert.match(reconnectMessage, /reconnect the Gmail connection/);
  assert.notEqual(translate(reconnectMessage, 'ar'), reconnectMessage);
  assert.notEqual(
    translate('Some recipient addresses were rejected and will not be retried.', 'ar'),
    'Some recipient addresses were rejected and will not be retried.',
  );
});
