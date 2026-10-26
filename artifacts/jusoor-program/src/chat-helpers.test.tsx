import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '@workspace/api-client-react';
import { chatPrivacyNote, completeDraft, draftFor, draftForSend, highestMessageId, mergeMessages, olderCursor, shouldMarkRead, updateDraft } from './chat-helpers';
import { hasArabicTranslation, loadArabicTranslations } from './language';

await loadArabicTranslations();

const ids = () => { let n = 0; return () => `id-${++n}`; };
const message = (id: number): ChatMessage => ({ id, threadId: 1, body: `m${id}`, senderName: 'A', senderRole: 'staff', isOwn: false, createdAt: '2024-01-01T00:00:00Z' });

test('drafts are kept per conversation', () => {
  const make = ids();
  let drafts = updateDraft({}, 1, 'hello', make);
  drafts = updateDraft(drafts, 2, 'other', make);
  assert.equal(draftFor(drafts, 1).body, 'hello');
  assert.equal(draftFor(drafts, 2).body, 'other');
  assert.equal(draftFor(drafts, 3).body, '');
});

test('retrying an unchanged draft reuses its client message id', () => {
  const make = ids();
  let drafts = updateDraft({}, 1, 'hello', make);
  const first = draftFor(drafts, 1).clientMessageId;
  drafts = draftForSend(drafts, 1, make);
  drafts = updateDraft(drafts, 1, 'hello', make);
  assert.equal(draftFor(drafts, 1).clientMessageId, first);
  drafts = updateDraft(drafts, 1, 'hello!', make);
  assert.notEqual(draftFor(drafts, 1).clientMessageId, first);
});

test('successful send clears only the matching draft and rotates its id', () => {
  const make = ids();
  let drafts = updateDraft({}, 1, 'hello', make);
  const sent = draftFor(drafts, 1).clientMessageId;
  const edited = updateDraft(drafts, 1, 'hello more', make);
  assert.equal(completeDraft(edited, 1, sent, make), edited);
  drafts = completeDraft(drafts, 1, sent, make);
  assert.equal(draftFor(drafts, 1).body, '');
  assert.notEqual(draftFor(drafts, 1).clientMessageId, sent);
});

test('cursor merging keeps chronological order and de-duplicates', () => {
  const merged = mergeMessages([message(5), message(6)], [message(2), message(3), message(5)]);
  assert.deepEqual(merged.map(item => item.id), [2, 3, 5, 6]);
  assert.equal(highestMessageId(merged), 6);
  assert.equal(olderCursor(4, undefined), 4);
  assert.equal(olderCursor(9, null), null);
  assert.equal(olderCursor(9, 2), 2);
});

test('read markers only advance when visible', () => {
  assert.equal(shouldMarkRead(6, 5, true), true);
  assert.equal(shouldMarkRead(6, 6, true), false);
  assert.equal(shouldMarkRead(6, undefined, false), false);
  assert.equal(shouldMarkRead(null, undefined, true), false);
});

test('privacy notes never name a single staff member and are translated', () => {
  for (const note of [chatPrivacyNote('participant', 'private'), chatPrivacyNote('staff', 'private'), chatPrivacyNote('participant', 'business')]) {
    assert.match(note, /program staff and admins/);
    assert.ok(hasArabicTranslation(note), note);
  }
});
