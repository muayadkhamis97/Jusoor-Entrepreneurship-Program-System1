import { createInsertSchema } from "drizzle-zod";
import { foreignKey, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";
import { businessesTable } from "./businesses";
import { sessionsTable } from "./sessions";
import { staffMembersTable } from "./staff";

export const sessionParticipantAttendanceTable = pgTable(
  "jusoor_session_participant_attendance",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
    participantId: integer("participant_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
    programId: integer("program_id").notNull(),
    status: text("status").notNull(),
    notes: text("notes"),
    recordedByStaffId: integer("recorded_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    source: text("source").notNull().default("manual"),
    attendedSeconds: integer("attended_seconds"),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }),
    lastLeftAt: timestamp("last_left_at", { withTimezone: true }),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("jusoor_session_participant_attendance_session_participant_uq").on(table.sessionId, table.participantId),
    index("jusoor_session_participant_attendance_session_idx").on(table.sessionId),
    index("jusoor_session_participant_attendance_business_idx").on(table.businessId),
    index("jusoor_session_participant_attendance_participant_idx").on(table.participantId),
    foreignKey({
      name: "jusoor_session_participant_attendance_session_program_fk",
      columns: [table.sessionId, table.programId],
      foreignColumns: [sessionsTable.id, sessionsTable.programId],
    }).onDelete("cascade"),
    foreignKey({
      name: "jusoor_session_participant_attendance_participant_program_fk",
      columns: [table.participantId, table.programId],
      foreignColumns: [applicationsTable.id, applicationsTable.programId],
    }).onDelete("cascade"),
    foreignKey({
      name: "jusoor_session_participant_attendance_business_program_fk",
      columns: [table.businessId, table.programId],
      foreignColumns: [businessesTable.id, businessesTable.programId],
    }).onDelete("cascade"),
  ],
);

export const insertSessionParticipantAttendanceSchema = createInsertSchema(sessionParticipantAttendanceTable).omit({
  id: true,
  markedAt: true,
});

export type InsertSessionParticipantAttendance = z.infer<typeof insertSessionParticipantAttendanceSchema>;
export type SessionParticipantAttendance = typeof sessionParticipantAttendanceTable.$inferSelect;
