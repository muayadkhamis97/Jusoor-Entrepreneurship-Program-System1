import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const pitchesTable = pgTable("jusoor_pitches", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull().default("pitch_day"),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  judges: text("judges"),
  score: real("score"),
  grantDecision: text("grant_decision").notNull().default("pending"),
  grantAmount: real("grant_amount"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPitchSchema = createInsertSchema(pitchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPitch = z.infer<typeof insertPitchSchema>;
export type PitchRecord = typeof pitchesTable.$inferSelect;
