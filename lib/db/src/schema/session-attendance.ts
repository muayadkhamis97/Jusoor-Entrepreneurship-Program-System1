import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { sessionsTable } from "./sessions";
import { staffMembersTable } from "./staff";

export const sessionAttendanceTable = pgTable(
  "jusoor_session_attendance",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
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
    uniqueIndex("jusoor_session_attendance_session_business_unique").on(table.sessionId, table.businessId),
    index("jusoor_session_attendance_session_idx").on(table.sessionId),
    index("jusoor_session_attendance_business_idx").on(table.businessId),
  ],
);

export const insertSessionAttendanceSchema = createInsertSchema(sessionAttendanceTable).omit({
  id: true,
  markedAt: true,
});

export type InsertSessionAttendance = z.infer<typeof insertSessionAttendanceSchema>;
export type SessionAttendance = typeof sessionAttendanceTable.$inferSelect;
