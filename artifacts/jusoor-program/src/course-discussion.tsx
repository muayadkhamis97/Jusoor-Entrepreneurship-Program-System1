import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCourseDiscussionsQueryKey,
  getGetParticipantCourseDiscussionsQueryKey,
  useCreateCourseDiscussionPost,
  useCreateParticipantCourseDiscussionPost,
  useGetCourseDiscussions,
  useGetParticipantCourseDiscussions,
} from '@workspace/api-client-react';
import type { CourseDiscussionPost } from '@workspace/api-client-react';
import { MessageSquareText, Reply, Send, CircleAlert, ChevronDown } from 'lucide-react';
import { currentLanguage, t, useAppLanguage } from './language';
import './course-discussion.css';

function PostForm({ replyTo, pending, onSubmit, onCancel, resetKey }: {
  replyTo?: CourseDiscussionPost;
  pending: boolean;
  onSubmit: (body: string, title?: string) => void;
  onCancel?: () => void;
  resetKey: number;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { setTitle(''); setBody(''); }, [resetKey]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim() || (!replyTo && !title.trim())) return;
    onSubmit(body.trim(), replyTo ? undefined : title.trim());
  };
  return <form className={`discussion-compose ${replyTo ? 'discussion-compose-reply' : ''}`} onSubmit={submit}>
    {!replyTo && <label className="discussion-field"><span>{t('Discussion topic title')}</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} required placeholder={t('For example, testing a pricing assumption')} data-testid="input-discussion-title" /></label>}
    <label className="discussion-field"><span>{replyTo ? t('Your reply') : t('What would help you move forward?')}</span><textarea value={body} onChange={event => setBody(event.target.value)} maxLength={3000} rows={replyTo ? 2 : 3} required placeholder={replyTo ? t('Share a practical answer…') : t('Add context so peers and trainers can give a useful answer…')} data-testid={replyTo ? `input-discussion-reply-${replyTo.id}` : 'input-discussion-body'} /></label>
    <div className="discussion-compose-actions">{onCancel && <button type="button" className="discussion-cancel" onClick={onCancel}>{t('Cancel')}</button>}<button className="button button-primary discussion-send" type="submit" disabled={pending || !body.trim() || (!replyTo && !title.trim())} data-testid={replyTo ? `button-send-discussion-reply-${replyTo.id}` : 'button-start-discussion'}>{pending ? t('Posting…') : <><Send size={14} />{replyTo ? t('Post reply') : t('Start topic')}</>}</button></div>
  </form>;
}

function authorLabel(post: CourseDiscussionPost): string {
  if (post.authorRole === 'participant') {
    return post.authorName === 'Program participant' ? t('Founder') : post.authorName;
  }
  return t(post.authorRole === 'trainer' ? 'Trainer' : 'Coordinator');
}

function DiscussionPost({ post, replies, replyingTo, pending, onReply, onCancel, onSubmit, resetKey }: {
  post: CourseDiscussionPost; replies: CourseDiscussionPost[]; replyingTo: number | null; pending: boolean;
  onReply: (id: number) => void; onCancel: () => void; onSubmit: (body: string, title?: string, parentId?: number) => void;
  resetKey: number;
}) {
  const date = new Date(post.createdAt);
  const locale = currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB';
  const role = post.authorRole === 'participant' ? 'Founder' : post.authorRole === 'trainer' ? 'Trainer' : 'Coordinator';
  return <article className="discussion-topic" data-testid={`discussion-topic-${post.id}`}>
     <div className="discussion-avatar" aria-hidden="true">{authorLabel(post).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div>
    <div className="discussion-topic-main">
       <div className="discussion-topic-heading"><div><h3>{post.title}</h3><div className="discussion-byline"><b>{authorLabel(post)}</b><span className={`discussion-role discussion-role-${post.authorRole}`}>{t(role)}</span><time dateTime={post.createdAt}>{date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · {date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</time></div></div><span className="discussion-reply-count">{replies.length} {t(replies.length === 1 ? 'reply' : 'replies')}</span></div>
      <p className="discussion-body">{post.body}</p>
      {replies.length > 0 && <div className="discussion-replies">{replies.map(reply => {
        const replyDate = new Date(reply.createdAt);
         const replyRole = reply.authorRole === 'participant' ? 'Founder' : reply.authorRole === 'trainer' ? 'Trainer' : 'Coordinator';
         return <article className="discussion-reply" key={reply.id} data-testid={`discussion-reply-${reply.id}`}><div className="discussion-avatar discussion-avatar-small" aria-hidden="true">{authorLabel(reply).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div><div><div className="discussion-byline"><b>{authorLabel(reply)}</b><span className={`discussion-role discussion-role-${reply.authorRole}`}>{t(replyRole)}</span><time dateTime={reply.createdAt}>{replyDate.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · {replyDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</time></div><p className="discussion-body">{reply.body}</p></div></article>;
      })}</div>}
      {replyingTo === post.id ? <PostForm resetKey={resetKey} replyTo={post} pending={pending} onCancel={onCancel} onSubmit={body => onSubmit(body, undefined, post.id)} /> : <button className="discussion-reply-trigger" type="button" onClick={() => onReply(post.id)} data-testid={`button-reply-to-topic-${post.id}`}><Reply size={14} />{t('Reply')}</button>}
    </div>
  </article>;
}

export function CourseDiscussion({ moduleId, participant = false }: { moduleId: number; participant?: boolean }) {
  useAppLanguage();
  const client = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const staffKey = getGetCourseDiscussionsQueryKey(moduleId);
  const participantKey = getGetParticipantCourseDiscussionsQueryKey(moduleId);
  const staffQuery = useGetCourseDiscussions(moduleId, { query: { enabled: isOpen && !participant, queryKey: staffKey, refetchInterval: 15000 } });
  const participantQuery = useGetParticipantCourseDiscussions(moduleId, { query: { enabled: isOpen && participant, queryKey: participantKey, refetchInterval: 15000 } });
  const query = participant ? participantQuery : staffQuery;
  const createStaff = useCreateCourseDiscussionPost();
  const createParticipant = useCreateParticipantCourseDiscussionPost();
  const mutation = participant ? createParticipant : createStaff;
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const posts = query.data?.posts || [];
  const topics = posts.filter(post => post.parentId === null);
  const send = (body: string, title?: string, parentId?: number) => {
    const data = parentId ? { parentId, body } : { title: title || '', body };
    mutation.mutate({ id: moduleId, data }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: participant ? participantKey : staffKey });
        setReplyingTo(null);
        setResetVersion(version => version + 1);
      },
    });
  };
  const contentId = `course-discussion-content-${moduleId}-${participant ? 'participant' : 'staff'}`;
  return <section className="course-discussion" aria-labelledby={`discussion-title-${moduleId}`} data-testid={`course-discussion-${moduleId}`}>
    <header className="discussion-header"><div className="discussion-heading-mark"><MessageSquareText size={17} /></div><div className="discussion-heading-copy"><div className="eyebrow">{t('MODULE DISCUSSION')}</div><h2 id={`discussion-title-${moduleId}`}>{query.data?.moduleTitle || t('Discussion')}</h2><p>{t('Practical questions and answers from your cohort and teaching team.')}</p></div><button className="discussion-toggle" type="button" aria-expanded={isOpen} aria-controls={isOpen ? contentId : undefined} onClick={() => setIsOpen(open => !open)} data-testid={`button-toggle-course-discussion-${moduleId}`}>{t(isOpen ? 'Close discussion' : 'Open discussion')}<ChevronDown size={15} aria-hidden="true" /></button></header>
    {isOpen && <div id={contentId} className="discussion-panel"><span className="discussion-live"><i />{t('Updates every 15 seconds')}</span>
    {query.isLoading ? <div className="discussion-loading" aria-label={t('Loading discussion')}><div /><div /><div /></div>
      : query.isError ? <div className="discussion-state discussion-error" role="alert"><CircleAlert size={18} /><div><b>{t('Discussion could not load.')}</b><span>{t('Your course work is unchanged. Try again to reconnect.')}</span></div><button type="button" onClick={() => void query.refetch()}>{t('Retry')}</button></div>
      : <><PostForm resetKey={resetVersion} pending={mutation.isPending} onSubmit={(body, title) => send(body, title)} />
        {mutation.isError && <p className="discussion-post-error" role="alert"><CircleAlert size={14} />{t('Your post was not sent. Check your connection and try again.')}</p>}
        <div className="discussion-list" aria-live="polite">{topics.length === 0 ? <div className="discussion-empty"><span className="discussion-empty-icon"><MessageSquareText size={19} /></span><b>{t('A good question gets the conversation started.')}</b><p>{t('Ask about applying this module to your venture. Peers and trainers can add practical answers here.')}</p></div> : topics.map(topic => <DiscussionPost key={topic.id} post={topic} replies={posts.filter(post => post.parentId === topic.id)} replyingTo={replyingTo} pending={mutation.isPending} resetKey={resetVersion} onReply={setReplyingTo} onCancel={() => setReplyingTo(null)} onSubmit={send} />)}</div>
      </>}</div>}
  </section>;
}
