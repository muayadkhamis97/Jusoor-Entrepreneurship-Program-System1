import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { applicationsTable } from "./applications";
import { staffMembersTable } from "./staff";

export const participantInvitationsTable = pgTable("jusoor_participant_invitations", {
  applicationId: integer("application_id").primaryKey().references(() => applicationsTable.id, { onDelete: "cascade" }),
  invitedByStaffId: integer("invited_by_staff_id").references(() => staffMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParticipantInvitationSchema = createInsertSchema(participantInvitationsTable).omit({
  createdAt: true,
});

export type InsertParticipantInvitation = z.infer<typeof insertParticipantInvitationSchema>;
export type ParticipantInvitationRecord = typeof participantInvitationsTable.$inferSelect;
