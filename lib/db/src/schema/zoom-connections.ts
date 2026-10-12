import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { staffMembersTable } from "./staff";

export const zoomConnectionsTable = pgTable("jusoor_zoom_connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("zoom").unique(),
  connectedByStaffId: integer("connected_by_staff_id").references(
    () => staffMembersTable.id,
    { onDelete: "set null" },
  ),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertZoomConnectionSchema = createInsertSchema(zoomConnectionsTable).omit({
  id: true,
  connectedAt: true,
  updatedAt: true,
});

export type InsertZoomConnection = z.infer<typeof insertZoomConnectionSchema>;
export type ZoomConnection = typeof zoomConnectionsTable.$inferSelect;
