import type { ProgramLifecycleEvent } from '@workspace/api-client-react';

const csvCell = (value: string | number | null | undefined): string => {
  const text = value == null ? '' : String(value);
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
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
  link.download = `jusoor-program-${programId}-lifecycle-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
