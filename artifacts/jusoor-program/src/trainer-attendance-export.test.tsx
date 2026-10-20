import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrainerAttendanceReport } from '@workspace/api-client-react';
import { buildTrainerAttendanceCsv, buildTrainerAttendanceSheetRows } from './trainer-attendance-export';

const report = (overrides: Partial<TrainerAttendanceReport> = {}): TrainerAttendanceReport => ({
  sessionId: 17,
  sessionTitle: 'Business planning',
  scheduledDate: '2026-10-19',
  attendance: [
    {
      participantId: 41,
      participantName: 'Lina Haddad',
      participantEmail: 'lina@example.org',
      businessId: 8,
      businessName: 'Northstar Foods',
      status: 'present',
      notes: 'Joined the discussion.',
      markedAt: '2026-10-19T11:00:00.000Z',
      source: 'zoom',
      attendedSeconds: 3599,
      firstJoinedAt: '2026-10-19T10:00:00.000Z',
      lastLeftAt: '2026-10-19T11:00:00.000Z',
    },
    {
      participantId: 42,
      participantName: 'Omar Saleh',
      participantEmail: 'omar@example.org',
      businessId: 8,
      businessName: 'Northstar Foods',
      status: null,
      notes: null,
      markedAt: null,
      source: null,
      attendedSeconds: null,
      firstJoinedAt: null,
      lastLeftAt: null,
    },
  ],
  zoomSync: {
    status: 'completed',
    attempts: 1,
    participantCount: 2,
    matchedCount: 1,
    unmatchedCount: 1,
    lastAttemptAt: '2026-10-19T11:10:00.000Z',
    syncedAt: '2026-10-19T11:10:00.000Z',
    lastError: null,
  },
  unmatchedParticipants: [{
    id: 91,
    displayName: 'Guest Attendee',
    email: 'guest@example.org',
    joinTime: '2026-10-19T10:05:00.000Z',
    leaveTime: '2026-10-19T10:35:00.000Z',
    durationSeconds: 1800,
    matchedParticipantId: null,
    matchedParticipantName: null,
    ignoredAt: null,
  }],
  ...overrides,
});

test('attendance sheet has one row per roster participant and unmatched Zoom attendee', () => {
  const rows = buildTrainerAttendanceSheetRows([report()]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.recordType), [
    'Participant attendance',
    'Participant attendance',
    'Unmatched attendee',
  ]);
  assert.equal(rows[0].minutesAttended, 60);
  assert.equal(rows[1].status, 'Not recorded');
  assert.equal(rows[2].unmatchedEmail, 'guest@example.org');
  assert.equal(rows[2].minutesAttended, 30);
  assert.equal(rows[2].zoomUnmatchedCount, 1);
});

test('attendance CSV combines all sessions and fields in one spreadsheet-safe file', () => {
  const csv = buildTrainerAttendanceCsv([
    report({ sessionTitle: '=1+1' }),
    report({
      sessionId: 18,
      sessionTitle: 'Follow-up',
      attendance: [],
      unmatchedParticipants: [],
      zoomSync: null,
    }),
  ]);
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(lines.length, 5, 'one header, three attendee rows, and one empty-session summary');
  assert.match(lines[1], /"'=1\+1"/);
  assert.match(lines[1], /"Northstar Foods","Lina Haddad"/);
  assert.match(lines[1], /"present","zoom","60"/);
  assert.match(lines[3], /"Unmatched attendee","","Guest Attendee","guest@example\.org"/);
  assert.match(lines[4], /"18","Follow-up","2026-10-19","Session summary"/);
});
