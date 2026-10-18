import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";
import { businessesTable } from "./businesses";
import { sessionsTable } from "./sessions";
import { staffMembersTable } from "./staff";

export const zoomAttendanceSyncsTable = pgTable(
  "jusoor_zoom_attendance_syncs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    participantCount: integer("participant_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    unmatchedCount: integer("unmatched_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_zoom_attendance_sync_session_unique").on(table.sessionId),
    index("jusoor_zoom_attendance_sync_due_idx").on(table.status, table.nextAttemptAt),
  ],
);

export const zoomAttendanceParticipantsTable = pgTable(
  "jusoor_zoom_attendance_participants",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
    participantKey: text("participant_key").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    joinTime: timestamp("join_time", { withTimezone: true }),
    leaveTime: timestamp("leave_time", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    matchedApplicationId: integer("matched_application_id").references(() => applicationsTable.id, { onDelete: "set null" }),
    matchedBusinessId: integer("matched_business_id").references(() => businessesTable.id, { onDelete: "set null" }),
    ignoredByStaffId: integer("ignored_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    ignoredAt: timestamp("ignored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_zoom_attendance_participant_key_unique").on(table.sessionId, table.participantKey),
    index("jusoor_zoom_attendance_participant_session_idx").on(table.sessionId),
    index("jusoor_zoom_attendance_participant_application_idx").on(table.matchedApplicationId),
  ],
);

export const insertZoomAttendanceSyncSchema = createInsertSchema(zoomAttendanceSyncsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertZoomAttendanceParticipantSchema = createInsertSchema(zoomAttendanceParticipantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertZoomAttendanceSync = z.infer<typeof insertZoomAttendanceSyncSchema>;
export type ZoomAttendanceSync = typeof zoomAttendanceSyncsTable.$inferSelect;
export type InsertZoomAttendanceParticipant = z.infer<typeof insertZoomAttendanceParticipantSchema>;
export type ZoomAttendanceParticipant = typeof zoomAttendanceParticipantsTable.$inferSelect;
