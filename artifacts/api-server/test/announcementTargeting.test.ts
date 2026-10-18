import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  businessBelongsToSelectedProgram,
  canParticipantAccessAnnouncement,
  isMissingAnnouncementBusinessColumn,
  isMissingBusinessMembershipTable,
} from "../src/lib/announcement-targeting";

const acceptedPrograms = new Set([4, 9]);
const teamBusinesses = new Map([[31, 4], [39, 9]]);

test("Admin cannot target a business outside the selected program", () => {
  assert.equal(businessBelongsToSelectedProgram(4, 4), true);
  assert.equal(businessBelongsToSelectedProgram(9, 4), false);
  assert.equal(businessBelongsToSelectedProgram(4, null), false);
});

test("business messages are visible only to accepted participants on that business team", () => {
  assert.equal(canParticipantAccessAnnouncement(
    { programId: 4, businessId: 31 },
    acceptedPrograms,
    teamBusinesses,
  ), true);
  assert.equal(canParticipantAccessAnnouncement(
    { programId: 4, businessId: 32 },
    acceptedPrograms,
    teamBusinesses,
  ), false);
  assert.equal(canParticipantAccessAnnouncement(
    { programId: 9, businessId: 31 },
    acceptedPrograms,
    teamBusinesses,
  ), false);
});

test("program and business scopes are both required for targeted messages", () => {
  assert.equal(canParticipantAccessAnnouncement(
    { programId: 10, businessId: 31 },
    acceptedPrograms,
    teamBusinesses,
  ), false);
  assert.equal(canParticipantAccessAnnouncement(
    { programId: null, businessId: 31 },
    acceptedPrograms,
    teamBusinesses,
  ), false);
});

test("existing program-wide and global announcements keep their current visibility", () => {
  assert.equal(canParticipantAccessAnnouncement(
    { programId: 4, businessId: null },
    acceptedPrograms,
    teamBusinesses,
  ), true);
  assert.equal(canParticipantAccessAnnouncement(
    { programId: null, businessId: null },
    acceptedPrograms,
    teamBusinesses,
  ), true);
  assert.equal(canParticipantAccessAnnouncement(
    { programId: 10, businessId: null },
    acceptedPrograms,
    teamBusinesses,
  ), false);
});

test("schema compatibility fallback only recognizes the two expected missing-schema errors", () => {
  assert.equal(isMissingAnnouncementBusinessColumn({
    code: "42703",
    message: 'column "business_id" does not exist',
  }), true);
  assert.equal(isMissingAnnouncementBusinessColumn({
    code: "42703",
    message: 'column "title" does not exist',
  }), false);
  assert.equal(isMissingAnnouncementBusinessColumn({
    message: 'Failed query: select "jusoor_program_announcements"."business_id"',
    cause: {
      code: "42703",
      message: 'column jusoor_program_announcements.business_id does not exist',
    },
  }), true);
  assert.equal(isMissingAnnouncementBusinessColumn({
    message: "Failed query",
    cause: { code: "42703", message: 'column "title" does not exist' },
  }), false);
  assert.equal(isMissingBusinessMembershipTable({
    code: "42P01",
    message: 'relation "jusoor_participant_business_memberships" does not exist',
  }), true);
});

test("business-recipient migration is additive and keeps existing announcement targets", () => {
  const migration = readFileSync(path.resolve(
    import.meta.dirname,
    "../../../lib/db/migrations/20261015_business_targeted_announcements.sql",
  ), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS business_id integer/);
  assert.match(migration, /REFERENCES jusoor_businesses\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /business_id IS NULL OR program_id IS NOT NULL/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS jusoor_program_announcements_business_idx/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
});
