import type { TrainerAttendanceReport } from '@workspace/api-client-react';

export type TrainerAttendanceSheetRow = {
  sessionId: number;
  sessionTitle: string;
  scheduledDate: string;
  recordType: 'Participant attendance' | 'Unmatched attendee' | 'Session summary';
  businessName: string;
  participantName: string;
  unmatchedEmail: string;
  status: string;
  source: string;
  minutesAttended: number | '';
  firstJoinedAt: string;
  lastLeftAt: string;
  notes: string;
  zoomSyncStatus: string;
  zoomParticipantCount: number | '';
  zoomMatchedCount: number | '';
  zoomUnmatchedCount: number | '';
  zoomSyncAttempts: number | '';
  zoomLastAttemptAt: string;
  zoomSyncedAt: string;
};

export function buildTrainerAttendanceSheetRows(reports: TrainerAttendanceReport[]): TrainerAttendanceSheetRow[] {
  return reports.flatMap(report => {
    const sync = report.zoomSync;
    const common: Pick<TrainerAttendanceSheetRow,
      'sessionId' | 'sessionTitle' | 'scheduledDate' | 'zoomSyncStatus' | 'zoomParticipantCount' |
      'zoomMatchedCount' | 'zoomUnmatchedCount' | 'zoomSyncAttempts' | 'zoomLastAttemptAt' | 'zoomSyncedAt'
    > = {
      sessionId: report.sessionId,
      sessionTitle: report.sessionTitle,
      scheduledDate: report.scheduledDate,
      zoomSyncStatus: sync ? sync.status : '',
      zoomParticipantCount: sync ? sync.participantCount : '',
      zoomMatchedCount: sync ? sync.matchedCount : '',
      zoomUnmatchedCount: sync ? sync.unmatchedCount : '',
      zoomSyncAttempts: sync ? sync.attempts : '',
      zoomLastAttemptAt: sync?.lastAttemptAt ?? '',
      zoomSyncedAt: sync?.syncedAt ?? '',
    };
    const rosterRows: TrainerAttendanceSheetRow[] = report.attendance.map(person => ({
      ...common,
      recordType: 'Participant attendance',
      businessName: person.businessName,
      participantName: person.participantName,
      unmatchedEmail: '',
      status: person.status ?? 'Not recorded',
      source: person.source ?? '',
      minutesAttended: person.attendedSeconds === null ? '' : Math.round(person.attendedSeconds / 60),
      firstJoinedAt: person.firstJoinedAt ?? '',
      lastLeftAt: person.lastLeftAt ?? '',
      notes: person.notes ?? '',
    }));
    const unmatchedRows: TrainerAttendanceSheetRow[] = report.unmatchedParticipants.map(person => ({
      ...common,
      recordType: 'Unmatched attendee',
      businessName: '',
      participantName: person.displayName,
      unmatchedEmail: person.email ?? '',
      status: 'Needs review',
      source: 'zoom',
      minutesAttended: Math.round(person.durationSeconds / 60),
      firstJoinedAt: person.joinTime ?? '',
      lastLeftAt: person.leaveTime ?? '',
      notes: '',
    }));
    return rosterRows.length || unmatchedRows.length
      ? [...rosterRows, ...unmatchedRows]
      : [{
        ...common,
        recordType: 'Session summary',
        businessName: '',
        participantName: '',
        unmatchedEmail: '',
        status: '',
        source: '',
        minutesAttended: '',
        firstJoinedAt: '',
        lastLeftAt: '',
        notes: '',
      }];
  });
}

const csvCell = (value: string | number): string => {
  const text = String(value);
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

export function buildTrainerAttendanceCsv(reports: TrainerAttendanceReport[]): string {
  const rows: Array<Array<string | number>> = [
    [
      'Session ID',
      'Session',
      'Scheduled date',
      'Record type',
      'Business',
      'Participant',
      'Unmatched attendee email',
      'Attendance status',
      'Attendance source',
      'Minutes attended',
      'First joined at',
      'Last left at',
      'Attendance notes',
      'Zoom sync status',
      'Zoom participant count',
      'Matched Zoom participants',
      'Unmatched Zoom participants',
      'Zoom sync attempts',
      'Last Zoom sync attempt',
      'Zoom synced at (UTC)',
    ],
    ...buildTrainerAttendanceSheetRows(reports).map(row => [
      row.sessionId,
      row.sessionTitle,
      row.scheduledDate,
      row.recordType,
      row.businessName,
      row.participantName,
      row.unmatchedEmail,
      row.status,
      row.source,
      row.minutesAttended,
      row.firstJoinedAt,
      row.lastLeftAt,
      row.notes,
      row.zoomSyncStatus,
      row.zoomParticipantCount,
      row.zoomMatchedCount,
      row.zoomUnmatchedCount,
      row.zoomSyncAttempts,
      row.zoomLastAttemptAt,
      row.zoomSyncedAt,
    ]),
  ];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadTrainerAttendanceCsv(reports: TrainerAttendanceReport[]): void {
  const csv = buildTrainerAttendanceCsv(reports);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `training-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
