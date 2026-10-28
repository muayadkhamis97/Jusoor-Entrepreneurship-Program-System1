import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { staffMembersTable } from "./staff";
import { judgingFormsTable } from "./judging-forms";

export const judgingFormStatusHistoryTable = pgTable("program_judging_form_status_history", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => judgingFormsTable.id, { onDelete: "cascade" }),
  actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  actorEmail: text("actor_email").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("program_judging_form_status_history_form_idx").on(table.formId, table.id),
  check("program_judging_form_status_history_from_check", sql`${table.fromStatus} IN ('draft', 'open', 'closed')`),
  check("program_judging_form_status_history_to_check", sql`${table.toStatus} IN ('draft', 'open', 'closed')`),
  check("program_judging_form_status_history_transition_check", sql`${table.fromStatus} <> ${table.toStatus}`),
]);

export type JudgingFormStatusHistory = typeof judgingFormStatusHistoryTable.$inferSelect;
