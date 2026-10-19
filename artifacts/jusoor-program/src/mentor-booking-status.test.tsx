import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hasMentorBookingConnection, mentorBookingConnectionSummary } from './mentor-booking-status';

const unconnected = {
  calendlyConnected: false,
  googleCalendarConnected: false,
  calendlyFollowUpDate: null,
  calendlyFollowUpNote: null,
};

test('either Google Calendar or Calendly removes the need for connection follow-up', () => {
  assert.equal(hasMentorBookingConnection(unconnected), false);
  assert.equal(hasMentorBookingConnection({ ...unconnected, googleCalendarConnected: true }), true);
  assert.equal(hasMentorBookingConnection({ ...unconnected, calendlyConnected: true }), true);
  assert.equal(hasMentorBookingConnection({ ...unconnected, googleCalendarConnected: true, calendlyConnected: true }), true);
});

test('a Google-only connected mentor has no pending or unrecorded follow-up count', () => {
  assert.deepEqual(mentorBookingConnectionSummary([
    { ...unconnected, googleCalendarConnected: true },
  ]), { connectedCount: 1, pendingCount: 0, needsFollowUpCount: 0 });
});

test('counts deduplicate dual connections and preserve unconnected recorded follow-ups', () => {
  assert.deepEqual(mentorBookingConnectionSummary([
    unconnected,
    { ...unconnected, calendlyFollowUpNote: 'Contacted' },
    { ...unconnected, calendlyFollowUpDate: '2026-10-01' },
    { ...unconnected, googleCalendarConnected: true, calendlyFollowUpDate: '2026-10-01' },
    { ...unconnected, calendlyConnected: true },
    { ...unconnected, googleCalendarConnected: true, calendlyConnected: true },
  ]), { connectedCount: 3, pendingCount: 3, needsFollowUpCount: 1 });
  assert.deepEqual(mentorBookingConnectionSummary([]), { connectedCount: 0, pendingCount: 0, needsFollowUpCount: 0 });
});

test('page, filter and follow-up editor use provider-neutral connection rules and labels', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(hasMentorBookingConnection\(mentor\)\) return false/);
  assert.match(source, /if \(hasMentorBookingConnection\(mentor\)\) \{\s*return <span[^>]*>\{t\('Not needed'\)\}/);
  assert.match(source, /mentorBookingConnectionSummary\(mentors\)/);
  assert.match(source, /label="Booking account connected"/);
  assert.match(source, /t\('still need a booking connection'\)/);
  assert.doesNotMatch(source, /still need Calendly|have not connected Calendly/);
  const translations = readFileSync(new URL('./language.tsx', import.meta.url), 'utf8');
  for (const label of [
    'Booking account connected',
    'Google Calendar or Calendly connected',
    'still need a booking connection',
    'See booking connections and keep track of follow-ups for mentors who have not connected a booking account.',
  ]) assert.ok(translations.includes(`'${label}': '`), label);
});
