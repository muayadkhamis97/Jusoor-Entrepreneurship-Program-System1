import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const surface = readFileSync(new URL('./role-surfaces.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const translations = readFileSync(new URL('./language.tsx', import.meta.url), 'utf8');

test('mentor settings route stays inside the existing mentor role guard', () => {
  assert.match(router, /if \(activeRole && availableRoles\.includes/);
  assert.match(router, /activeRole === 'mentor' && \(location === '\/mentor' \|\| location === '\/mentor\/settings'\)/);
  assert.match(router, /settingsOnly=\{location === '\/mentor\/settings'\}/);
  assert.match(surface, /role === 'mentor' && <nav/);
  assert.match(surface, /href="\/mentor\/settings"[^>]*data-testid="link-mentor-settings"/);
  assert.match(surface, /href="\/mentor"[^>]*aria-current=/);
});

test('connected dashboard replaces setup with status and a settings link', () => {
  assert.match(surface, /bookingConnected = Boolean\(dashboard\?\.googleCalendarConnected \|\| dashboard\?\.calendlyBookingUrl\)/);
  assert.match(surface, /!settingsOnly && dashboard && !query\.isError && bookingConnected && <section[^>]*data-testid="mentor-booking-connected"/);
  assert.match(surface, /dashboard && !query\.isError && \(settingsOnly \|\| !bookingConnected\) && <section[^>]*data-testid="mentor-booking-settings"/);
  assert.match(surface, /href="\/mentor\/settings" className="text-link"/);
  assert.match(surface, /!settingsOnly && query\.data && \(engagements\.length/);
});

test('settings preserves existing save, reconnect, disconnect and OAuth notice flows', () => {
  assert.match(surface, /<form[^>]*onSubmit=\{saveBooking\}/);
  assert.match(surface, /saveBookingSettings\.mutate\(\{ data \}, \{\s*onSuccess: \(\) => invalid\(client, getGetMentorDashboardQueryKey\(\)\)/);
  for (const id of ['button-connect-calendly', 'button-connect-google-calendar', 'button-disconnect-google-calendar', 'input-google-calendar-booking-url', 'button-save-booking-settings']) {
    assert.ok(surface.includes(`data-testid="${id}"`), id);
  }
  assert.match(surface, /bookingNotice && <p role="status">\{t\(bookingNotice\)\}/);
  for (const label of ['Settings', 'Mentor navigation', 'Mentor workspace', 'MENTOR SETTINGS', 'Booking settings', 'Manage booking settings', 'Manage your connected booking accounts and appointment-schedule link.', 'Google account connected. Manage your appointment-schedule link in Settings.', 'Add your appointment-schedule link in Settings so founders can book with you.']) {
    assert.ok(translations.includes(`'${label}': '`), label);
  }
});
