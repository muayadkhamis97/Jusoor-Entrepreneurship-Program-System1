import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";
import { courseModulesTable } from "./courses";
import { programsTable } from "./programs";
import { staffMembersTable } from "./staff";

export const courseModuleProgressTable = pgTable(
  "jusoor_course_module_progress",
  {
    id: serial("id").primaryKey(),
    moduleId: integer("module_id").notNull().references(() => courseModulesTable.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    participantClerkUserId: text("participant_clerk_user_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_course_module_progress_application_module_unique")
      .on(table.applicationId, table.moduleId),
    index("jusoor_course_module_progress_application_idx").on(table.applicationId),
  ],
);

export const courseProgramActivityTable = pgTable(
  "jusoor_course_program_activity",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    participantClerkUserId: text("participant_clerk_user_id").notNull(),
    activeSeconds: integer("active_seconds").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_course_program_activity_application_unique").on(table.applicationId),
  ],
);

export const courseCertificatesTable = pgTable(
  "jusoor_course_certificates",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    programId: integer("program_id").notNull().references(() => programsTable.id, { onDelete: "cascade" }),
    certificateCode: text("certificate_code").notNull().unique(),
    participantName: text("participant_name").notNull(),
    businessName: text("business_name").notNull(),
    programName: text("program_name").notNull(),
    issuedByStaffId: integer("issued_by_staff_id").notNull().references(() => staffMembersTable.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("jusoor_course_certificates_application_unique").on(table.applicationId),
    index("jusoor_course_certificates_program_idx").on(table.programId, table.issuedAt),
  ],
);

export const courseReminderDeliveriesTable = pgTable(
  "jusoor_course_reminder_deliveries",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
    moduleId: integer("module_id").notNull().references(() => courseModulesTable.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    reminderKind: text("reminder_kind").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_course_reminders_application_module_due_kind_unique")
      .on(table.applicationId, table.moduleId, table.dueAt, table.reminderKind),
    index("jusoor_course_reminders_status_retry_idx").on(table.status, table.nextAttemptAt),
  ],
);
