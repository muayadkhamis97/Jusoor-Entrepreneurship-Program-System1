import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { staffMembersTable } from "./staff";
import { judgingFormsTable } from "./judging-forms";

export const judgingFormLinkHistoryTable = pgTable("program_judging_form_link_history", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => judgingFormsTable.id, { onDelete: "cascade" }),
  actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  actorEmail: text("actor_email").notNull(),
  replacedAt: timestamp("replaced_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("program_judging_form_link_history_form_idx").on(table.formId, table.id),
]);

export type JudgingFormLinkHistory = typeof judgingFormLinkHistoryTable.$inferSelect;
