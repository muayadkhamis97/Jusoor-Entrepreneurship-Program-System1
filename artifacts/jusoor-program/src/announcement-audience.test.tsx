import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  businessesForProgram,
  buildAnnouncementAudienceTarget,
} from './announcement-audience';

const communicationsSource = readFileSync(
  path.join(import.meta.dirname, 'communications-surfaces.tsx'),
  'utf8',
);

test('announcement audience preserves all-cohort and single-cohort targeting', () => {
  assert.deepEqual(buildAnnouncementAudienceTarget('all', '', ''), {
    programId: null,
    businessId: null,
  });
  assert.deepEqual(buildAnnouncementAudienceTarget('cohort', '7', ''), {
    programId: 7,
    businessId: null,
  });
});

test('business messages require a valid program and selected business', () => {
  assert.equal(buildAnnouncementAudienceTarget('business', '', '3'), null);
  assert.equal(buildAnnouncementAudienceTarget('business', '7', ''), null);
  assert.deepEqual(buildAnnouncementAudienceTarget('business', '7', '3'), {
    programId: 7,
    businessId: 3,
  });
  assert.equal(buildAnnouncementAudienceTarget('business', '7.4', '3'), null);
});

test('business choices are limited to the selected program', () => {
  const businesses = [{ id: 3, programId: 7 }, { id: 8, programId: 9 }];
  assert.deepEqual(businessesForProgram(businesses, '7'), [{ id: 3, programId: 7 }]);
  assert.deepEqual(businessesForProgram(businesses, ''), []);
});

test('Admin can compose a business-team message and participants can identify its recipient', () => {
  assert.match(communicationsSource, /useListBusinesses/);
  assert.match(communicationsSource, /data-testid="select-announcement-audience"/);
  assert.match(communicationsSource, /data-testid="select-announcement-business"/);
  assert.match(communicationsSource, /buildAnnouncementAudienceTarget\(audienceMode, cohort, businessId\)/);
  assert.match(communicationsSource, /item\.businessName \? 'Business message'/);
});
