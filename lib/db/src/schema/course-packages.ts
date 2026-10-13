import { boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { courseMaterialsTable } from "./courses";
import { applicationsTable } from "./applications";
import { businessesTable } from "./businesses";

export const coursePackageProgressTable = pgTable("jusoor_course_package_progress", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => courseMaterialsTable.id, { onDelete: "cascade" }),
  participantClerkUserId: text("participant_clerk_user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
  completionStatus: text("completion_status").notNull().default("incomplete"),
  successStatus: text("success_status").notNull().default("unknown"),
  scoreRaw: doublePrecision("score_raw"),
  scoreScaled: doublePrecision("score_scaled"),
  location: text("location").notNull().default(""),
  suspendData: text("suspend_data").notNull().default(""),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("jusoor_course_package_progress_material_user_unique")
    .on(table.materialId, table.participantClerkUserId),
]);

export const xapiLaunchTokensTable = pgTable("jusoor_xapi_launch_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  materialId: integer("material_id").notNull().references(() => courseMaterialsTable.id, { onDelete: "cascade" }),
  participantClerkUserId: text("participant_clerk_user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  registrationId: text("registration_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
});

export const xapiStatementsTable = pgTable("jusoor_xapi_statements", {
  id: serial("id").primaryKey(),
  statementId: text("statement_id").notNull().unique(),
  materialId: integer("material_id").notNull().references(() => courseMaterialsTable.id, { onDelete: "cascade" }),
  participantClerkUserId: text("participant_clerk_user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  registrationId: text("registration_id").notNull(),
  statement: jsonb("statement").$type<Record<string, unknown>>().notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("jusoor_xapi_statements_scope_id_unique")
    .on(table.materialId, table.participantClerkUserId, table.statementId),
]);

export const xapiDocumentsTable = pgTable("jusoor_xapi_documents", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => courseMaterialsTable.id, { onDelete: "cascade" }),
  participantClerkUserId: text("participant_clerk_user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  registrationId: text("registration_id").notNull(),
  documentType: text("document_type").notNull(),
  activityId: text("activity_id").notNull(),
  agentKey: text("agent_key").notNull(),
  documentId: text("document_id").notNull(),
  contentType: text("content_type").notNull().default("application/json"),
  document: jsonb("document").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("jusoor_xapi_documents_scope_key_unique")
    .on(table.materialId, table.participantClerkUserId, table.registrationId, table.documentType, table.activityId, table.agentKey, table.documentId),
]);
