// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./programs";
export * from "./businesses";
export * from "./sessions";
export * from "./session-attendance";
export * from "./support";
export * from "./impact-kpis";
export * from "./impact-kpi-values";
export * from "./pitches";
export * from "./staff";
export * from "./applications";
export * from "./training";
export * from "./pitch-judges";
export * from "./courses";
export * from "./zoom-connections";
export * from "./announcements";
export * from "./calendly-meetings";
export * from "./zoom-recording-alerts";
export * from "./zoom-attendance";
export * from "./grant-receipts";