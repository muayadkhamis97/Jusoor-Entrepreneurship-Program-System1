import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { StaffAssignmentAuditHistory } from '@workspace/api-client-react';
import { buildStaffAssignmentHistoryCsv, downloadStaffAssignmentHistoryCsv } from './program-lifecycle-export';

const assignmentHistoryUi = readFileSync(new URL('./team-assignments.tsx', import.meta.url), 'utf8');

const event: StaffAssignmentAuditHistory[number] = {
  id: 12,
  assignmentType: 'staff_roles',
  programId: 4,
  programName: 'Spring founders',
  actorStaffId: 2,
  actorEmail: 'admin@example.com',
  affectedStaffId: 8,
  affectedAccountEmail: 'mentor@example.com',
  applicationId: null,
  affectedApplicationName: null,
  previousValue: { roles: ['mentor'] },
  newValue: { roles: ['trainer', 'mentor'] },
  createdAt: '2026-10-14T10:12:00.000Z',
};

test('assignment history CSV includes audit actor, program, subject, values, and UTC timestamp', () => {
  const csv = buildStaffAssignmentHistoryCsv([
    event,
    {
      ...event,
      id: 13,
      assignmentType: 'business_team',
      affectedStaffId: null,
      affectedAccountEmail: null,
      applicationId: 71,
      affectedApplicationName: 'Bright Startup',
      previousValue: { businessName: 'Old team' },
      newValue: { businessName: 'New team', businessId: 9 },
    },
  ]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv.slice(1), /^"Actor","Program","Affected account\/application","Assignment type","Previous value","New value","Timestamp \(UTC\)"/);
  assert.match(csv, /"admin@example\.com","Spring founders","mentor@example\.com","Staff roles","mentor","trainer, mentor","2026-10-14T10:12:00\.000Z"/);
  assert.match(csv, /"admin@example\.com","Spring founders","Bright Startup","Business team","Old team","New team","2026-10-14T10:12:00\.000Z"/);
});

test('assignment history CSV quotes cells and neutralizes formula-like values', () => {
  const csv = buildStaffAssignmentHistoryCsv([{
    ...event,
    actorEmail: '+SUM(1,1)',
    programName: '=HYPERLINK("https://example.test")',
    affectedAccountEmail: '@external',
    previousValue: { roles: ['-cmd'] },
    newValue: { roles: ['+SUM(1,1)'] },
  }]);

  assert.match(csv, /"'\+SUM\(1,1\)","'=HYPERLINK\(""https:\/\/example\.test""\)","'@external","Staff roles","'-cmd","'\+SUM\(1,1\)"/);
  const newlinePrefixedFormula = buildStaffAssignmentHistoryCsv([{ ...event, actorEmail: '\n=SUM(1,1)' }]);
  assert.match(newlinePrefixedFormula, /"'\n=SUM\(1,1\)"/);
});

test('assignment history download creates a CSV file and releases its temporary URL', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  let appendedLink: {
    href: string;
    download: string;
    style: { display: string };
    click: () => void;
    remove: () => void;
  } | undefined;
  let clicked = false;
  let removed = false;
  let revokedUrl = '';
  let downloadedBlob: Blob | undefined;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      downloadedBlob = blob;
      return 'blob:assignment-history';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => { revokedUrl = url; },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => (appendedLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: () => { clicked = true; },
        remove: () => { removed = true; },
      }),
      body: { append: () => undefined },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout: (callback: () => void) => { callback(); return 0; } },
  });

  try {
    downloadStaffAssignmentHistoryCsv([event]);
    assert.ok(appendedLink);
    assert.equal(appendedLink.href, 'blob:assignment-history');
    assert.match(appendedLink.download, /^assignment-history-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(appendedLink.style.display, 'none');
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(revokedUrl, 'blob:assignment-history');
    assert.ok(downloadedBlob);
    assert.deepEqual(
      Array.from(new Uint8Array(await downloadedBlob.arrayBuffer()).slice(0, 3)),
      [0xef, 0xbb, 0xbf],
    );
  } finally {
    for (const [target, name, descriptor] of [
      [globalThis, 'document', previousDocument],
      [globalThis, 'window', previousWindow],
      [URL, 'createObjectURL', previousCreateObjectUrl],
      [URL, 'revokeObjectURL', previousRevokeObjectUrl],
    ] as const) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else Reflect.deleteProperty(target, name);
    }
  }
});

test('only Admins can clear all assignment history after confirming the permanent deletion', () => {
  assert.match(assignmentHistoryUi, /isAdmin && <AssignmentAuditHistory programs={programs} \/>/);
  assert.match(assignmentHistoryUi, /useClearStaffAssignmentHistory/);
  assert.match(assignmentHistoryUi, /title={t\('Clear assignment-change history\?'\)}/);
  assert.match(assignmentHistoryUi, /This permanently deletes every assignment-change history record/);
  assert.match(assignmentHistoryUi, /Existing staff roles and business teams will not change/);
  assert.match(assignmentHistoryUi, /data-testid="button-confirm-clear-assignment-history"/);
  assert.match(assignmentHistoryUi, /client\.invalidateQueries\(\{ queryKey: getGetStaffAssignmentHistoryQueryKey\(\) \}\)/);
});

test('integration disconnect history is Admin-only and read-only', () => {
  assert.match(assignmentHistoryUi, /isAdmin && <IntegrationDisconnectAuditHistory \/>/);
  assert.match(assignmentHistoryUi, /getGetIntegrationDisconnectHistoryQueryKey/);
  assert.match(assignmentHistoryUi, /useGetIntegrationDisconnectHistory/);
  assert.match(assignmentHistoryUi, /This history is read-only/);
  assert.match(assignmentHistoryUi, /integration-disconnect-audit-history/);
  assert.match(assignmentHistoryUi, /event\.initiatorType === 'self_service'.*t\('Self'\)/);
});
