import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { chatThreadsTable } from "./chat-threads";

export const chatMessagesTable = pgTable("program_chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  senderKey: text("sender_key").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  body: text("body").notNull(),
  clientMessageId: uuid("client_message_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("program_chat_message_thread_idx").on(table.threadId, table.id),
  uniqueIndex("program_chat_message_retry_uq").on(table.threadId, table.senderKey, table.clientMessageId),
  check("program_chat_message_body_check", sql`char_length(btrim(${table.body})) BETWEEN 1 AND 4000`),
  check("program_chat_message_role_check", sql`${table.senderRole} IN ('staff', 'participant')`),
]);
export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
