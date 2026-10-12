import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export const applicationsTable = pgTable(
  "jusoor_applications",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
    founderName: text("founder_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    businessName: text("business_name").notNull(),
    industry: text("industry"),
    website: text("website"),
    summary: text("summary").notNull(),
    supportNeeds: text("support_needs").notNull(),
    status: text("status").notNull().default("submitted"),
    reviewNotes: text("review_notes"),
    businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
    clerkUserId: text("clerk_user_id"),
    reviewedByStaffId: integer("reviewed_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("jusoor_applications_program_email_unique").on(table.programId, table.email),
    uniqueIndex("jusoor_applications_business_unique").on(table.businessId),
    index("jusoor_applications_clerk_user_id_idx").on(table.clerkUserId),
  ],
);

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
