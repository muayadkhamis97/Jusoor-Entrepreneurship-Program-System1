import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { courseModulesTable } from "./courses";
import { staffMembersTable } from "./staff";

export const courseDiscussionPostsTable = pgTable(
  "jusoor_course_discussion_posts",
  {
    id: serial("id").primaryKey(),
    moduleId: integer("module_id").notNull().references(() => courseModulesTable.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references(
      (): AnyPgColumn => courseDiscussionPostsTable.id,
      { onDelete: "cascade" },
    ),
    authorRole: text("author_role").notNull(),
    authorStaffId: integer("author_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    authorBusinessId: integer("author_business_id").references(() => businessesTable.id, { onDelete: "set null" }),
    authorClerkUserId: text("author_clerk_user_id").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("jusoor_course_discussion_module_created_idx").on(table.moduleId, table.createdAt),
    index("jusoor_course_discussion_parent_idx").on(table.parentId),
    check(
      "jusoor_course_discussion_author_role_check",
      sql`${table.authorRole} in ('participant', 'trainer', 'coordinator')`,
    ),
  ],
);

export const insertCourseDiscussionPostSchema = createInsertSchema(courseDiscussionPostsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCourseDiscussionPost = z.infer<typeof insertCourseDiscussionPostSchema>;
export type CourseDiscussionPost = typeof courseDiscussionPostsTable.$inferSelect;
