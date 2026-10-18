import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../lib/db/migrations/20261018_session_participant_attendance.sql", import.meta.url),
  "utf8",
);
const zoomAttendance = readFileSync(new URL("../src/lib/zoom-attendance.ts", import.meta.url), "utf8");
const analyticsRoutes = readFileSync(new URL("../src/routes/analytics.ts", import.meta.url), "utf8");
const trainerRoutes = readFileSync(new URL("../src/routes/trainer.ts", import.meta.url), "utf8");

test("participant attendance is additive and does not rewrite business-level history", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS jusoor_session_participant_attendance/);
  assert.match(migration, /REFERENCES jusoor_sessions\(id\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES jusoor_applications\(id\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES jusoor_businesses\(id\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE \(session_id, participant_id\)/);
  assert.match(migration, /CHECK \(status IN \('present', 'absent', 'excused'\)\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS matched_application_id/);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM)\s+jusoor_session_attendance/i);
});

test("attendance roster and writes are limited to accepted participants assigned in the session program", () => {
  assert.match(zoomAttendance, /eq\(applicationsTable\.programId, programId\)/);
  assert.match(zoomAttendance, /eq\(applicationsTable\.status, "accepted"\)/);
  assert.match(zoomAttendance, /eq\(businessesTable\.programId, programId\)/);
  assert.match(analyticsRoutes, /rosterByParticipantId\.has\(record\.participantId\)/);
  assert.match(analyticsRoutes, /each program participant at most once/);
  assert.match(analyticsRoutes, /businessId: rosterByParticipantId\.get\(record\.participantId\)!\.businessId/);
});

test("Zoom matching uses a unique participant email and requires staff review when ambiguous", () => {
  assert.match(zoomAttendance, /findUniqueApplicationIdForEmail/);
  assert.match(zoomAttendance, /matchedApplicationId/);
  assert.match(zoomAttendance, /matchedApplicationId === null && participant\.ignoredAt === null/);
  assert.match(trainerRoutes, /router\.get\("\/attendance", async[\s\S]*?isParticipantAttendanceSchemaReady/);
});
