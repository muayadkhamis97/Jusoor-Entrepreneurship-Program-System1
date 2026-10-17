import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProgramLifecycleEvent } from '@workspace/api-client-react';
import { buildProgramLifecycleCsv } from './program-lifecycle-export';

const event = (overrides: Partial<ProgramLifecycleEvent> = {}): ProgramLifecycleEvent => ({
  id: 4,
  action: 'archived',
  createdAt: '2026-10-14T15:00:00.000Z',
  actorEmail: 'coordinator@example.com',
  ...overrides,
});

test('program lifecycle CSV includes UTC event times and identifies removed actor accounts', () => {
  const csv = buildProgramLifecycleCsv('Northstar Cohort', [
    event(),
    event({ id: 5, action: 'restored', actorEmail: null }),
  ]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv.slice(1), /^"Program","Action","Timestamp \(UTC\)","Actor email"/);
  assert.match(csv, /"Northstar Cohort","archived","2026-10-14T15:00:00\.000Z","coordinator@example\.com"/);
  assert.match(csv, /"Northstar Cohort","restored","2026-10-14T15:00:00\.000Z","Actor account no longer exists"/);
});

test('empty program lifecycle CSV explains that no events were recorded', () => {
  const csv = buildProgramLifecycleCsv('Northstar Cohort', []);

  assert.match(csv, /"Northstar Cohort","No archive or restore actions recorded","",""/);
});

test('program and actor values are quoted and protected from spreadsheet formulas', () => {
  const csv = buildProgramLifecycleCsv('=HYPERLINK("https://example.test")', [
    event({ actorEmail: '+SUM(1,1)' }),
  ]);

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"'\+SUM\(1,1\)"/);
});
