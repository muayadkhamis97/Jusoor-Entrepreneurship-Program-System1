import type {
  GetStaffMentorMeetingReportCoachesParams,
  GetStaffMentorMeetingReportsParams,
} from '@workspace/api-client-react';

export type StaffMentorMeetingReportSelection = {
  programId: number | '';
  businessId: number | '';
  coachEmail: string;
};

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
