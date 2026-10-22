import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getMeetingReportEmptyCopy, type StaffMentorMeetingReportSelection } from './staff-mentor-meeting-report-filters';

const selection: StaffMentorMeetingReportSelection = { programId: 12, businessId: '', coachEmail: '' };

test('an unfiltered empty program explains that no reports have been submitted', () => {
  const copy = getMeetingReportEmptyCopy(selection, '', '');
  assert.equal(copy.filtered, false);
  assert.equal(copy.title, 'No meeting reports submitted yet.');
  assert.match(copy.body, /after a mentor submits/);
});

test('each active report filter offers a no-matches message instead of claiming no reports exist', () => {
  for (const [current, from, to] of [
    [{ ...selection, businessId: 7 }, '', ''],
    [{ ...selection, coachEmail: 'mentor@example.test' }, '', ''],
    [selection, '2026-10-01', ''],
    [selection, '', '2026-10-22'],
  ] as [StaffMentorMeetingReportSelection, string, string][]) {
    const copy = getMeetingReportEmptyCopy(current, from, to);
    assert.equal(copy.filtered, true);
    assert.equal(copy.title, 'No meeting reports match these filters.');
  }
});

test('empty feedback is distinct from errors, and dependent sections wait for available programs', () => {
  const source = readFileSync(new URL('./role-surfaces.tsx', import.meta.url), 'utf8');
  assert.match(source, /programsQuery\.isError \?[^]*Programs could not load/);
  assert.match(source, /data-testid="staff-reports-no-programs"/);
  assert.match(source, /programsQuery\.isSuccess && programs\.length > 0 && <>/);
  assert.match(source, /additionalSessionRequestsQuery\.isSuccess && <span>/);
  assert.match(source, /data-testid="staff-session-requests-empty"/);
  assert.match(source, /reportsQuery\.isError \?[^]*Mentor meeting reports could not load/);
  assert.match(source, /emptyReportCopy\.filtered && <Button/);
});

test('report sections follow the reading order: filters, session history, then capacity requests', () => {
  const source = readFileSync(new URL('./role-surfaces.tsx', import.meta.url), 'utf8');
  const filters = source.indexOf('data-testid="staff-mentor-meeting-report-filters"');
  const history = source.indexOf('{meetingReportsSection}', filters);
  const requests = source.indexOf('data-testid="staff-additional-session-requests"', filters);
  assert.ok(filters >= 0 && history > filters && requests > history);
  assert.match(source, /className="role-inline-note" role="status" data-testid="staff-meeting-reports-empty"/);
  assert.match(source, /className="role-inline-note" role="status" data-testid="staff-session-requests-empty"/);
  assert.match(source, /data-testid="staff-mentor-meeting-reports"[^]*<h2>\{t\('Session history'\)\}<\/h2>/);
});
