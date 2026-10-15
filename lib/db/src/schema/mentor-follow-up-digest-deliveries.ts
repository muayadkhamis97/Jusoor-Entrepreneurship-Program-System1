import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { staffMembersTable } from "./staff";

export const mentorFollowUpDigestDeliveriesTable = pgTable(
  "jusoor_mentor_follow_up_digest_deliveries",
  {
    id: serial("id").primaryKey(),
    coordinatorStaffId: integer("coordinator_staff_id")
      .notNull()
      .references(() => staffMembersTable.id, { onDelete: "cascade" }),
    calendarDate: date("calendar_date", { mode: "string" }).notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("jusoor_mentor_follow_up_digest_coordinator_date_unique")
      .on(table.coordinatorStaffId, table.calendarDate),
  ],
);
