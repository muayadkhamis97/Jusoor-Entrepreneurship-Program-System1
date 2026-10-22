import type {
  GetStaffMentorMeetingReportCoachesParams,
  GetStaffMentorMeetingReportsParams,
} from '@workspace/api-client-react';

export type StaffMentorMeetingReportSelection = {
  programId: number | '';
  businessId: number | '';
  coachEmail: string;
};

export function getMeetingReportEmptyCopy(
  selection: StaffMentorMeetingReportSelection,
  meetingDateFrom: string,
  meetingDateTo: string,
) {
  const filtered = selection.businessId !== '' || Boolean(selection.coachEmail || meetingDateFrom || meetingDateTo);
  return filtered
    ? { filtered, title: 'No meeting reports match these filters.', body: 'Try changing the mentor, business or meeting-date range.' }
    : { filtered, title: 'No meeting reports submitted yet.', body: 'Reports will appear here after a mentor submits a meeting report for this program.' };
}

export function selectStaffMentorMeetingReportProgram(
  programId: number | '',
): StaffMentorMeetingReportSelection {
  return { programId, businessId: '', coachEmail: '' };
}

export function selectStaffMentorMeetingReportBusiness(
  current: StaffMentorMeetingReportSelection,
  businessId: number | '',
): StaffMentorMeetingReportSelection {
  return { ...current, businessId, coachEmail: '' };
}

export function getStaffMentorMeetingReportFilterParams(
  selection: StaffMentorMeetingReportSelection,
  meetingDateFrom: string,
  meetingDateTo: string,
): {
  coachOptionsParams: GetStaffMentorMeetingReportCoachesParams;
  reportParams: GetStaffMentorMeetingReportsParams;
} {
  const coachOptionsParams: GetStaffMentorMeetingReportCoachesParams = {
    programId: selection.programId === '' ? 0 : selection.programId,
    ...(selection.businessId === '' ? {} : { businessId: selection.businessId }),
  };

  return {
    coachOptionsParams,
    reportParams: {
      ...coachOptionsParams,
      ...(selection.coachEmail ? { coachEmail: selection.coachEmail } : {}),
      ...(meetingDateFrom ? { meetingDateFrom } : {}),
      ...(meetingDateTo ? { meetingDateTo } : {}),
    },
  };
}
