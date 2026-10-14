import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export const sessionsTable = pgTable("jusoor_sessions", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => programsTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  type: text("type").notNull().default("training"),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  startTime: text("start_time"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  facilitator: text("facilitator"),
  trainerStaffId: integer("trainer_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  deliveryMode: text("delivery_mode").notNull().default("online"),
  location: text("location"),
  zoomUrl: text("zoom_url"),
  zoomMeetingId: text("zoom_meeting_id"),
  recordingUrl: text("recording_url"),
  recordingVersion: integer("recording_version").notNull().default(0),
  status: text("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  createdAt: true,
  recordingVersion: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
