import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sessionsTable } from "./sessions";

export const zoomRecordingAlertsTable = pgTable(
  "jusoor_zoom_recording_alerts",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessionsTable.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    readyAt: timestamp("ready_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    emailStatus: text("email_status").notNull().default("pending"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    emailLastAttemptAt: timestamp("email_last_attempt_at", {
      withTimezone: true,
    }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailError: text("email_error"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("jusoor_zoom_recording_alerts_event_key_idx").on(table.eventKey),
    index("jusoor_zoom_recording_alerts_session_resolved_idx").on(
      table.sessionId,
      table.resolvedAt,
    ),
  ],
);

export type ZoomRecordingAlert = typeof zoomRecordingAlertsTable.$inferSelect;
