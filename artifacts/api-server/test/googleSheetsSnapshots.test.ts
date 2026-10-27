import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { businessesTable, chatMessagesTable, db, programsTable, sessionsTable } from "@workspace/db";
import { loadProgramSnapshotSheets } from "../src/lib/googleSheetsSnapshots";

test("expanded program exports are scoped, have aligned columns, and omit provider and authentication secrets", async () => {
  const original = Object.getOwnPropertyDescriptor(db, "select");
  const filters: { sql: string; params: unknown[] }[] = [];
  const dialect = new PgDialect();
  Object.defineProperty(db, "select", { configurable: true, value: () => {
    let table: unknown;
    const rows = () => {
      if (table === programsTable) return [{
        id: 7, name: "Program Seven", format: "incubation", status: "active",
        startDate: "2026-10-01", mentorSessionsPerBusiness: 4,
      }];
      if (table === businessesTable) return [{
        id: 3, businessName: "Studio", founderName: "Founder", email: "founder@example.test",
        stage: "incubation", createdAt: new Date("2026-10-01T00:00:00Z"),
        clerkUserId: "AUTHENTICATION_SECRET",
      }];
      if (table === sessionsTable) return [{
        id: 8, title: "Workshop", status: "scheduled", scheduledDate: "2026-10-02",
        zoomUrl: "PRIVATE_ZOOM_URL", zoomMeetingId: "PRIVATE_MEETING_ID", recordingUrl: "PRIVATE_RECORDING_URL",
      }];
      if (table === chatMessagesTable) return [{
        threadId: 9, kind: "private", programName: "Program Seven", participantName: "Founder",
        senderName: "Program team", senderRole: "staff", body: "=untrusted message",
        createdAt: new Date("2026-10-02T12:00:00Z"),
        senderKey: "PRIVATE_ACTOR_ID", clientMessageId: "PRIVATE_IDEMPOTENCY_KEY",
      }];
      return [];
    };
    const query = {
      from(value: unknown) { table = value; return query; },
      innerJoin() { return query; },
      leftJoin() { return query; },
      where(value: Parameters<PgDialect["sqlToQuery"]>[0]) { filters.push(dialect.sqlToQuery(value)); return query; },
      orderBy() { return query; },
      limit() { return query; },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(rows()).then(resolve, reject);
      },
    };
    return query;
  } });
  try {
    const sheets = await loadProgramSnapshotSheets(7);
    assert.equal(sheets.length, 4);
    for (const sheet of sheets) {
      for (const row of sheet.rows) assert.equal(row.length, sheet.headers.length);
    }
    assert.ok(filters.length >= 14);
    for (const filter of filters) assert.ok(filter.params.includes(7), filter.sql);
    const attendanceFilter = filters.find(filter => filter.sql.includes("jusoor_session_participant_attendance"));
    for (const table of ["jusoor_sessions", "jusoor_applications", "jusoor_businesses"]) {
      assert.ok(attendanceFilter?.sql.includes(`"${table}"."program_id"`));
    }
    const serialized = JSON.stringify(sheets);
    assert.match(serialized, /=untrusted message/);
    for (const secret of ["AUTHENTICATION_SECRET", "PRIVATE_ZOOM_URL", "PRIVATE_MEETING_ID", "PRIVATE_RECORDING_URL", "PRIVATE_ACTOR_ID", "PRIVATE_IDEMPOTENCY_KEY"]) {
      assert.ok(!serialized.includes(secret), secret);
    }
  } finally {
    if (original) Object.defineProperty(db, "select", original);
    else Reflect.deleteProperty(db, "select");
  }
});
