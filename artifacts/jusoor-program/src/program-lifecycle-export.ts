import type { ProgramLifecycleEvent, StaffAssignmentAuditHistory } from '@workspace/api-client-react';

const csvCell = (value: string | number | null | undefined): string => {
  const text = value == null ? '' : String(value);
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

export function buildProgramLifecycleCsv(programName: string, events: ProgramLifecycleEvent[]): string {
  const headers = ['Program', 'Action', 'Timestamp (UTC)', 'Actor email'];
  const rows = events.length
    ? events.map(event => [
      programName,
      event.action,
      new Date(event.createdAt).toISOString(),
      event.actorEmail || 'Actor account no longer exists',
    ])
    : [[programName, 'No archive or restore actions recorded', '', '']];

  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadProgramLifecycleCsv(
  programId: number,
  programName: string,
  events: ProgramLifecycleEvent[],
): void {
  const csv = buildProgramLifecycleCsv(programName, events);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `program-${programId}-lifecycle-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function summarizeAssignmentValue(type: string, value: Record<string, unknown>): string {
  if (type === 'staff_roles') {
    const roles = Array.isArray(value.roles) ? value.roles.map(String) : [];
    return roles.length ? roles.join(', ') : 'No specialist roles';
  }
  const name = typeof value.businessName === 'string' ? value.businessName : null;
  const id = typeof value.businessId === 'number' ? value.businessId : null;
  return name || (id === null ? 'No business team' : `Business #${id}`);
}

export function buildStaffAssignmentHistoryCsv(events: StaffAssignmentAuditHistory): string {
  const headers = [
    'Actor',
    'Program',
    'Affected account/application',
    'Assignment type',
    'Previous value',
    'New value',
    'Timestamp (UTC)',
  ];
  const rows = events.map(event => [
    event.actorEmail,
    event.programName,
    event.assignmentType === 'staff_roles'
      ? event.affectedAccountEmail || `Staff account #${event.affectedStaffId ?? ''}`
      : event.affectedApplicationName || `Application #${event.applicationId ?? ''}`,
    event.assignmentType === 'staff_roles' ? 'Staff roles' : 'Business team',
    summarizeAssignmentValue(event.assignmentType, event.previousValue),
    summarizeAssignmentValue(event.assignmentType, event.newValue),
    new Date(event.createdAt).toISOString(),
  ]);

  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadStaffAssignmentHistoryCsv(events: StaffAssignmentAuditHistory): void {
  const csv = buildStaffAssignmentHistoryCsv(events);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `assignment-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
