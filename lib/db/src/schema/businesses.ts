import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { programsTable } from "./programs";

export const businessesTable = pgTable("jusoor_businesses", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "restrict" }),
  businessName: text("business_name").notNull(),
  founderName: text("founder_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  industry: text("industry"),
  stage: text("stage").notNull().default("application"),
  applicationDate: date("application_date", { mode: "string" }),
  needs: text("needs"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("jusoor_businesses_id_program_uq").on(table.id, table.programId),
]);

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
