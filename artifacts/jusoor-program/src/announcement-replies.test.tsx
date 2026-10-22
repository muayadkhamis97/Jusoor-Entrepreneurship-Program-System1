import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getListParticipantAnnouncementRepliesQueryKey,
  getListStaffAnnouncementRepliesQueryKey,
  type AnnouncementConversation,
} from '@workspace/api-client-react';
import { AnnouncementReplies } from './announcement-replies';
import { LanguageProvider } from './language';

// The app uses Vite's automatic JSX transform; tsx uses classic JSX for this
// package's preserve setting, including imported design-system primitives.
const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
after(() => {
  if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
  else Reflect.deleteProperty(globalThis, 'React');
});

function render(viewer: 'participant' | 'staff', conversations: AnnouncementConversation[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = viewer === 'staff' ? getListStaffAnnouncementRepliesQueryKey(42) : getListParticipantAnnouncementRepliesQueryKey(42);
  client.setQueryData(key, conversations);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(LanguageProvider, { children: createElement(AnnouncementReplies, { announcementId: 42, viewer }) })));
  client.clear();
  return html;
}
const conversation: AnnouncementConversation = {
  applicationId: 101, participantName: 'Founder One', programName: 'Cohort One',
  businessName: 'Shared business', unreadCount: 1,
  messages: [{ id: 1, sender: 'participant', body: 'Private text stays closed', createdAt: '2026-10-22T10:00:00Z', readAt: null }],
};

test('staff see unread replies and participant identity without opening private message text', () => {
  const html = render('staff', [conversation]);
  assert.match(html, /1 unread/);
  assert.match(html, /Founder One/);
  assert.match(html, /Shared business/);
  assert.match(html, /Only this participant and the program team/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Private text stays closed/);
  assert.doesNotMatch(html, /<textarea/);
});

test('participants can start a private reply in the right program context', () => {
  const html = render('participant', [{ ...conversation, unreadCount: 0, messages: [] }]);
  assert.match(html, /Cohort One/);
  assert.match(html, /Only you and your program team/);
  assert.match(html, /Reply privately/);
  assert.match(html, /Start a private reply/);
});

test('reply states distinguish waiting, seen and staff response', () => {
  const waiting = { ...conversation, unreadCount: 0 };
  assert.match(render('participant', [waiting]), /Awaiting reply/);
  assert.match(render('participant', [{ ...waiting, messages: [{ ...waiting.messages[0], readAt: '2026-10-22T11:00:00Z' }] }]), /Seen/);
  assert.match(render('participant', [{ ...waiting, messages: [{ ...waiting.messages[0], sender: 'staff' }] }]), /Replied/);
});

test('staff have a clear empty inbox rather than a blank section', () => {
  assert.match(render('staff', []), /No participant has replied privately yet/);
});
