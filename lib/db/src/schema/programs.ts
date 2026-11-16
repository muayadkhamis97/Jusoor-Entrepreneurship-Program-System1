import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const programsTable = pgTable("jusoor_programs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  format: text("format").notNull().default("bootcamp"),
  description: text("description"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  applicationDeadline: date("application_deadline", { mode: "string" }),
  timeZone: text("time_zone").notNull().default("Asia/Amman"),
  mentorSessionsPerBusiness: integer("mentor_sessions_per_business").notNull().default(0),
  status: text("status").notNull().default("outreach"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("jusoor_programs_mentor_sessions_per_business_check", sql`${table.mentorSessionsPerBusiness} >= 0`),
]);

export const insertProgramSchema = createInsertSchema(programsTable).omit({
  id: true,
  archivedAt: true,
  createdAt: true,
});
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;
