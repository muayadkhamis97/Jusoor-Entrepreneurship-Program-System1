import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const programBrandingTable = pgTable("jusoor_program_branding", {
  id: integer("id").primaryKey().default(1),
  brandName: text("brand_name").notNull().default("Jusoor"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#28665a"),
  accentColor: text("accent_color").notNull().default("#d98a46"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProgramBrandingSchema = createInsertSchema(programBrandingTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertProgramBranding = z.infer<typeof insertProgramBrandingSchema>;
export type StoredProgramBranding = typeof programBrandingTable.$inferSelect;
