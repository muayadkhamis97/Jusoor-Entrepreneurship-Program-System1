import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getListChatMessagesQueryKey, getListChatTargetsQueryKey, getListChatThreadsQueryKey, listChatMessages,
  useCreateChatThread, useListChatMessages, useListChatTargets, useListChatThreads, useMarkChatRead, useSendChatMessage,
} from '@workspace/api-client-react';
import type { ChatMessage, ChatMessagePage, ChatTarget, ChatThread } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Typography } from '@workspace/program-editorial/components/ui/typography';
import { PaperSurface } from '@workspace/program-editorial/components/ui/paper-surface';
import { ArrowLeft, CircleAlert, Lock, MessagesSquare, Plus, Send, ShieldCheck, Users } from 'lucide-react';
import {
  CHAT_MESSAGE_MAX_LENGTH, CHAT_POLL_INTERVAL_MS, chatKindLabel, chatPrivacyNote, completeDraft, draftFor, draftForSend,
  highestMessageId, mergeMessages, olderCursor, shouldMarkRead, updateDraft,
  type ChatActor, type ChatDraftMap, type ChatKind, type ChatSendStateMap,
} from './chat-helpers';
import { LanguageToggle, currentLanguage, t, useAppLanguage } from './language';
import './chat.css';

const timeLabel = (value: string) => new Date(value).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const useDocumentVisible = () => {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
};

function KindIcon({ kind }: { kind: ChatKind }) {
  return kind === 'business' ? <Users size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />;
}

function PrivacyNote({ actor, kind }: { actor: ChatActor; kind: ChatKind }) {
  return <p className="chat-privacy"><ShieldCheck size={14} aria-hidden="true" /><span>{t(chatPrivacyNote(actor, kind))}</span></p>;
}

function ChatSkeleton({ label }: { label: string }) {
  return <div className="loading-panel chat-skeleton" aria-busy="true" aria-label={t(label)}><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>;
}

function ChatError({ title, retry, testId }: { title: string; retry: () => void; testId: string }) {
  return <div className="empty-panel error-panel chat-state" role="alert"><span className="empty-icon"><CircleAlert size={20} /></span><h3>{t(title)}</h3><p>{t('Your conversations are unchanged. Try again.')}</p><Button variant="pill" type="button" onClick={retry} data-testid={testId}>{t('Retry')}</Button></div>;
}

function NewChatPanel({ actor, onCreated, onCancel }: { actor: ChatActor; onCreated: (thread: ChatThread) => void; onCancel: () => void }) {
  const targetsQuery = useListChatTargets(actor, { query: { queryKey: getListChatTargetsQueryKey(actor) } });
  const create = useCreateChatThread();
  const client = useQueryClient();
  const [selectedKey, setSelectedKey] = useState('');
  const targets = targetsQuery.data ?? [];
  const keyOf = (target: ChatTarget) => `${target.programId}:${target.kind}:${target.targetId}`;
  const selected = targets.find(target => keyOf(target) === selectedKey);
  const groups = (['private', 'business'] as const).map(kind => ({ kind, items: targets.filter(target => target.kind === kind) })).filter(group => group.items.length);
  const start = async () => {
    if (!selected) return;
    try {
      const thread = await create.mutateAsync({ chatActor: actor, data: { programId: selected.programId, kind: selected.kind, targetId: selected.targetId } });
      void client.invalidateQueries({ queryKey: getListChatThreadsQueryKey(actor) });
      onCreated(thread);
    } catch {
      // Error is shown from mutation state.
    }
  };
  return <section className="chat-new" aria-labelledby="chat-new-title">
    <div className="chat-new-head"><Typography as="h2" variant="heading" id="chat-new-title">{t('Start a conversation')}</Typography><Button variant="text" type="button" onClick={onCancel}>{t('Cancel')}</Button></div>
    {targetsQuery.isLoading ? <ChatSkeleton label="Loading chat options" />
      : targetsQuery.isError ? <ChatError title="Chat options could not load." retry={() => void targetsQuery.refetch()} testId="button-retry-chat-targets" />
      : !targets.length ? <div className="empty-panel chat-state"><span className="empty-icon"><MessagesSquare size={20} /></span><h3>{t('No one is available to chat with yet.')}</h3><p>{t(actor === 'staff' ? 'Participants and business teams appear here once they are accepted into a program assigned to you.' : 'Chat opens once you are accepted into a program. Team chat also needs a linked business.')}</p></div>
      : <fieldset className="chat-target-list"><legend className="sr-only">{t('Choose who can see this conversation')}</legend>
        {groups.map(group => <div key={group.kind} className="chat-target-group">
          <Typography as="h3" variant="label">{t(chatKindLabel(group.kind))}</Typography>
          {group.items.map(target => <label key={keyOf(target)} className={`chat-target ${selectedKey === keyOf(target) ? 'selected' : ''}`}>
            <input type="radio" name="chat-target" value={keyOf(target)} checked={selectedKey === keyOf(target)} onChange={() => setSelectedKey(keyOf(target))} data-testid={`radio-chat-target-${target.kind}-${target.targetId}`} />
            <KindIcon kind={target.kind} /><span><b>{target.name}</b><small>{target.programName}</small></span>
          </label>)}
        </div>)}
      </fieldset>}
    {selected && <PrivacyNote actor={actor} kind={selected.kind} />}
    {create.isError && <div className="form-error" role="alert"><CircleAlert size={15} />{t('The conversation could not be opened. Try again.')}</div>}
    {targets.length > 0 && <Button variant="primary" type="button" disabled={!selected || create.isPending} onClick={() => void start()} data-testid="button-start-chat">{create.isPending ? t('Opening…') : t('Open conversation')}</Button>}
  </section>;
}

function Conversation({ actor, thread, draft, onDraftChange, sendStatus, onSend, onBack }: {
  actor: ChatActor; thread: ChatThread; draft: string; onDraftChange: (body: string) => void;
  sendStatus: 'idle' | 'sending' | 'error'; onSend: () => void; onBack: () => void;
}) {
  const client = useQueryClient();
  const visible = useDocumentVisible();
  const markRead = useMarkChatRead();
  const markReadRef = useRef(markRead.mutateAsync);
  markReadRef.current = markRead.mutateAsync;
  const [readFailed, setReadFailed] = useState(false);
  const lastMarked = useRef<Record<number, number>>({});
  const [older, setOlder] = useState<Record<number, { messages: ChatMessage[]; cursor: number | null }>>({});
  const [olderState, setOlderState] = useState<Record<number, 'idle' | 'loading' | 'error'>>({});
  const query = useListChatMessages(actor, thread.id, undefined, { query: { queryKey: getListChatMessagesQueryKey(actor, thread.id), enabled: !!thread.id, refetchInterval: CHAT_POLL_INTERVAL_MS, refetchIntervalInBackground: false } });
  const threadOlder = older[thread.id];
  const [seenMessages, setSeenMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    if (query.data) setSeenMessages(existing => mergeMessages(existing, query.data.messages));
  }, [query.data]);
  const messages = useMemo(() => mergeMessages(seenMessages, threadOlder?.messages, query.data?.messages), [seenMessages, threadOlder, query.data]);
  const cursor = olderCursor(query.data?.nextBeforeId, threadOlder?.cursor);
  const maxId = highestMessageId(messages);
  const listRef = useRef<HTMLOListElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const seenMax = useRef<{ thread: number; id: number | null }>({ thread: thread.id, id: null });

  useEffect(() => {
    const previous = seenMax.current;
    if (previous.thread === thread.id && previous.id !== null && maxId !== null && maxId > previous.id) {
      const fresh = messages.filter(item => item.id > (previous.id ?? 0) && !item.isOwn).length;
      if (fresh) setAnnouncement(`${fresh} ${t(fresh === 1 ? 'new message' : 'new messages')}`);
      listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
    } else if (previous.thread !== thread.id || previous.id === null) {
      setAnnouncement('');
      if (maxId !== null) listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
    }
    seenMax.current = { thread: thread.id, id: maxId };
  }, [maxId, thread.id, messages]);

  useEffect(() => {
    if (!query.isSuccess || !shouldMarkRead(maxId, lastMarked.current[thread.id], visible)) return;
    const threadId = thread.id;
    lastMarked.current[threadId] = maxId;
    markReadRef.current({ chatActor: actor, threadId, data: { lastReadMessageId: maxId } })
      .then(() => { setReadFailed(false); void client.invalidateQueries({ queryKey: getListChatThreadsQueryKey(actor) }); })
      .catch(() => { delete lastMarked.current[threadId]; setReadFailed(true); });
  }, [actor, client, maxId, query.isSuccess, thread.id, visible]);

  const loadOlder = async () => {
    if (cursor === null) return;
    const threadId = thread.id;
    setOlderState(state => ({ ...state, [threadId]: 'loading' }));
    try {
      const page: ChatMessagePage = await client.fetchQuery({ queryKey: getListChatMessagesQueryKey(actor, threadId, { beforeId: cursor }), queryFn: () => listChatMessages(actor, threadId, { beforeId: cursor }) });
      setOlder(state => ({ ...state, [threadId]: { messages: mergeMessages(state[threadId]?.messages, page.messages), cursor: page.nextBeforeId } }));
      setOlderState(state => ({ ...state, [threadId]: 'idle' }));
    } catch {
      setOlderState(state => ({ ...state, [threadId]: 'error' }));
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.trim() && sendStatus !== 'sending') onSend(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (draft.trim() && sendStatus !== 'sending') onSend(); }
  };
  const olderStatus = olderState[thread.id] ?? 'idle';

  return <section className="chat-conversation" aria-labelledby={`chat-title-${thread.id}`}>
    <header className="chat-conversation-head">
      <button type="button" className="icon-button chat-back" onClick={onBack} aria-label={t('Back to conversations')}><ArrowLeft size={17} className="chat-flip" /></button>
      <div><Typography as="p" variant="label" tone="accent"><KindIcon kind={thread.kind} /> {t(chatKindLabel(thread.kind))} · {thread.programName}</Typography><Typography as="h2" variant="heading" id={`chat-title-${thread.id}`}>{thread.title}</Typography></div>
    </header>
    <PrivacyNote actor={actor} kind={thread.kind} />
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <div className="chat-messages" tabIndex={0} aria-label={t('Message history')}>
      {query.isLoading ? <ChatSkeleton label="Loading messages" />
        : query.isError && !query.data ? <ChatError title="Messages could not load." retry={() => void query.refetch()} testId="button-retry-chat-messages" />
        : !messages.length ? <div className="empty-panel chat-state"><span className="empty-icon"><MessagesSquare size={20} /></span><h3>{t('No messages yet.')}</h3><p>{t('Write the first message below.')}</p></div>
        : <>
          {cursor !== null && <div className="chat-older"><Button variant="text" type="button" onClick={() => void loadOlder()} disabled={olderStatus === 'loading'} data-testid="button-load-older-chat">{olderStatus === 'loading' ? t('Loading earlier messages…') : t('Load earlier messages')}</Button>{olderStatus === 'error' && <span className="chat-inline-error" role="alert">{t('Earlier messages could not load. Try again.')}</span>}</div>}
          <ol className="chat-message-list" ref={listRef}>
            {messages.map(item => <li key={item.id} className={`chat-message ${item.isOwn ? 'own' : ''}`} data-testid={`chat-message-${item.id}`}>
              <div className="chat-message-meta"><b>{item.isOwn ? t('You') : item.senderName}</b>{!item.isOwn && <span>{t(item.senderRole === 'staff' ? 'Program team' : 'Participant')}</span>}<time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time></div>
              <p dir="auto">{item.body}</p>
            </li>)}
          </ol>
        </>}
      {query.isError && query.data && <p className="chat-inline-error" role="alert">{t('New messages could not refresh. Retrying shortly.')}</p>}
    </div>
    {readFailed && <p className="chat-inline-note">{t('Read status could not update. Your messages are still here.')}</p>}
    <form className="chat-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor={`chat-draft-${thread.id}`}>{t('Message')}</label>
      <textarea id={`chat-draft-${thread.id}`} className="form-control" rows={3} dir="auto" maxLength={CHAT_MESSAGE_MAX_LENGTH} value={draft} onChange={event => onDraftChange(event.target.value)} onKeyDown={onKeyDown} placeholder={t('Write a message')} data-testid="input-chat-message" />
      <div className="chat-composer-foot">
        <small dir="ltr">{draft.length} / {CHAT_MESSAGE_MAX_LENGTH}</small>
        {sendStatus === 'error' && <span className="chat-inline-error" role="alert">{t('Message not sent. Your draft is safe; send again to retry.')}</span>}
        <Button variant="primary" type="submit" disabled={!draft.trim() || sendStatus === 'sending'} data-testid="button-send-chat">{sendStatus === 'sending' ? t('Sending…') : <><Send size={15} className="chat-flip" aria-hidden="true" /> {t(sendStatus === 'error' ? 'Retry send' : 'Send')}</>}</Button>
      </div>
    </form>
  </section>;
}

export function ChatWorkspace({ actor }: { actor: ChatActor }) {
  useAppLanguage();
  const client = useQueryClient();
  const threadsQuery = useListChatThreads(actor, { query: { queryKey: getListChatThreadsQueryKey(actor), refetchInterval: CHAT_POLL_INTERVAL_MS, refetchIntervalInBackground: false } });
  const send = useSendChatMessage();
  const sendRef = useRef(send.mutateAsync);
  sendRef.current = send.mutateAsync;
  const [activeId, setActiveId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<ChatDraftMap>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [sendStates, setSendStates] = useState<ChatSendStateMap>({});
  const threads = useMemo(() => [...(threadsQuery.data ?? [])].sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')), [threadsQuery.data]);
  const [createdThread, setCreatedThread] = useState<ChatThread | null>(null);
  const active = threads.find(thread => thread.id === activeId) ?? (createdThread?.id === activeId ? createdThread : null);

  const sendDraft = useCallback(async (threadId: number) => {
    const prepared = draftForSend(draftsRef.current, threadId);
    draftsRef.current = prepared;
    setDrafts(prepared);
    const { body, clientMessageId } = draftFor(prepared, threadId);
    if (!body.trim()) return;
    setSendStates(state => ({ ...state, [threadId]: { status: 'sending' } }));
    try {
      const sent = await sendRef.current({ chatActor: actor, threadId, data: { body: body.trim(), clientMessageId } });
      setDrafts(map => completeDraft(map, threadId, clientMessageId));
      setSendStates(state => ({ ...state, [threadId]: { status: 'idle' } }));
      client.setQueryData<ChatMessagePage>(getListChatMessagesQueryKey(actor, threadId), old => old ? { ...old, messages: mergeMessages(old.messages, [sent]) } : old);
      void client.invalidateQueries({ queryKey: getListChatThreadsQueryKey(actor) });
    } catch {
      setSendStates(state => ({ ...state, [threadId]: { status: 'error' } }));
    }
  }, [actor, client]);

  const showList = !active && !creating;
  return <main className="chat-page">
    <div className="page-heading"><div><Typography as="p" variant="label" tone="accent">{t(actor === 'staff' ? 'PROGRAM TEAM / PRIVATE CHAT' : 'YOUR PROGRAM TEAM / PRIVATE CHAT')}</Typography><Typography as="h1" variant="heading" className="app-title">{t('Chat')}</Typography><Typography variant="body">{t(actor === 'staff' ? 'Practical support conversations with participants and business teams in your programs.' : 'Ask your program team for practical support, or talk with your business team.')}</Typography></div></div>
    <PaperSurface variant="panel" className={`chat-workspace ${showList ? 'show-list' : 'show-detail'}`}>
      <aside className="chat-sidebar" aria-label={t('Conversations')}>
        <div className="chat-sidebar-head"><Typography as="h2" variant="label">{t('Conversations')}</Typography><Button variant="pill" type="button" onClick={() => { setCreating(true); setActiveId(null); }} data-testid="button-new-chat"><Plus size={14} aria-hidden="true" /> {t('New chat')}</Button></div>
        {threadsQuery.isLoading ? <ChatSkeleton label="Loading conversations" />
          : threadsQuery.isError && !threadsQuery.data ? <ChatError title="Conversations could not load." retry={() => void threadsQuery.refetch()} testId="button-retry-chat-threads" />
          : !threads.length ? <div className="empty-panel chat-state"><span className="empty-icon"><MessagesSquare size={20} /></span><h3>{t('No conversations yet.')}</h3><p>{t('Start a private or business team chat. You will see who can read it before you open it.')}</p></div>
          : <ul className="chat-thread-list">{threads.map(thread => {
            const hasDraft = !!drafts[thread.id]?.body.trim();
            return <li key={thread.id}><button type="button" className={`chat-thread ${thread.id === activeId ? 'active' : ''}`} aria-current={thread.id === activeId ? 'true' : undefined} onClick={() => { setActiveId(thread.id); setCreating(false); }} data-testid={`button-chat-thread-${thread.id}`}>
              <span className="chat-thread-top"><KindIcon kind={thread.kind} /><b>{thread.title}</b>{thread.unreadCount > 0 && <span className="badge badge-warm" aria-label={`${thread.unreadCount} ${t('unread')}`}>{thread.unreadCount}</span>}</span>
              <small>{t(chatKindLabel(thread.kind))} · {thread.programName}</small>
              <span className="chat-thread-preview" dir="auto">{hasDraft ? `${t('Draft')}: ${drafts[thread.id].body}` : thread.lastMessage ?? t('No messages yet.')}</span>
            </button></li>;
          })}</ul>}
      </aside>
      <div className="chat-detail">
        {creating ? <NewChatPanel actor={actor} onCancel={() => setCreating(false)} onCreated={thread => { setCreatedThread(thread); setCreating(false); setActiveId(thread.id); }} />
          : active ? <Conversation key={active.id} actor={actor} thread={active} draft={draftFor(drafts, active.id).body} onDraftChange={body => setDrafts(map => updateDraft(map, active.id, body))} sendStatus={sendStates[active.id]?.status ?? 'idle'} onSend={() => void sendDraft(active.id)} onBack={() => setActiveId(null)} />
          : <div className="empty-panel chat-state chat-placeholder"><span className="empty-icon"><MessagesSquare size={20} /></span><h3>{t('Choose a conversation')}</h3><p>{t('Each conversation shows exactly who can read it.')}</p></div>}
      </div>
    </PaperSurface>
  </main>;
}

export function ParticipantChatPage() {
  useAppLanguage();
  return <div className="intake-page"><header className="intake-top"><Link href="/participant" className="text-link" data-testid="link-participant-dashboard"><ArrowLeft size={14} className="chat-flip" aria-hidden="true" /> {t('Back to dashboard')}</Link><div className="intake-header-actions"><LanguageToggle /></div></header>
    <div className="participant-wrap page-enter"><ChatWorkspace actor="participant" /></div>
  </div>;
}

export function StaffChatPage() {
  return <ChatWorkspace actor="staff" />;
}
