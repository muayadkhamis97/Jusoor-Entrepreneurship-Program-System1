import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bookingSaveMessages as messages, mentorBookingSaveError as explain } from './mentor-booking-errors';

test('known API URL errors identify the schedule input', () => {
  for (const error of ['Enter a Google Calendar appointment-schedule link.', 'Add your public Google Calendar appointment-schedule link first.']) {
    assert.deepEqual(explain({ status: 400, data: { error } }), { message: messages.url, field: 'url' });
  }
});

test('missing provider connections get distinct guidance without blaming the URL', () => {
  assert.deepEqual(explain({ status: 400, data: { error: 'Connect Google Calendar before selecting it as your booking provider.' } }), { message: messages.googleConnection });
  assert.deepEqual(explain({ status: 400, data: { error: 'Connect Calendly before selecting it as your booking provider.' } }), { message: messages.calendlyConnection });
});

test('session, permission, service, network and unknown validation failures are distinguished safely', () => {
  for (const [status, message] of [[401, messages.authentication], [403, messages.access], [429, messages.rateLimit], [500, messages.server], [503, messages.server], [400, messages.validation], [422, messages.validation], [404, messages.server], [0, messages.network]] as const) {
    assert.deepEqual(explain({ status, data: { error: 'Private server details must never appear' } }), { message });
  }
  for (const error of [new TypeError('Failed to fetch: private URL'), null, undefined, 'private text']) {
    assert.deepEqual(explain(error), { message: messages.network });
  }
  assert.deepEqual(explain({ status: 503, data: { error: 'Enter a Google Calendar appointment-schedule link.' } }), { message: messages.server });
});

test('all safe messages have Arabic translations and errors are wired accessibly', () => {
  const language = readFileSync(new URL('./arabic-translations.ts', import.meta.url), 'utf8');
  for (const message of Object.values(messages)) assert.ok(language.includes(`'${message}': '`), message);
  const source = readFileSync(new URL('./role-surfaces.tsx', import.meta.url), 'utf8');
  assert.match(source, /mentorBookingSaveError\(saveBookingSettings.error\)/);
  assert.match(source, /aria-invalid=\{bookingSaveError\?\.field === 'url'/);
  assert.match(source, /aria-describedby=.*mentor-booking-url-help.*mentor-booking-url-error/);
  assert.match(source, /id="mentor-booking-url-error" className="form-error" role="alert"/);
  assert.match(source, /bookingUrlInput.current\?\.focus\(\)/);
  assert.match(source, /setGoogleCalendarBookingUrl\(event.target.value\); saveBookingSettings.reset\(\)/);
  assert.doesNotMatch(source, /Confirm the selected account is connected and the schedule link is valid/);
});
