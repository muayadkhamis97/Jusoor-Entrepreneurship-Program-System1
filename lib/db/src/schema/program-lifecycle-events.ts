import { createInsertSchema } from "drizzle-zod";
import { check, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";

export const programLifecycleEventsTable = pgTable("jusoor_program_lifecycle_events", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  actorStaffId: integer("actor_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("jusoor_program_lifecycle_events_action_check", sql`${table.action} in ('archived', 'restored')`),
]);

export const insertProgramLifecycleEventSchema = createInsertSchema(programLifecycleEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertProgramLifecycleEvent = z.infer<typeof insertProgramLifecycleEventSchema>;
export type ProgramLifecycleEvent = typeof programLifecycleEventsTable.$inferSelect;
