import { createInsertSchema } from "drizzle-zod";
import { date, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const programsTable = pgTable("jusoor_programs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  format: text("format").notNull().default("bootcamp"),
  description: text("description"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  applicationDeadline: date("application_deadline", { mode: "string" }),
  status: text("status").notNull().default("outreach"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programsTable).omit({
  id: true,
  archivedAt: true,
  createdAt: true,
});
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;
