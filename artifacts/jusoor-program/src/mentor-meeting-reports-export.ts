import type { StaffMentorMeetingReport } from '@workspace/api-client-react';

const csvCell = (value: string | number | null | undefined): string => {
  const text = value == null ? '' : String(value);
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

export function buildStaffMentorMeetingReportsCsv(reports: StaffMentorMeetingReport[]): string {
  const rows: Array<Array<string | number | null | undefined>> = [
    [
      'Report ID',
      'Program',
      'Business',
      'Meeting date',
      'Coach name',
      'Coach email',
      'Team members who attended',
      'Meeting provider',
      'Topics, session highlights, connections and notes',
      'SMART Grow actions until next call',
      'Achievements and opportunities',
      'Recommendations to program team',
      'Submitted at (UTC)',
    ],
    ...reports.map(report => [
      report.id,
      report.programName,
      report.businessName,
      report.meetingDate,
      report.coachName,
      report.coachEmail,
      report.attendees.join('; '),
      report.meetingProvider === 'google_calendar'
        ? 'Google Calendar'
        : report.meetingProvider === 'calendly'
          ? 'Calendly'
          : 'Manual',
      report.sessionSummary,
      report.smartGrowActions,
      report.achievementsAndOpportunities,
      report.teamRecommendations,
      new Date(report.submittedAt).toISOString(),
    ]),
  ];

  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadStaffMentorMeetingReportsCsv(
  programId: number,
  reports: StaffMentorMeetingReport[],
): void {
  const csv = buildStaffMentorMeetingReportsCsv(reports);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `coach-meeting-reports-${programId}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
