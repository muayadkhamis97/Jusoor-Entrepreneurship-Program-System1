import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { pitchesTable } from "./pitches";
import { staffMembersTable } from "./staff";

export const pitchJudgesTable = pgTable("jusoor_pitch_judges", {
  id: serial("id").primaryKey(),
  pitchId: integer("pitch_id").notNull().references(() => pitchesTable.id, { onDelete: "cascade" }),
  judgeStaffId: integer("judge_staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "cascade" }),
  score: real("score"),
  feedback: text("feedback"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("jusoor_pitch_judge_unique").on(table.pitchId, table.judgeStaffId),
]);

export const insertPitchJudgeSchema = createInsertSchema(pitchJudgesTable).omit({
  id: true,
  assignedAt: true,
  submittedAt: true,
});
export type InsertPitchJudge = z.infer<typeof insertPitchJudgeSchema>;
export type PitchJudge = typeof pitchJudgesTable.$inferSelect;
