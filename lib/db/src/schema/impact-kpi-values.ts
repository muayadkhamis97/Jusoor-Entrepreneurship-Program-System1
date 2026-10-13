import { createInsertSchema } from "drizzle-zod";
import { date, index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { impactKpisTable } from "./impact-kpis";
import { staffMembersTable } from "./staff";

export const impactKpiValuesTable = pgTable(
  "jusoor_impact_kpi_values",
  {
    id: serial("id").primaryKey(),
    kpiId: integer("kpi_id").notNull().references(() => impactKpisTable.id, { onDelete: "cascade" }),
    businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
    value: real("value").notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    notes: text("notes"),
    recordedByStaffId: integer("recorded_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("jusoor_impact_kpi_values_indicator_business_period_unique").on(
      table.kpiId,
      table.businessId,
      table.periodEnd,
    ),
    index("jusoor_impact_kpi_values_kpi_idx").on(table.kpiId),
    index("jusoor_impact_kpi_values_business_idx").on(table.businessId),
  ],
);

export const insertImpactKpiValueSchema = createInsertSchema(impactKpiValuesTable).omit({
  id: true,
  recordedAt: true,
});

export type InsertImpactKpiValue = z.infer<typeof insertImpactKpiValueSchema>;
export type ImpactKpiValue = typeof impactKpiValuesTable.$inferSelect;
