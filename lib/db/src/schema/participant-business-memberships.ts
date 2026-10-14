import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";
import { businessesTable } from "./businesses";
import { staffMembersTable } from "./staff";
import { z } from "zod/v4";

export const participantBusinessMembershipsTable = pgTable("jusoor_participant_business_memberships", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull().references(() => applicationsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  assignedByStaffId: integer("assigned_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("jusoor_participant_business_memberships_application_uq").on(table.applicationId),
  index("jusoor_participant_business_memberships_business_idx").on(table.businessId),
]);

export const insertParticipantBusinessMembershipSchema = createInsertSchema(participantBusinessMembershipsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertParticipantBusinessMembership = z.infer<typeof insertParticipantBusinessMembershipSchema>;
export type ParticipantBusinessMembership = typeof participantBusinessMembershipsTable.$inferSelect;
