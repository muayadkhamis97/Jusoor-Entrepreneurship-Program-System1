import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ProgramGoogleSheetsDestinationHistory } from '@workspace/api-client-react';
import {
  buildProgramGoogleSheetsDestinationHistoryCsv,
  downloadProgramGoogleSheetsDestinationHistoryCsv,
} from './program-lifecycle-export';

const pageSource = readFileSync(new URL('./google-sheets.tsx', import.meta.url), 'utf8');

const event: ProgramGoogleSheetsDestinationHistory = {
  id: 12,
  programId: 4,
  programName: 'Spring founders',
  actorStaffId: 2,
  actorEmail: 'coordinator@example.com',
  previousSpreadsheetId: 'old-workbook-id',
  previousSpreadsheetTitle: 'Previous workbook',
  previousSheetMappings: {
    applications: 'Old applications',
    judgingResponses: 'Old judging',
    businessTeam: 'Old teams',
    operations: 'Old operations',
    mentoringGrants: 'Old mentoring',
    chats: 'Old chats',
  },
  newSpreadsheetId: 'new-workbook-id',
  newSpreadsheetTitle: 'Current workbook',
  newSheetMappings: {
    applications: 'Applications',
    judgingResponses: 'Judging',
    businessTeam: 'Teams',
    operations: 'Operations',
    mentoringGrants: 'Mentoring',
    chats: 'Chats',
  },
  createdAt: '2026-10-14T10:12:00.000Z',
};

test('destination history CSV includes actor, UTC time, workbooks, and both worksheet mappings', () => {
  const csv = buildProgramGoogleSheetsDestinationHistoryCsv([event]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv.slice(1), /^"Program","Actor","Timestamp \(UTC\)","Previous workbook","Previous workbook ID","New workbook","New workbook ID"/);
  assert.match(csv, /"Spring founders","coordinator@example\.com","2026-10-14T10:12:00\.000Z","Previous workbook","old-workbook-id","Current workbook","new-workbook-id"/);
  assert.match(csv, /"Old applications","Old judging","Old teams","Old operations","Old mentoring","Old chats","Applications","Judging","Teams","Operations","Mentoring","Chats"/);
  assert.match(csv, /"Previous Applications worksheet"/);
  assert.match(csv, /"New Chats worksheet"/);
});

test('destination history CSV quotes values and neutralizes formula-like workbook and mapping data', () => {
  const csv = buildProgramGoogleSheetsDestinationHistoryCsv([{
    ...event,
    actorEmail: '+SUM(1,1)',
    previousSpreadsheetTitle: '=HYPERLINK("https://example.test")',
    previousSheetMappings: { ...event.previousSheetMappings!, applications: '-cmd' },
    newSheetMappings: { ...event.newSheetMappings, chats: '@external' },
  }]);

  assert.match(csv, /"'\+SUM\(1,1\)"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"'-cmd"/);
  assert.match(csv, /"'@external"/);
});

test('empty destination history still exports a valid header-only CSV', () => {
  const csv = buildProgramGoogleSheetsDestinationHistoryCsv([]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.slice(1).split('\r\n').filter(Boolean).length, 1);
  assert.match(csv, /"Previous Chats worksheet","New Applications worksheet".*"New Chats worksheet"/);
});

test('destination history download creates a CSV file and releases its temporary URL', async () => {
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
      return 'blob:destination-history';
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
    downloadProgramGoogleSheetsDestinationHistoryCsv(4, [event]);
    assert.ok(appendedLink);
    assert.equal(appendedLink.href, 'blob:destination-history');
    assert.match(appendedLink.download, /^program-4-google-sheets-destination-history-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(revokedUrl, 'blob:destination-history');
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

test('history uses bounded pages and export still gathers the full history', () => {
  assert.match(pageSource, /isAdmin && <DestinationHistory/);
  assert.match(pageSource, /data-testid=\{`button-export-google-sheets-destination-history-\$\{programId\}`\}/);
  assert.match(pageSource, /useInfiniteQuery/);
  assert.match(pageSource, /getNextPageParam: \(lastPage\) => lastPage\.nextCursor/);
  assert.match(pageSource, /data-testid=\{`button-load-older-google-sheets-history-\$\{programId\}`\}/);
  assert.match(pageSource, /while \(cursor\)/);
  assert.match(pageSource, /downloadProgramGoogleSheetsDestinationHistoryCsv\(programId, allEvents\)/);
});
