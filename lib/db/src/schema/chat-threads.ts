import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { programsTable } from "./programs";
import { applicationsTable } from "./applications";
import { businessesTable } from "./businesses";

export const chatThreadsTable = pgTable("program_chat_threads", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  participantId: integer("participant_id").references(() => applicationsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("program_chat_private_uq").on(table.programId, table.participantId),
  uniqueIndex("program_chat_business_uq").on(table.programId, table.businessId),
  check("program_chat_target_check", sql`(${table.kind} = 'private' AND ${table.participantId} IS NOT NULL AND ${table.businessId} IS NULL) OR (${table.kind} = 'business' AND ${table.participantId} IS NULL AND ${table.businessId} IS NOT NULL)`),
]);
export const insertChatThreadSchema = createInsertSchema(chatThreadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type ChatThread = typeof chatThreadsTable.$inferSelect;
