import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { chatThreadsTable } from "./chat-threads";

export const chatReadsTable = pgTable("program_chat_reads", {
  threadId: integer("thread_id").notNull().references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  readerKey: text("reader_key").notNull(),
  lastReadMessageId: integer("last_read_message_id").notNull().default(0),
}, table => [primaryKey({ columns: [table.threadId, table.readerKey] })]);
export const insertChatReadSchema = createInsertSchema(chatReadsTable);
export type ChatRead = typeof chatReadsTable.$inferSelect;
