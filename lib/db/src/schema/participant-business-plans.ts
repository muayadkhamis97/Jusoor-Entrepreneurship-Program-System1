import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { applicationsTable } from "./applications";
import { z } from "zod/v4";

export const participantBusinessPlansTable = pgTable(
  "jusoor_participant_business_plans",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    acquisitionChannels: text("acquisition_channels").notNull().default(""),
    outreachActions: text("outreach_actions").notNull().default(""),
    fulfillmentSteps: text("fulfillment_steps").notNull().default(""),
    reviewSignals: text("review_signals").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jusoor_participant_business_plans_application_unique").on(table.applicationId),
  ],
);

export const insertParticipantBusinessPlanSchema = createInsertSchema(participantBusinessPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertParticipantBusinessPlan = z.infer<typeof insertParticipantBusinessPlanSchema>;
export type ParticipantBusinessPlan = typeof participantBusinessPlansTable.$inferSelect;
