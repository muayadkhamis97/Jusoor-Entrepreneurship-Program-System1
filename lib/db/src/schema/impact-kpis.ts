import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export const impactKpisTable = pgTable(
  "jusoor_impact_kpis",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull(),
    targetValue: real("target_value"),
    direction: text("direction").notNull().default("increase_is_good"),
    createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_impact_kpis_program_name_unique").on(table.programId, table.name),
    index("jusoor_impact_kpis_program_idx").on(table.programId),
  ],
);

export const insertImpactKpiSchema = createInsertSchema(impactKpisTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertImpactKpi = z.infer<typeof insertImpactKpiSchema>;
export type ImpactKpi = typeof impactKpisTable.$inferSelect;
