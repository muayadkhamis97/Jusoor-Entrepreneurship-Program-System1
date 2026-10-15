import { createInsertSchema } from "drizzle-zod";
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export type AnalyticsReportSections = {
  summary: boolean;
  stages: boolean;
  attendance: boolean;
  engagement: boolean;
  impact: boolean;
};

export const analyticsReportLayoutsTable = pgTable(
  "jusoor_analytics_report_layouts",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull(),
    sections: jsonb("sections").$type<AnalyticsReportSections>().notNull(),
    createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_analytics_report_layouts_program_name_unique").on(table.programId, table.name),
    index("jusoor_analytics_report_layouts_program_idx").on(table.programId),
  ],
);

export const insertAnalyticsReportLayoutSchema = createInsertSchema(analyticsReportLayoutsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnalyticsReportLayout = z.infer<typeof insertAnalyticsReportLayoutSchema>;
export type AnalyticsReportLayout = typeof analyticsReportLayoutsTable.$inferSelect;
