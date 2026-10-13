import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { pitchesTable } from "./pitches";
import { staffMembersTable } from "./staff";

export const grantReceiptsTable = pgTable("jusoor_grant_receipts", {
  id: serial("id").primaryKey(),
  pitchId: integer("pitch_id").notNull().references(() => pitchesTable.id, { onDelete: "restrict" }),
  kind: text("kind").notNull().default("received"),
  amount: real("amount").notNull(),
  receivedOn: date("received_on", { mode: "string" }).notNull(),
  reference: text("reference"),
  notes: text("notes"),
  recordedByStaffId: integer("recorded_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGrantReceiptSchema = createInsertSchema(grantReceiptsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertGrantReceipt = z.infer<typeof insertGrantReceiptSchema>;
export type GrantReceiptRecord = typeof grantReceiptsTable.$inferSelect;
