import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export type JudgingCriterionConfig = { id: string; label: string; description: string; maxScore: number };
export type JudgingQuestionConfig = { id: string; label: string; required: boolean };
export const judgingFormsTable = pgTable("program_judging_forms", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull().default(""),
  criteria: jsonb("criteria").$type<JudgingCriterionConfig[]>().notNull(),
  questions: jsonb("questions").$type<JudgingQuestionConfig[]>().notNull(),
  status: text("status").notNull().default("draft"),
  shareTokenHash: text("share_token_hash").notNull(),
  shareTokenEnc: text("share_token_enc").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("program_judging_form_token_uq").on(table.shareTokenHash),
  check("program_judging_form_status_check", sql`${table.status} IN ('draft', 'open', 'closed')`),
]);
export const insertJudgingFormSchema = createInsertSchema(judgingFormsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type JudgingForm = typeof judgingFormsTable.$inferSelect;
