import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getListChatThreadsQueryKey, getListChatTargetsQueryKey, getListChatMessagesQueryKey } from '@workspace/api-client-react';
import { ChatWorkspace } from '../chat-surfaces';
import { LanguageProvider, LanguageToggle } from '../language';
import '../index.css';
import '../workspace.css';
import '../role-workspace.css';
import '../program-controls.css';

// Development-only visual/interaction harness. Synthetic cache entries grant no
// authentication or API permissions. Browser tests intercept writes, never send
// to real participants.
const actor = new URLSearchParams(location.search).get('actor') === 'participant' ? 'participant' : 'staff';
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const date = '2026-10-22T10:00:00Z';
const threads = [
  { id: 1, programId: 11, programName: 'Sample program', kind: 'private', title: 'Sample participant', lastMessage: 'Can we discuss the next milestone?', lastMessageAt: date, unreadCount: 1 },
  { id: 2, programId: 11, programName: 'Sample program', kind: 'business', title: 'Sample business team', lastMessage: 'We have prepared our next steps.', lastMessageAt: date, unreadCount: 0 },
];
client.setQueryData(getListChatThreadsQueryKey(actor), threads);
client.setQueryData(getListChatTargetsQueryKey(actor), [
  { programId: 11, programName: 'Sample program', kind: 'private', targetId: 101, name: 'Sample participant' },
  { programId: 11, programName: 'Sample program', kind: 'business', targetId: 201, name: 'Sample business team' },
]);
for (const thread of threads) client.setQueryData(getListChatMessagesQueryKey(actor, thread.id), {
  messages: [{ id: thread.id, threadId: thread.id, body: thread.lastMessage, senderName: 'Sample participant', senderRole: 'participant', isOwn: actor === 'participant', createdAt: date }],
  nextBeforeId: null,
});
createRoot(document.getElementById('root')!).render(
  <LanguageProvider><QueryClientProvider client={client}>
    <div className="role-workspace"><div className="role-main"><LanguageToggle /><ChatWorkspace actor={actor} /></div></div>
  </QueryClientProvider></LanguageProvider>,
);
