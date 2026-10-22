import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { judgingFormsTable } from "./judging-forms";
import { businessesTable } from "./businesses";

export const judgingFormBusinessesTable = pgTable("program_judging_form_businesses", {
  formId: integer("form_id").notNull().references(() => judgingFormsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
}, table => [primaryKey({ columns: [table.formId, table.businessId] })]);
export const insertJudgingFormBusinessSchema = createInsertSchema(judgingFormBusinessesTable);
export type JudgingFormBusiness = typeof judgingFormBusinessesTable.$inferSelect;
