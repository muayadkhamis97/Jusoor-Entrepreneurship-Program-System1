import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";
import { businessesTable } from "./businesses";
import { courseModulesTable } from "./courses";
import { staffMembersTable } from "./staff";

export type QuizQuestionType = "multiple_choice" | "true_false" | "ordering";
export type QuizChoice = { id: string; text: string };
export type QuizCorrectAnswer = string | boolean | string[];
export type QuizAnswerResult = {
  questionId: number;
  prompt: string;
  submittedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string | null;
};

export const courseQuizzesTable = pgTable("jusoor_course_quizzes", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => courseModulesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  language: text("language").notNull().default("en"),
  isPublished: boolean("is_published").notNull().default(false),
  createdByStaffId: integer("created_by_staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const courseQuizQuestionsTable = pgTable("jusoor_course_quiz_questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => courseQuizzesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  questionType: text("question_type").$type<QuizQuestionType>().notNull(),
  prompt: text("prompt").notNull(),
  choices: jsonb("choices").$type<QuizChoice[]>().notNull().default([]),
  correctAnswer: jsonb("correct_answer").$type<QuizCorrectAnswer>().notNull(),
  explanation: text("explanation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const courseQuizAttemptsTable = pgTable("jusoor_course_quiz_attempts", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => courseQuizzesTable.id, { onDelete: "cascade" }),
  participantClerkUserId: text("participant_clerk_user_id").notNull(),
  participantBusinessId: integer("participant_business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  applicationId: integer("application_id").references(() => applicationsTable.id, { onDelete: "set null" }),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  answers: jsonb("answers").$type<QuizAnswerResult[]>().notNull().default([]),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCourseQuizSchema = createInsertSchema(courseQuizzesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCourseQuizQuestionSchema = createInsertSchema(courseQuizQuestionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCourseQuizAttemptSchema = createInsertSchema(courseQuizAttemptsTable).omit({
  id: true,
  submittedAt: true,
});

export type InsertCourseQuiz = z.infer<typeof insertCourseQuizSchema>;
export type InsertCourseQuizQuestion = z.infer<typeof insertCourseQuizQuestionSchema>;
export type InsertCourseQuizAttempt = z.infer<typeof insertCourseQuizAttemptSchema>;
export type CourseQuiz = typeof courseQuizzesTable.$inferSelect;
export type CourseQuizQuestion = typeof courseQuizQuestionsTable.$inferSelect;
export type CourseQuizAttempt = typeof courseQuizAttemptsTable.$inferSelect;
