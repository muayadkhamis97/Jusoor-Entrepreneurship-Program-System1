import type { ChatMessage } from '@workspace/api-client-react';

export type ChatActor = 'staff' | 'participant';
export type ChatKind = 'private' | 'business';
export type ChatDraft = { body: string; clientMessageId: string };
export type ChatDraftMap = Record<number, ChatDraft>;
export type ChatSendState = { status: 'idle' | 'sending' | 'error' };
export type ChatSendStateMap = Record<number, ChatSendState>;

export const CHAT_MESSAGE_MAX_LENGTH = 4000;
export const CHAT_POLL_INTERVAL_MS = 10_000;

export const newClientMessageId = (): string => crypto.randomUUID();

/** Return the draft for a thread without mutating the map. */
export function draftFor(map: ChatDraftMap, threadId: number): ChatDraft {
  return map[threadId] ?? { body: '', clientMessageId: '' };
}

/**
 * Store new draft text for one thread. The idempotency key changes only when the
 * text actually changes, so retrying an unchanged draft reuses the same key.
 */
export function updateDraft(map: ChatDraftMap, threadId: number, body: string, makeId: () => string = newClientMessageId): ChatDraftMap {
  const current = map[threadId];
  if (current && current.body === body) return map;
  return { ...map, [threadId]: { body, clientMessageId: makeId() } };
}

/** Ensure the draft has a key before sending; keeps any existing key for retries. */
export function draftForSend(map: ChatDraftMap, threadId: number, makeId: () => string = newClientMessageId): ChatDraftMap {
  const current = map[threadId];
  if (current?.clientMessageId) return map;
  return { ...map, [threadId]: { body: current?.body ?? '', clientMessageId: makeId() } };
}

/**
 * After a successful send, clear the thread draft and rotate its key — but only if
 * the draft still belongs to the message that was sent (the user may have typed more).
 */
export function completeDraft(map: ChatDraftMap, threadId: number, sentClientMessageId: string, makeId: () => string = newClientMessageId): ChatDraftMap {
  const current = map[threadId];
  if (current && current.clientMessageId !== sentClientMessageId) return map;
  return { ...map, [threadId]: { body: '', clientMessageId: makeId() } };
}

/** Merge message pages into one chronological, de-duplicated list. */
export function mergeMessages(...pages: (readonly ChatMessage[] | undefined)[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const page of pages) for (const message of page ?? []) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * The cursor for loading older history: once older pages are loaded their own
 * cursor wins; otherwise use the newest page's cursor. Polling never resets it.
 */
export function olderCursor(newestCursor: number | null | undefined, loadedOlderCursor: number | null | undefined): number | null {
  if (loadedOlderCursor !== undefined) return loadedOlderCursor;
  return newestCursor ?? null;
}

export function highestMessageId(messages: readonly ChatMessage[]): number | null {
  return messages.length ? Math.max(...messages.map(message => message.id)) : null;
}

export function shouldMarkRead(highestId: number | null, lastMarkedId: number | undefined, documentVisible: boolean): highestId is number {
  return documentVisible && highestId !== null && highestId > (lastMarkedId ?? 0);
}

/** Fixed, translatable copy describing who can read a conversation. */
export function chatPrivacyNote(actor: ChatActor, kind: ChatKind): string {
  if (kind === 'business') return 'Team chat: visible to accepted members of this business and authorized program staff and admins. Other founders cannot see it.';
  return actor === 'participant'
    ? 'Private chat: visible only to you and authorized program staff and admins for this program. Other founders cannot see it.'
    : 'Private chat: visible only to this participant and authorized program staff and admins. Other founders cannot see it.';
}

export const chatKindLabel = (kind: ChatKind) => kind === 'business' ? 'Business team chat' : 'Private chat';
