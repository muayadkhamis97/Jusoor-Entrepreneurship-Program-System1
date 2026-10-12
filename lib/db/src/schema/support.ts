import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const supportTable = pgTable("jusoor_support", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("mentor"),
  provider: text("provider").notNull(),
  topic: text("topic").notNull(),
  scheduledDate: date("scheduled_date", { mode: "string" }),
  status: text("status").notNull().default("requested"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupportSchema = createInsertSchema(supportTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupport = z.infer<typeof insertSupportSchema>;
export type SupportEngagement = typeof supportTable.$inferSelect;
