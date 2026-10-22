import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { judgingFormsTable } from "./judging-forms";

export const judgingResponsesTable = pgTable("program_judging_responses", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => judgingFormsTable.id, { onDelete: "cascade" }),
  // Preserve the business snapshot if the original business is later removed.
  businessId: integer("business_id").notNull(),
  businessName: text("business_name").notNull(),
  judgeName: text("judge_name").notNull(),
  judgeEmail: text("judge_email").notNull(),
  scores: jsonb("scores").$type<{ criterionId: string; score: number }[]>().notNull(),
  answers: jsonb("answers").$type<{ questionId: string; text: string }[]>().notNull(),
  scoreTotal: real("score_total").notNull(),
  maxScore: integer("max_score").notNull(),
  clientSubmissionId: uuid("client_submission_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("program_judging_response_judge_uq").on(table.formId, table.businessId, table.judgeEmail),
  uniqueIndex("program_judging_response_retry_uq").on(table.formId, table.clientSubmissionId),
  index("program_judging_response_form_idx").on(table.formId, table.id),
  check("program_judging_response_email_check", sql`${table.judgeEmail} = lower(btrim(${table.judgeEmail}))`),
  check("program_judging_response_score_check", sql`${table.scoreTotal} >= 0 AND ${table.scoreTotal} <= ${table.maxScore}`),
]);
export const insertJudgingResponseSchema = createInsertSchema(judgingResponsesTable).omit({ id: true, submittedAt: true });
export type JudgingResponse = typeof judgingResponsesTable.$inferSelect;
