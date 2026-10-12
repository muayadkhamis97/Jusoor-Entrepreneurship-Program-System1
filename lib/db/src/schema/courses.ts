import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export const courseModulesTable = pgTable("jusoor_course_modules", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  releaseAt: timestamp("release_at", { withTimezone: true }),
  isPublished: boolean("is_published").notNull().default(false),
  createdByStaffId: integer("created_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const courseMaterialsTable = pgTable("jusoor_course_materials", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => courseModulesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  kind: text("kind").notNull().default("document"),
  externalUrl: text("external_url"),
  objectPath: text("object_path"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  allowedRoles: text("allowed_roles").array().notNull().default(sql`ARRAY['participant']::text[]`),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCourseModuleSchema = createInsertSchema(courseModulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCourseMaterialSchema = createInsertSchema(courseMaterialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCourseModule = z.infer<typeof insertCourseModuleSchema>;
export type InsertCourseMaterial = z.infer<typeof insertCourseMaterialSchema>;
export type CourseModule = typeof courseModulesTable.$inferSelect;
export type CourseMaterial = typeof courseMaterialsTable.$inferSelect;
