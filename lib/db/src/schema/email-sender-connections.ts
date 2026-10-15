import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { staffMembersTable } from "./staff";

export const emailSenderConnectionsTable = pgTable(
  "email_sender_connections",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull().default("gmail"),
    accountEmail: text("account_email").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    connectedByStaffId: integer("connected_by_staff_id").references(
      () => staffMembersTable.id,
      { onDelete: "set null" },
    ),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("email_sender_connections_provider_unique").on(table.provider)],
);

export const insertEmailSenderConnectionSchema = createInsertSchema(emailSenderConnectionsTable).omit({
  id: true,
  connectedAt: true,
  updatedAt: true,
});

export type InsertEmailSenderConnection = z.infer<typeof insertEmailSenderConnectionSchema>;
export type EmailSenderConnection = typeof emailSenderConnectionsTable.$inferSelect;
