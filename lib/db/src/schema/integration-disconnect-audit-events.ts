import { createInsertSchema } from "drizzle-zod";
import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staffMembersTable } from "./staff";

export const integrationDisconnectTypes = [
  "mentor_google_calendar",
  "program_google_sheets",
  "shared_zoom",
] as const;
export type IntegrationDisconnectType = typeof integrationDisconnectTypes[number];
export const integrationDisconnectInitiatorTypes = ["admin", "self_service"] as const;
export type IntegrationDisconnectInitiatorType = typeof integrationDisconnectInitiatorTypes[number];

export const integrationDisconnectAuditEventsTable = pgTable("jusoor_integration_disconnect_audit_events", {
  id: serial("id").primaryKey(),
  integrationType: text("integration_type").$type<IntegrationDisconnectType>().notNull(),
  initiatorType: text("initiator_type").$type<IntegrationDisconnectInitiatorType>().notNull().default("admin"),
  actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  actorEmail: text("actor_email").notNull(),
  affectedStaffId: integer("affected_staff_id"),
  affectedAccountEmail: text("affected_account_email"),
  programId: integer("program_id"),
  programName: text("program_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    "jusoor_integration_disconnect_audit_events_type_check",
    sql`${table.integrationType} in ('mentor_google_calendar', 'program_google_sheets', 'shared_zoom')`,
  ),
  check(
    "jusoor_integration_disconnect_audit_events_initiator_type_check",
    sql`${table.initiatorType} in ('admin', 'self_service')`,
  ),
  check(
    "jusoor_integration_disconnect_audit_events_subject_check",
    sql`(${table.integrationType} = 'mentor_google_calendar' and ${table.affectedStaffId} is not null and ${table.programId} is null)
      or (${table.integrationType} = 'program_google_sheets' and ${table.affectedStaffId} is null and ${table.programId} is not null and ${table.programName} is not null)
      or (${table.integrationType} = 'shared_zoom' and ${table.affectedStaffId} is null and ${table.programId} is null)`,
  ),
  index("jusoor_integration_disconnect_audit_events_created_idx").on(table.createdAt, table.id),
  index("jusoor_integration_disconnect_audit_events_program_idx").on(table.programId, table.createdAt),
]);

export const insertIntegrationDisconnectAuditEventSchema = createInsertSchema(integrationDisconnectAuditEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertIntegrationDisconnectAuditEvent = typeof integrationDisconnectAuditEventsTable.$inferInsert;
export type IntegrationDisconnectAuditEvent = typeof integrationDisconnectAuditEventsTable.$inferSelect;
