import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { programsTable } from "./programs";
import { sessionsTable } from "./sessions";
import { staffMembersTable } from "./staff";

export const trainingAssignmentsTable = pgTable("jusoor_training_assignments", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => sessionsTable.id, { onDelete: "set null" }),
  createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingSubmissionsTable = pgTable("jusoor_training_submissions", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => trainingAssignmentsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  status: text("status").notNull().default("submitted"),
  score: real("score"),
  feedback: text("feedback"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("jusoor_training_submission_assignment_business_unique").on(table.assignmentId, table.businessId),
]);

export const trainingQuestionsTable = pgTable("jusoor_training_questions", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => sessionsTable.id, { onDelete: "set null" }),
  assignmentId: integer("assignment_id").references(() => trainingAssignmentsTable.id, { onDelete: "set null" }),
  askedByClerkUserId: text("asked_by_clerk_user_id").notNull(),
  question: text("question").notNull(),
  reply: text("reply"),
  answeredByStaffId: integer("answered_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
});

export const insertTrainingAssignmentSchema = createInsertSchema(trainingAssignmentsTable).omit({
  id: true,
  createdAt: true,
});
export const insertTrainingSubmissionSchema = createInsertSchema(trainingSubmissionsTable).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
});
export const insertTrainingQuestionSchema = createInsertSchema(trainingQuestionsTable).omit({
  id: true,
  createdAt: true,
  repliedAt: true,
});

export type InsertTrainingAssignment = z.infer<typeof insertTrainingAssignmentSchema>;
export type TrainingAssignment = typeof trainingAssignmentsTable.$inferSelect;
export type TrainingSubmission = typeof trainingSubmissionsTable.$inferSelect;
export type TrainingQuestion = typeof trainingQuestionsTable.$inferSelect;
