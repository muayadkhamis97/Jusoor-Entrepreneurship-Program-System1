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
