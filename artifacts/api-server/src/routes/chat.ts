import { Router, type IRouter } from "express";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import {
  CreateChatThreadBody, SendChatMessageBody, MarkChatReadBody,
  ListChatMessagesQueryParams, ListChatTargetsResponse, ListChatThreadsResponse,
  CreateChatThreadResponse, ListChatMessagesResponse, SendChatMessageResponse,
} from "@workspace/api-zod";
import { chatMessagesTable, chatReadsTable, chatThreadsTable, db, staffMembersTable, userProfilesTable } from "@workspace/db";
import { chatActorKey, chatTargets, targetForThread, type ChatActor, type ChatTarget } from "../lib/chatAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import type { ParticipantAccess } from "../middlewares/participantAccess";

function targetCondition(target: ChatTarget) {
  return and(eq(chatThreadsTable.programId, target.programId), eq(chatThreadsTable.kind, target.kind),
    target.kind === "private" ? eq(chatThreadsTable.participantId, target.targetId) : eq(chatThreadsTable.businessId, target.targetId));
}

function messageView(message: typeof chatMessagesTable.$inferSelect, actor: ChatActor) {
  return { id: message.id, threadId: message.threadId, body: message.body, senderName: message.senderName,
    senderRole: message.senderRole, isOwn: message.senderKey === chatActorKey(actor), createdAt: message.createdAt };
}

async function conversation(actor: ChatActor, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const targets = await chatTargets(actor);
  if (!targets.length) return null;
  const [thread] = await db.select().from(chatThreadsTable)
    .where(and(eq(chatThreadsTable.id, id), or(...targets.map(targetCondition)))).limit(1);
  return thread && targetForThread(targets, thread) ? { thread, targets } : null;
}

async function threadViews(actor: ChatActor, targets: ChatTarget[], id?: number) {
  if (!targets.length) return [];
  const key = chatActorKey(actor);
  const rows = await db.select({
    thread: chatThreadsTable,
    // Keep the correlated outer reference explicitly qualified: Drizzle removes
    // Column qualification in single-table projections, which can bind "id" to
    // the inner message table instead. Values remain bound parameters.
    lastMessage: sql<string | null>`(select left(m.body, 160) from ${chatMessagesTable} m where m.thread_id = "program_chat_threads"."id" order by m.id desc limit 1)`,
    lastMessageAt: sql<Date | null>`(select m.created_at from ${chatMessagesTable} m where m.thread_id = "program_chat_threads"."id" order by m.id desc limit 1)`,
    unreadCount: sql<number>`(select count(*)::integer from ${chatMessagesTable} m where m.thread_id = "program_chat_threads"."id" and m.sender_key <> ${key} and m.id > coalesce((select r.last_read_message_id from ${chatReadsTable} r where r.thread_id = "program_chat_threads"."id" and r.reader_key = ${key}), 0))`,
  }).from(chatThreadsTable)
    .where(and(id ? eq(chatThreadsTable.id, id) : undefined, or(...targets.map(targetCondition))))
    .orderBy(desc(chatThreadsTable.updatedAt), desc(chatThreadsTable.id));
  return rows.flatMap(row => {
    const target = targetForThread(targets, row.thread);
    return target ? [{
      id: row.thread.id, programId: target.programId, programName: target.programName,
      kind: target.kind, title: target.name, lastMessage: row.lastMessage,
      lastMessageAt: row.lastMessageAt, unreadCount: Number(row.unreadCount),
    }] : [];
  });
}

export function createChatRouter(kind: ChatActor["kind"]): IRouter {
  const router = Router();
  // The app mounts real authentication ahead of this router. Keep an additional
  // local check so an accidental unguarded mount fails closed.
  router.use((_req, res, next) => {
    if (kind === "staff") {
      const staff = res.locals.staff as StaffAccess | undefined;
      if (!staff || !["coordinator", "staff"].includes(staff.role)) {
        res.status(staff ? 403 : 401).json({ error: "Program staff access is required." }); return;
      }
      res.locals.chatActor = { kind, staff } satisfies ChatActor;
    } else {
      const participant = res.locals.participant as ParticipantAccess | undefined;
      if (!participant?.userId) { res.status(401).json({ error: "Sign in is required." }); return; }
      res.locals.chatActor = { kind, participant } satisfies ChatActor;
    }
    next();
  });
  router.get("/targets", async (_req, res) => {
    res.json(ListChatTargetsResponse.parse(await chatTargets(res.locals.chatActor)));
  });
  router.get("/threads", async (_req, res) => {
    const actor = res.locals.chatActor as ChatActor;
    res.json(ListChatThreadsResponse.parse(await threadViews(actor, await chatTargets(actor))));
  });
  router.post("/threads", async (req, res) => {
    const input = CreateChatThreadBody.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Choose a valid conversation target." }); return; }
    const actor = res.locals.chatActor as ChatActor;
    const targets = await chatTargets(actor);
    const target = targets.find(target => target.programId === input.data.programId
      && target.kind === input.data.kind && target.targetId === input.data.targetId);
    if (!target) { res.status(403).json({ error: "This conversation is not available to your account." }); return; }
    await db.insert(chatThreadsTable).values({
      programId: target.programId, kind: target.kind,
      participantId: target.kind === "private" ? target.targetId : null,
      businessId: target.kind === "business" ? target.targetId : null,
    }).onConflictDoNothing();
    const [thread] = await db.select({ id: chatThreadsTable.id }).from(chatThreadsTable).where(targetCondition(target)).limit(1);
    const [view] = await threadViews(actor, targets, thread.id);
    res.json(CreateChatThreadResponse.parse(view));
  });
  router.get("/threads/:threadId/messages", async (req, res) => {
    const actor = res.locals.chatActor as ChatActor;
    const access = await conversation(actor, Number(req.params.threadId));
    if (!access) { res.status(404).json({ error: "Conversation not found." }); return; }
    const params = ListChatMessagesQueryParams.safeParse(req.query);
    if (!params.success || (params.data.beforeId !== undefined && !Number.isSafeInteger(params.data.beforeId))) {
      res.status(400).json({ error: "Invalid message cursor." }); return;
    }
    const rows = await db.select().from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.threadId, access.thread.id), params.data.beforeId ? lt(chatMessagesTable.id, params.data.beforeId) : undefined))
      .orderBy(desc(chatMessagesTable.id)).limit(51);
    const page = rows.slice(0, 50).reverse();
    res.json(ListChatMessagesResponse.parse({
      messages: page.map(message => messageView(message, actor)), nextBeforeId: rows.length > 50 ? page[0].id : null,
    }));
  });
  router.post("/threads/:threadId/messages", async (req, res) => {
    const actor = res.locals.chatActor as ChatActor;
    const access = await conversation(actor, Number(req.params.threadId));
    if (!access) { res.status(404).json({ error: "Conversation not found." }); return; }
    const input = SendChatMessageBody.safeParse(req.body);
    if (!input.success || !input.data.body.trim()) {
      res.status(400).json({ error: "Write a message between 1 and 4,000 characters with a valid send identifier." }); return;
    }
    let senderName = access.targets.find(target => target.programId === access.thread.programId && target.kind === "private")?.name ?? "Participant";
    if (actor.kind === "staff") {
      const [profile] = await db.select({ name: userProfilesTable.displayName }).from(staffMembersTable)
        .leftJoin(userProfilesTable, eq(staffMembersTable.clerkUserId, userProfilesTable.userId))
        .where(eq(staffMembersTable.id, actor.staff.id)).limit(1);
      senderName = profile?.name?.trim() || "Program team";
    }
    const senderKey = chatActorKey(actor);
    const message = await db.transaction(async tx => {
      const [created] = await tx.insert(chatMessagesTable).values({
        threadId: access.thread.id, senderKey, senderName, senderRole: actor.kind,
        body: input.data.body.trim(), clientMessageId: input.data.clientMessageId,
      }).onConflictDoNothing().returning();
      if (created) {
        await tx.update(chatThreadsTable).set({ updatedAt: new Date() }).where(eq(chatThreadsTable.id, access.thread.id));
        return created;
      }
      const [original] = await tx.select().from(chatMessagesTable).where(and(
        eq(chatMessagesTable.threadId, access.thread.id), eq(chatMessagesTable.senderKey, senderKey),
        eq(chatMessagesTable.clientMessageId, input.data.clientMessageId),
      )).limit(1);
      return original;
    });
    if (!message || message.body !== input.data.body.trim()) {
      res.status(409).json({ error: "This send identifier has already been used. Start a new message." }); return;
    }
    res.status(201).json(SendChatMessageResponse.parse(messageView(message, actor)));
  });
  router.post("/threads/:threadId/read", async (req, res) => {
    const actor = res.locals.chatActor as ChatActor;
    const access = await conversation(actor, Number(req.params.threadId));
    if (!access) { res.status(404).json({ error: "Conversation not found." }); return; }
    const input = MarkChatReadBody.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Choose a valid displayed message." }); return; }
    const [message] = await db.select({ id: chatMessagesTable.id }).from(chatMessagesTable).where(and(
      eq(chatMessagesTable.threadId, access.thread.id), eq(chatMessagesTable.id, input.data.lastReadMessageId),
    )).limit(1);
    if (!message) { res.status(404).json({ error: "Message not found in this conversation." }); return; }
    await db.insert(chatReadsTable).values({ threadId: access.thread.id, readerKey: chatActorKey(actor), lastReadMessageId: message.id })
      .onConflictDoUpdate({ target: [chatReadsTable.threadId, chatReadsTable.readerKey],
        set: { lastReadMessageId: sql`greatest(${chatReadsTable.lastReadMessageId}, ${message.id})` } });
    res.json({ ok: true });
  });
  router.use((error: any, _req: any, res: any, next: any) => {
    if (error?.code === "42P01" || error?.cause?.code === "42P01") {
      res.status(503).json({ error: "Chat needs the program data update before it can be used." }); return;
    }
    next(error);
  });
  return router;
}
