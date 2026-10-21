import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StaffMentorMeetingReport } from '@workspace/api-client-react';
import { buildStaffMentorMeetingReportsCsv } from './mentor-meeting-reports-export';

const report = (overrides: Partial<StaffMentorMeetingReport> = {}): StaffMentorMeetingReport => ({
  id: 31,
  programId: 8,
  programName: 'Growth Lab',
  businessId: 12,
  businessName: 'Northstar Foods',
  meetingDate: '2026-10-19',
  meetingProvider: 'google_calendar',
  meetingId: 118,
  coachName: 'Sam Coach',
  coachEmail: 'sam@example.org',
  attendees: ['Lina Haddad', 'Omar Saleh'],
  sessionSummary: 'Introductions, highlights\nand next steps.',
  smartGrowActions: 'Track repeat orders.',
  achievementsAndOpportunities: 'Improved weekly sales.',
  teamRecommendations: 'Connect with local retailers.',
  submittedAt: '2026-10-19T13:45:00.000Z',
  ...overrides,
});

test('exports all filtered reports and report fields as one spreadsheet-safe CSV', () => {
  const csv = buildStaffMentorMeetingReportsCsv([
    report(),
    report({
      id: 32,
      meetingDate: '2026-10-20',
      meetingProvider: 'manual',
      attendees: ['=HYPERLINK("https://example.test")'],
      teamRecommendations: null,
      submittedAt: '2026-10-20T09:00:00.000Z',
    }),
  ]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 3, 'one header and one row per report in the same file');
  assert.match(lines[0], /"Program","Business","Meeting date","Mentor name"/);
  assert.match(lines[1], /"Northstar Foods","2026-10-19","Sam Coach","sam@example\.org"/);
  assert.match(lines[1], /"Lina Haddad; Omar Saleh","Google Calendar"/);
  assert.match(lines[1], /"Introductions, highlights\nand next steps\."/);
  assert.match(lines[1], /"Connect with local retailers\."/);
  assert.match(lines[2], /"'\=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(lines[2], /"Manual"/);
  assert.match(lines[2], /"2026-10-20T09:00:00\.000Z"/);
});
