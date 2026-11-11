import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export type ProgramGoogleSheetsSheetMappings = {
  applications: string;
  judgingResponses: string;
  businessTeam: string;
  operations: string;
  mentoringGrants: string;
  chats: string;
};

export const DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS: ProgramGoogleSheetsSheetMappings = {
  applications: "Applications",
  judgingResponses: "Judging responses",
  businessTeam: "Businesses and teams",
  operations: "Programs sessions attendance",
  mentoringGrants: "Mentor support grants",
  chats: "Staff and participant chats",
};

export const programGoogleSheetsConnectionsTable = pgTable("jusoor_program_google_sheets_connections", {
  programId: integer("program_id").primaryKey().references(() => programsTable.id, { onDelete: "cascade" }),
  spreadsheetId: text("spreadsheet_id").notNull(),
  spreadsheetUrl: text("spreadsheet_url").notNull(),
  spreadsheetTitle: text("spreadsheet_title").notNull(),
  sheetMappings: jsonb("sheet_mappings").$type<ProgramGoogleSheetsSheetMappings>().notNull().default(DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS),
  exportBusinessTeam: boolean("export_business_team").notNull().default(true),
  exportOperations: boolean("export_operations").notNull().default(true),
  exportMentoringGrants: boolean("export_mentoring_grants").notNull().default(true),
  exportChats: boolean("export_chats").notNull().default(true),
  nextApplicationRow: integer("next_application_row").notNull().default(2),
  nextJudgingResponseRow: integer("next_judging_response_row").notNull().default(2),
  connectedByStaffId: integer("connected_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("jusoor_program_google_sheets_spreadsheet_uq").on(table.spreadsheetId),
  check("jusoor_program_google_sheets_rows_check", sql`${table.nextApplicationRow} >= 2 AND ${table.nextJudgingResponseRow} >= 2`),
]);
export const programGoogleSheetsDestinationHistoryTable = pgTable("jusoor_program_google_sheets_destination_history", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull(),
  programName: text("program_name").notNull(),
  actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  actorEmail: text("actor_email").notNull(),
  previousSpreadsheetId: text("previous_spreadsheet_id"),
  previousSpreadsheetTitle: text("previous_spreadsheet_title"),
  previousSheetMappings: jsonb("previous_sheet_mappings").$type<ProgramGoogleSheetsSheetMappings>(),
  newSpreadsheetId: text("new_spreadsheet_id").notNull(),
  newSpreadsheetTitle: text("new_spreadsheet_title").notNull(),
  newSheetMappings: jsonb("new_sheet_mappings").$type<ProgramGoogleSheetsSheetMappings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertProgramGoogleSheetsDestinationHistorySchema = createInsertSchema(programGoogleSheetsDestinationHistoryTable)
  .omit({ id: true, createdAt: true });
export type ProgramGoogleSheetsDestinationHistory = typeof programGoogleSheetsDestinationHistoryTable.$inferSelect;

export const insertProgramGoogleSheetsConnectionSchema = createInsertSchema(programGoogleSheetsConnectionsTable);
export type ProgramGoogleSheetsConnection = typeof programGoogleSheetsConnectionsTable.$inferSelect;

export const programGoogleSheetsSyncEventsTable = pgTable("jusoor_program_google_sheets_sync_events", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id").notNull(),
  sheetRow: integer("sheet_row").notNull(),
  status: text("status").notNull().default("pending"),
  revision: integer("revision").notNull().default(1),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("jusoor_program_google_sheets_event_source_uq").on(table.programId, table.sourceType, table.sourceId),
  check("jusoor_program_google_sheets_event_source_check_v2", sql`${table.sourceType} IN ('application', 'judging_response', 'program_snapshot')`),
  check("jusoor_program_google_sheets_event_status_check", sql`${table.status} IN ('pending', 'processing', 'synced', 'failed', 'skipped')`),
  check("jusoor_program_google_sheets_event_row_check", sql`${table.sheetRow} >= 2 AND ${table.revision} >= 1 AND ${table.attempts} >= 0`),
]);
export const insertProgramGoogleSheetsSyncEventSchema = createInsertSchema(programGoogleSheetsSyncEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type ProgramGoogleSheetsSyncEvent = typeof programGoogleSheetsSyncEventsTable.$inferSelect;
