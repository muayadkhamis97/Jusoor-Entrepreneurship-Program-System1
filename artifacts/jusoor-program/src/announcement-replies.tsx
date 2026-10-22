import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListParticipantAnnouncementRepliesQueryKey, getListStaffAnnouncementRepliesQueryKey,
  useListParticipantAnnouncementReplies, useListStaffAnnouncementReplies,
  useReadParticipantAnnouncementReplies, useReadStaffAnnouncementReplies,
  useSendParticipantAnnouncementReply, useSendStaffAnnouncementReply,
} from '@workspace/api-client-react';
import type { AnnouncementConversation } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { AlertCircle, Check, CheckCheck, Lock, MessageSquareReply } from 'lucide-react';
import { currentLanguage, t, useAppLanguage } from './language';

type Viewer = 'staff' | 'participant';
const POLL_MS = 20_000;
const fmt = (value: string) => new Date(value).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

type Shared = {
  announcementId: number;
  viewer: Viewer;
  conversations: AnnouncementConversation[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refreshedAt: number;
  retry: () => void;
  send: (applicationId: number, body: string, callbacks: { onSuccess: () => void; onError: () => void }) => void;
  sendingId: number | null;
  markRead: (applicationId: number, throughId: number, onError: () => void) => void;
};

export function AnnouncementReplies({ announcementId, viewer }: { announcementId: number; viewer: Viewer }) {
  return viewer === 'staff' ? <StaffReplies announcementId={announcementId} /> : <ParticipantReplies announcementId={announcementId} />;
}

function StaffReplies({ announcementId }: { announcementId: number }) {
  const client = useQueryClient();
  const queryKey = getListStaffAnnouncementRepliesQueryKey(announcementId);
  const query = useListStaffAnnouncementReplies(announcementId, { query: { queryKey, refetchInterval: POLL_MS } });
  const send = useSendStaffAnnouncementReply();
  const read = useReadStaffAnnouncementReplies();
  return <ConversationList
    announcementId={announcementId} viewer="staff" conversations={query.data} isLoading={query.isLoading} isError={query.isError} refreshedAt={query.dataUpdatedAt}
    retry={() => void query.refetch()}
    sendingId={send.isPending ? send.variables?.applicationId ?? null : null}
    send={(applicationId, body, cb) => send.mutate({ id: announcementId, applicationId, data: { body } }, {
      onSuccess: () => { cb.onSuccess(); void client.invalidateQueries({ queryKey }); }, onError: cb.onError,
    })}
    markRead={(applicationId, throughId, onError) => read.mutate({ id: announcementId, applicationId, data: { throughId } }, {
      onSuccess: () => void client.invalidateQueries({ queryKey }), onError,
    })}
  />;
}

function ParticipantReplies({ announcementId }: { announcementId: number }) {
  const client = useQueryClient();
  const queryKey = getListParticipantAnnouncementRepliesQueryKey(announcementId);
  const query = useListParticipantAnnouncementReplies(announcementId, { query: { queryKey, refetchInterval: POLL_MS } });
  const send = useSendParticipantAnnouncementReply();
  const read = useReadParticipantAnnouncementReplies();
  return <ConversationList
    announcementId={announcementId} viewer="participant" conversations={query.data} isLoading={query.isLoading} isError={query.isError} refreshedAt={query.dataUpdatedAt}
    retry={() => void query.refetch()}
    sendingId={send.isPending ? send.variables?.applicationId ?? null : null}
    send={(applicationId, body, cb) => send.mutate({ id: announcementId, applicationId, data: { body } }, {
      onSuccess: () => { cb.onSuccess(); void client.invalidateQueries({ queryKey }); }, onError: cb.onError,
    })}
    markRead={(applicationId, throughId, onError) => read.mutate({ id: announcementId, applicationId, data: { throughId } }, {
      onSuccess: () => void client.invalidateQueries({ queryKey }), onError,
    })}
  />;
}

function ConversationList(props: Shared) {
  useAppLanguage();
  const { announcementId, viewer, conversations, isLoading, isError, retry } = props;
  const [open, setOpen] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sendError, setSendError] = useState<number | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const [readError, setReadError] = useState<number | null>(null);
  const requestedThrough = useRef<Record<number, number>>({});
  const markReadRef = useRef(props.markRead);
  markReadRef.current = props.markRead;

  const openConversation = conversations?.find(item => item.applicationId === open);
  const incoming = viewer === 'staff' ? 'participant' : 'staff';
  const unreadThrough = openConversation
    ? Math.max(0, ...openConversation.messages.filter(m => m.sender === incoming && !m.readAt).map(m => m.id))
    : 0;

  // Mark read only for the expanded conversation, once per new maximum ID (prevents refetch loops).
  useEffect(() => {
    if (open === null || unreadThrough <= 0) return;
    if ((requestedThrough.current[open] ?? 0) >= unreadThrough) return;
    requestedThrough.current[open] = unreadThrough;
    const applicationId = open;
    setReadError(null);
    markReadRef.current(applicationId, unreadThrough, () => {
      requestedThrough.current[applicationId] = 0;
      setReadError(applicationId);
    });
  }, [open, unreadThrough, props.refreshedAt]);

  const submit = (event: FormEvent, applicationId: number) => {
    event.preventDefault();
    const body = (drafts[applicationId] ?? '').trim();
    if (!body || props.sendingId !== null) return;
    setSendError(null); setSentId(null);
    props.send(applicationId, body, {
      onSuccess: () => { setDrafts(prev => ({ ...prev, [applicationId]: '' })); setSentId(applicationId); },
      onError: () => setSendError(applicationId),
    });
  };

  return <section className="mt-4 border-t border-border pt-4" aria-label={t('Private replies')} data-testid={`announcement-replies-${announcementId}`}>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <MessageSquareReply size={14} aria-hidden="true" />
      <b className="text-foreground">{t('Private replies')}</b>
      <span className="inline-flex items-center gap-1"><Lock size={12} aria-hidden="true" />{t(viewer === 'staff' ? 'Only this participant and the program team can see each conversation.' : 'Only you and your program team can see your replies.')}</span>
    </div>
    {isLoading ? <div className="mt-3 grid gap-2" aria-label={t('Loading replies')}><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
      : isError ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-destructive" role="alert"><AlertCircle size={15} />{t('Replies could not load.')}<Button variant="pill" onClick={retry} data-testid={`button-retry-replies-${announcementId}`}>{t('Retry')}</Button></div>
      : !conversations?.length ? <p className="mt-3 text-sm text-muted-foreground" data-testid={`replies-empty-${announcementId}`}>{t(viewer === 'staff' ? 'No participant has replied privately yet.' : 'Replies are not available for this announcement.')}</p>
      : <ul className="mt-3 grid list-none gap-2 p-0">{conversations.map(conversation => {
        const isOpen = open === conversation.applicationId;
        const last = conversation.messages[conversation.messages.length - 1];
        const draft = drafts[conversation.applicationId] ?? '';
        const sending = props.sendingId === conversation.applicationId;
        const title = viewer === 'staff' ? conversation.participantName : conversation.programName;
        const subtitle = viewer === 'staff'
          ? [conversation.businessName, conversation.programName].filter(Boolean).join(' · ')
          : conversation.businessName ?? '';
        const status = conversation.unreadCount > 0 ? `${conversation.unreadCount} ${t('unread')}`
          : !last ? t(viewer === 'participant' ? 'Start a private reply' : 'No messages')
          : last.sender === (viewer === 'staff' ? 'staff' : 'participant') ? t(last.readAt ? 'Seen' : 'Awaiting reply') : t('Replied');
        const panelId = `reply-panel-${announcementId}-${conversation.applicationId}`;
        return <li key={conversation.applicationId} className="rounded-md border border-border bg-card p-3" data-testid={`conversation-${announcementId}-${conversation.applicationId}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <b className="block text-sm">{title}</b>
              {subtitle && <small className="block text-xs text-muted-foreground">{subtitle}</small>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${conversation.unreadCount ? 'badge-warm' : 'badge-neutral'}`} data-testid={`status-conversation-${conversation.applicationId}`}>{status}</span>
              <Button variant="pill" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : conversation.applicationId)} data-testid={`button-toggle-conversation-${conversation.applicationId}`}>
                {t(isOpen ? 'Close conversation' : conversation.messages.length ? 'Open conversation' : 'Reply privately')}
              </Button>
            </div>
          </div>
          {isOpen && <div id={panelId} className="mt-3 grid gap-3">
            {conversation.messages.length ? <ol className="grid list-none gap-2 p-0" aria-label={t('Conversation messages')}>
              {[...conversation.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id).map(message => {
                const own = message.sender === viewer;
                return <li key={message.id} className={`rounded-md p-3 text-sm ${own ? 'bg-secondary' : 'bg-muted'}`} data-testid={`reply-message-${message.id}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <b className="text-foreground">{message.sender === 'staff' ? t('Program team') : viewer === 'staff' ? conversation.participantName : t('You')}</b>
                    <time dateTime={message.createdAt}>{fmt(message.createdAt)}</time>
                    {own && <span className="inline-flex items-center gap-1">{message.readAt ? <><CheckCheck size={12} />{t('Seen')}</> : <><Check size={12} />{t('Sent')}</>}</span>}
                  </div>
                  <p className="m-0 whitespace-pre-wrap break-words">{message.body}</p>
                </li>;
              })}
            </ol> : <p className="m-0 text-sm text-muted-foreground">{t('No messages yet. Write the first private reply.')}</p>}
            {readError === conversation.applicationId && <p className="m-0 text-xs text-destructive" role="alert">{t('We couldn’t update read status. It will retry on the next refresh.')}</p>}
            <form className="grid gap-2" onSubmit={event => submit(event, conversation.applicationId)}>
              <label className="field"><span>{t('Private reply')}</span>
                <textarea className="form-control" rows={3} maxLength={5000} value={draft} disabled={sending}
                  onChange={event => { const value = event.target.value; setDrafts(prev => ({ ...prev, [conversation.applicationId]: value })); if (sentId === conversation.applicationId) setSentId(null); }}
                  placeholder={t('Write a private reply…')} data-testid={`input-reply-${conversation.applicationId}`} />
                <small>{draft.length} / {t('5,000 characters')}</small>
              </label>
              {sendError === conversation.applicationId && <div className="form-error" role="alert"><AlertCircle size={15} />{t('Your reply could not be sent. Your draft is still here; try again.')}</div>}
              {sentId === conversation.applicationId && <div className="communication-success" role="status"><Check size={16} />{t('Reply sent.')}</div>}
              <div><Button type="submit" disabled={sending || !draft.trim()} data-testid={`button-send-reply-${conversation.applicationId}`}>{sending ? t('Sending…') : t('Send private reply')}</Button></div>
            </form>
          </div>}
        </li>;
      })}</ul>}
  </section>;
}
