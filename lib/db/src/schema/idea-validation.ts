import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";
import { z } from "zod/v4";

export const ideaValidationWorkbooksTable = pgTable(
  "jusoor_idea_validation_workbooks",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    customerSegment: text("customer_segment").notNull().default(""),
    problemStatement: text("problem_statement").notNull().default(""),
    riskiestAssumption: text("riskiest_assumption").notNull().default(""),
    mvpExperiment: text("mvp_experiment").notNull().default(""),
    successSignal: text("success_signal").notNull().default(""),
    evidenceAndNextStep: text("evidence_and_next_step").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_idea_validation_application_unique").on(table.applicationId),
  ],
);

export const insertIdeaValidationWorkbookSchema = createInsertSchema(ideaValidationWorkbooksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIdeaValidationWorkbook = z.infer<typeof insertIdeaValidationWorkbookSchema>;
export type IdeaValidationWorkbook = typeof ideaValidationWorkbooksTable.$inferSelect;
