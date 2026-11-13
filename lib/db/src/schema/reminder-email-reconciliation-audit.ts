import { createInsertSchema } from "drizzle-zod";
import { boolean, check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staffMembersTable } from "./staff";

export const reminderEmailDeliveryTypes = ["course_reminder", "mentor_digest", "zoom_recording_alert"] as const;
export const reminderEmailResolutionActions = ["delivery_confirmed", "retry_authorized"] as const;

export const reminderEmailReconciliationAuditTable = pgTable(
  "jusoor_reminder_email_reconciliation_audit",
  {
    id: serial("id").primaryKey(),
    deliveryType: text("delivery_type").notNull(),
    deliveryId: integer("delivery_id").notNull(),
    actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    messageId: text("message_id").notNull(),
    confirmedAbsent: boolean("confirmed_absent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "jusoor_reminder_email_reconciliation_type_check",
      sql`${table.deliveryType} in ('course_reminder', 'mentor_digest', 'zoom_recording_alert')`,
    ),
    check(
      "jusoor_reminder_email_reconciliation_action_check",
      sql`${table.action} in ('delivery_confirmed', 'retry_authorized')`,
    ),
    check(
      "jusoor_reminder_email_reconciliation_absence_check",
      sql`(${table.action} = 'delivery_confirmed' and ${table.confirmedAbsent} = false)
        or (${table.action} = 'retry_authorized' and ${table.confirmedAbsent} = true)`,
    ),
    index("jusoor_reminder_email_reconciliation_delivery_idx").on(table.deliveryType, table.deliveryId, table.createdAt),
  ],
);

export const insertReminderEmailReconciliationAuditSchema = createInsertSchema(
  reminderEmailReconciliationAuditTable,
).omit({ id: true, createdAt: true });

export type InsertReminderEmailReconciliationAudit = typeof reminderEmailReconciliationAuditTable.$inferInsert;
export type ReminderEmailReconciliationAudit = typeof reminderEmailReconciliationAuditTable.$inferSelect;
