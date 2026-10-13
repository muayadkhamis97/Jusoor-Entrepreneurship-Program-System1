import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";
import { sessionsTable } from "./sessions";
import { staffMembersTable } from "./staff";

export type SessionActivityQuestion = {
  id: string;
  type: "single_choice" | "rating" | "short_text";
  prompt: string;
  options?: Array<{ id: string; label: string }>;
};

export type SessionActivityAnswer = {
  questionId: string;
  value: string | number;
};

export const sessionInteractiveActivitiesTable = pgTable("jusoor_session_interactive_activities", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  questions: jsonb("questions").$type<SessionActivityQuestion[]>().notNull(),
  createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sessionInteractiveResponsesTable = pgTable("jusoor_session_interactive_responses", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => sessionInteractiveActivitiesTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<SessionActivityAnswer[]>().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("jusoor_session_interactive_response_business_unique").on(table.activityId, table.businessId),
]);

export const insertSessionInteractiveActivitySchema = createInsertSchema(sessionInteractiveActivitiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSessionInteractiveResponseSchema = createInsertSchema(sessionInteractiveResponsesTable).omit({
  id: true,
  submittedAt: true,
});

export type SessionInteractiveActivity = typeof sessionInteractiveActivitiesTable.$inferSelect;
export type SessionInteractiveResponse = typeof sessionInteractiveResponsesTable.$inferSelect;
