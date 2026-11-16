import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getListParticipantAnnouncementRepliesQueryKey,
  getListStaffAnnouncementRepliesQueryKey,
  type AnnouncementConversation, type StaffAnnouncementConversation,
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

function render(
  viewer: 'participant' | 'staff',
  conversations: (AnnouncementConversation | StaffAnnouncementConversation)[],
  initialOpenApplicationId?: number,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = viewer === 'staff' ? getListStaffAnnouncementRepliesQueryKey(42) : getListParticipantAnnouncementRepliesQueryKey(42);
  client.setQueryData(key, conversations);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(LanguageProvider, { children: createElement(AnnouncementReplies, { announcementId: 42, viewer, initialOpenApplicationId }) })));
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
  assert.doesNotMatch(html, /Start a private reply/);
  assert.doesNotMatch(html, /status-conversation-101/);
});

test('a participant deep link opens the selected private conversation', () => {
  const html = render('participant', [{
    ...conversation,
    unreadCount: 1,
    messages: [{ id: 2, sender: 'staff', body: 'Your private answer is ready.', createdAt: '2026-10-22T11:00:00Z', readAt: null }],
  }], 101);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Your private answer is ready/);
  assert.doesNotMatch(html, /emailNotificationStatus|reply-email-status/);
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

test('staff can see failed reply-email status without exposing diagnostics or hiding the saved reply', () => {
  const staffConversation: StaffAnnouncementConversation = {
    ...conversation,
    messages: [{
      id: 2, sender: 'staff', body: 'The private reply remains visible only in the portal.',
      createdAt: '2026-10-22T11:00:00Z', readAt: null,
      emailNotificationStatus: 'failed', emailNotificationFailureKind: 'transient',
    }],
  };
  const html = render('staff', [staffConversation], 101);
  assert.match(html, /The private reply remains visible only in the portal/);
  assert.match(html, /email notification could not be sent/);
  assert.match(html, /data-testid="reply-email-status-2"/);
  assert.doesNotMatch(html, /transient/);
});
