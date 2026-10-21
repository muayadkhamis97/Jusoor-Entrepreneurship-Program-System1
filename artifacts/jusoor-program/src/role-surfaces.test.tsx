import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getStaffMentorMeetingReportFilterParams,
  selectStaffMentorMeetingReportBusiness,
  selectStaffMentorMeetingReportProgram,
} from './staff-mentor-meeting-report-filters';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('changing the program clears business and coach selections and updates both query filters', () => {
  const selection = selectStaffMentorMeetingReportProgram(12);

  assert.deepEqual(selection, { programId: 12, businessId: '', coachEmail: '' });
  assert.deepEqual(getStaffMentorMeetingReportFilterParams(selection, '', ''), {
    coachOptionsParams: { programId: 12 },
    reportParams: { programId: 12 },
  });
});

test('changing the business clears the coach and updates both query filters', () => {
  const selection = selectStaffMentorMeetingReportBusiness({
    programId: 12,
    businessId: 21,
    coachEmail: 'coach-old@example.test',
  }, 22);

  assert.deepEqual(selection, { programId: 12, businessId: 22, coachEmail: '' });
  assert.deepEqual(getStaffMentorMeetingReportFilterParams(selection, '2026-10-01', '2026-10-20'), {
    coachOptionsParams: { programId: 12, businessId: 22 },
    reportParams: {
      programId: 12,
      businessId: 22,
      meetingDateFrom: '2026-10-01',
      meetingDateTo: '2026-10-20',
    },
  });
});

test('the report page uses the reset selection for coach options and report queries', () => {
  const surface = read('./role-surfaces.tsx');
  assert.match(surface, /selectStaffMentorMeetingReportProgram\(programId\)/);
  assert.match(surface, /selectStaffMentorMeetingReportBusiness\(current, businessId\)/);
  assert.match(surface, /getStaffMentorMeetingReportFilterParams\(selection, meetingDateFrom, meetingDateTo\)/);
  assert.match(surface, /useGetStaffMentorMeetingReportCoaches\(coachOptionsParams/);
  assert.match(surface, /useGetStaffMentorMeetingReports\(reportParams/);
});

test('trainer attendance view selects an empty state from both assigned sessions and reports', () => {
  const surface = read('./role-surfaces.tsx');
  assert.match(surface, /getTrainerAttendanceEmptyState\(sessions\.length, attendanceQuery\.data\?\.length \|\| 0\)/);
  assert.match(surface, /trainer-attendance-empty-no-sessions/);
  assert.match(surface, /trainer-attendance-empty-no-records/);
  assert.match(surface, /No attendance recorded yet\./);
});

test('trainer reviews and replies keep pending and error feedback scoped to each card', () => {
  const surface = read('./role-surfaces.tsx');
  assert.match(surface, /reviewPendingIds\.has\(answer\.id\)/);
  assert.match(surface, /reviewErrorIds\.has\(answer\.id\)/);
  assert.match(surface, /replyPendingIds\.has\(question\.id\)/);
  assert.match(surface, /replyErrorIds\.has\(question\.id\)/);
  assert.doesNotMatch(surface, /review\.isPending|review\.isError|reply\.isPending|reply\.isError/);
});

test('assignment publishing is in program operations and not in the trainer workspace', () => {
  const trainerSurface = read('./role-surfaces.tsx');
  const operationsSurface = read('./App.tsx');
  assert.doesNotMatch(trainerSurface, /Create a cohort assignment|button-create-assignment|useCreateTrainingAssignment/);
  assert.match(operationsSurface, /!trainerView && <section className="panel role-section role-assignment-section"/);
  assert.match(operationsSurface, /useCreateTrainingAssignment/);
  assert.match(operationsSurface, /createAssignment\.mutate\(\{ data \}/);
  assert.match(operationsSurface, /data-testid="assignment-publish-success"/);
});

test('trainer attendance uses compact expandable cards on narrow screens and keeps all report fields', () => {
  const surface = read('./role-surfaces.tsx');
  const styles = read('./attendance-reports.css');
  assert.match(surface, /attendance-mobile-cards/);
  assert.match(surface, /<details className="attendance-mobile-card"/);
  assert.match(surface, /<summary>/);
  for (const field of [
    'Unmatched attendee email', 'Attendance source', 'Minutes attended', 'First joined at',
    'Last left at', 'Attendance notes', 'Zoom sync status', 'Zoom participants',
    'Matched Zoom participants', 'Unmatched Zoom participants', 'Sync attempts',
    'Last Zoom sync attempt', 'Zoom synced at',
  ]) {
    assert.ok(surface.includes(`t('${field}')`), `Mobile attendance card is missing ${field}`);
  }
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*\.attendance-sheet-scroll\{display:none\}[\s\S]*\.attendance-mobile-cards\{display:grid/);
});

test('trainer course page has one page heading and readable trainer-scoped learning text', () => {
  const courses = read('./course-surfaces.tsx');
  const styles = read('./course-learning.css');

  assert.match(courses, /className=\{`course-hub\$\{readOnly \? ' course-hub-readonly' : ''\}`\}/);
  assert.match(courses, /\{!readOnly && <div className="page-heading">/);
  assert.match(styles, /\.course-hub-readonly \.course-module-copy p\{font-size:15px/);
  assert.match(styles, /\.course-hub-readonly \.discussion-body\{font-size:15px/);
  assert.match(styles, /\.course-hub-readonly \.course-quiz-item-main p\{font-size:14px/);
});

test('role workspace navigation links are grouped in an accessible dropdown', () => {
  const surfaces = read('./role-surfaces.tsx');
  const styles = read('./role-workspace.css');

  assert.match(surfaces, /<DropdownMenuTrigger asChild>/);
  assert.match(surfaces, /data-testid="button-role-navigation-menu"/);
  assert.match(surfaces, /<DropdownMenuContent align="end" side="bottom"/);
  for (const destination of [
    'link-trainer-sessions',
    'link-trainer-learning',
    'link-program-operations',
    'link-role-profile',
    'button-role-signout',
  ]) assert.ok(surfaces.includes(destination), `The role navigation is missing ${destination}`);
  assert.match(styles, /\.role-navigation-menu \[role=menuitem\]\{min-height:40px;gap:9px;[\s\S]*font:500 14px/);
});
