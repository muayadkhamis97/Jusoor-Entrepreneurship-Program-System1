import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantSessionInteractiveActivitiesQueryKey,
  getGetParticipantSessionQuestionsQueryKey,
  getGetSessionInteractiveActivitiesQueryKey,
  getGetSessionQuestionsQueryKey,
  useAskTrainingQuestion,
  useCreateSessionInteractiveActivity,
  useGetParticipantSessionInteractiveActivities,
  useGetParticipantSessionQuestions,
  useGetSessionInteractiveActivities,
  useGetSessionQuestions,
  useReplyTrainingQuestion,
  useSubmitParticipantSessionInteractiveActivity,
  useUpdateSessionInteractiveActivity,
} from '@workspace/api-client-react';
import type {
  ParticipantSessionInteractiveActivity,
  SessionActivityQuestion,
  SessionInteractiveActivity,
  SessionInteractiveActivityInput,
  SessionInteractiveActivityUpdateInput,
  SessionInteractiveActivityResponseInput,
} from '@workspace/api-client-react';
import { Activity, AlertCircle, Check, ChevronDown, CircleHelp, MessageCircle, Plus, Send, ShieldCheck, X } from 'lucide-react';
import { t, useAppLanguage } from './language';
import './session-interactions.css';

type DraftQuestion = SessionActivityQuestion & { key: string };
type ActivityDraft = { type: 'poll' | 'survey'; title: string; description: string; questions: DraftQuestion[] };
const uid = () => `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const blankQuestion = (): DraftQuestion => ({ id: uid(), key: uid(), type: 'single_choice', prompt: '', options: [{ id: uid(), label: '' }, { id: uid(), label: '' }] });
const newDraft = (type: 'poll' | 'survey' = 'poll'): ActivityDraft => ({ type, title: '', description: '', questions: [blankQuestion()] });
const fromActivity = (activity: SessionInteractiveActivity): ActivityDraft => ({
  type: activity.type, title: activity.title, description: activity.description || '',
  questions: activity.questions.map(question => ({ ...question, key: question.id, options: question.options?.map(option => ({ ...option })) })),
});
const fmtDate = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function ActivityEditor({ activity, sessionId, onClose }: { activity?: SessionInteractiveActivity; sessionId: number; onClose: () => void }) {
  const create = useCreateSessionInteractiveActivity();
  const update = useUpdateSessionInteractiveActivity();
  const client = useQueryClient();
  const [draft, setDraft] = useState<ActivityDraft>(() => activity ? fromActivity(activity) : newDraft());
  const [error, setError] = useState('');
  const pending = create.isPending || update.isPending;
  const patch = (key: string, updates: Partial<DraftQuestion>) => setDraft(value => ({ ...value, questions: value.questions.map(q => q.key === key ? { ...q, ...updates } : q) }));
  const save = () => {
    const questions = draft.questions.map(({ key: _key, ...question }) => question);
    if (!draft.title.trim()) { setError(t('Add an activity title.')); return; }
    if (!questions.length || questions.length > 20 || questions.some(q => !q.prompt.trim())) { setError(t('Add a prompt for every question.')); return; }
    if (draft.type === 'poll' && (questions.length !== 1 || questions[0].type !== 'single_choice')) { setError(t('A poll has one single-choice question.')); return; }
    if (questions.some(q => q.type === 'single_choice' && (!q.options || q.options.length < 2 || q.options.some(o => !o.label.trim())))) { setError(t('Add at least two complete choices.')); return; }
    const data: SessionInteractiveActivityInput = { type: draft.type, title: draft.title.trim(), description: draft.description.trim() || null, questions: questions.map(q => ({ ...q, prompt: q.prompt.trim(), options: q.type === 'single_choice' ? q.options?.map(o => ({ ...o, label: o.label.trim() })) : undefined })) };
    const done = () => { void Promise.all([client.invalidateQueries({ queryKey: getGetSessionInteractiveActivitiesQueryKey(sessionId) }), client.invalidateQueries({ queryKey: getGetParticipantSessionInteractiveActivitiesQueryKey(sessionId) })]); onClose(); };
    if (activity) {
      const updateData: SessionInteractiveActivityUpdateInput = { title: data.title, description: data.description, questions: data.questions };
      update.mutate({ id: activity.id, data: updateData }, { onSuccess: done, onError: () => setError(t('Activity could not be saved. Try again.')) });
    } else create.mutate({ id: sessionId, data }, { onSuccess: done, onError: () => setError(t('Activity could not be created. Try again.')) });
  };
  return <div className="si-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="si-editor" role="dialog" aria-modal="true" aria-labelledby="si-editor-title" data-testid="dialog-session-activity">
      <header className="si-editor-head"><div><span className="si-kicker">{t('SESSION INTERACTION')}</span><h2 id="si-editor-title">{t(activity ? 'Edit activity' : 'Create activity')}</h2><p>{t('Invite the cohort to share a focused answer during this session.')}</p></div><button type="button" className="si-close" onClick={onClose} aria-label={t('Close editor')} data-testid="button-close-activity-editor"><X size={17} /></button></header>
      <div className="si-editor-body">
        <div className="si-field-row"><label className="si-field">{t('Activity type')}<select value={draft.type} disabled={!!activity} onChange={event => { const type = event.target.value as ActivityDraft['type']; setDraft(value => ({ ...value, type, questions: type === 'poll' ? [blankQuestion()] : value.questions })); }} data-testid="select-activity-type"><option value="poll">{t('Poll')}</option><option value="survey">{t('Survey')}</option></select></label><label className="si-field">{t('Activity title')}<input value={draft.title} maxLength={180} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} data-testid="input-activity-title" /></label></div>
        <label className="si-field">{t('Description')}<textarea rows={2} maxLength={2000} value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} data-testid="input-activity-description" /></label>
        <div className="si-editor-section"><div><b>{t('Questions')}</b><small>{t(draft.type === 'poll' ? 'A poll contains one single-choice question.' : 'Surveys can contain up to 20 questions.')}</small></div>{draft.type === 'survey' && <button type="button" className="si-text-button" disabled={draft.questions.length >= 20} onClick={() => setDraft(value => ({ ...value, questions: [...value.questions, blankQuestion()] }))} data-testid="button-add-interaction-question"><Plus size={14} />{t('Add question')}</button>}</div>
        {draft.questions.map((question, index) => <article className="si-question-edit" key={question.key} data-testid={`activity-question-editor-${index}`}>
          <div className="si-question-edit-top"><span>{t('Question')} {index + 1}</span>{draft.type === 'survey' && <button type="button" className="si-remove" disabled={draft.questions.length <= 1} onClick={() => setDraft(value => ({ ...value, questions: value.questions.filter(item => item.key !== question.key) }))}>{t('Remove')}</button>}</div>
          <label className="si-field">{t('Question prompt')}<textarea rows={2} maxLength={1500} value={question.prompt} onChange={event => patch(question.key, { prompt: event.target.value })} data-testid={`input-interaction-prompt-${index}`} /></label>
          {draft.type === 'survey' && <label className="si-field">{t('Answer format')}<select value={question.type} onChange={event => patch(question.key, { type: event.target.value as SessionActivityQuestion['type'], options: event.target.value === 'single_choice' ? question.options?.length ? question.options : [{ id: uid(), label: '' }, { id: uid(), label: '' }] : undefined })} data-testid={`select-interaction-type-${index}`}><option value="single_choice">{t('Single choice')}</option><option value="rating">{t('Rating (1–5)')}</option><option value="short_text">{t('Short text')}</option></select></label>}
          {question.type === 'single_choice' && <div className="si-options"><span>{t('Answer choices')}</span>{(question.options || []).map((option, optionIndex) => <div className="si-option" key={option.id}><input aria-label={`${t('Choice')} ${optionIndex + 1}`} value={option.label} maxLength={300} onChange={event => patch(question.key, { options: question.options?.map(item => item.id === option.id ? { ...item, label: event.target.value } : item) })} data-testid={`input-interaction-choice-${index}-${optionIndex}`} /><button type="button" aria-label={t('Remove choice')} data-testid={`button-remove-choice-${index}-${optionIndex}`} disabled={(question.options?.length || 0) <= 2} onClick={() => patch(question.key, { options: question.options?.filter(item => item.id !== option.id) })}>×</button></div>)}<button type="button" className="si-text-button" data-testid={`button-add-choice-${index}`} disabled={(question.options?.length || 0) >= 10} onClick={() => patch(question.key, { options: [...(question.options || []), { id: uid(), label: '' }] })}><Plus size={13} />{t('Add choice')}</button></div>}
        </article>)}
        {error && <p className="si-error" role="alert"><AlertCircle size={15} />{error}</p>}
      </div>
      <footer className="si-editor-foot"><button className="button button-quiet" onClick={onClose} type="button">{t('Cancel')}</button><button className="button button-primary" onClick={save} type="button" disabled={pending} data-testid="button-save-session-activity">{pending ? t('Saving…') : <><Check size={14} />{t('Save activity')}</>}</button></footer>
    </section>
  </div>;
}

function StaffActivityCard({ activity, sessionId, canEdit, canControl }: { activity: SessionInteractiveActivity; sessionId: number; canEdit: boolean; canControl: boolean }) {
  const client = useQueryClient();
  const update = useUpdateSessionInteractiveActivity();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const toggleStatus = () => update.mutate({ id: activity.id, data: { status: activity.status === 'open' ? 'closed' : 'open' } }, { onSuccess: () => void Promise.all([client.invalidateQueries({ queryKey: getGetSessionInteractiveActivitiesQueryKey(sessionId) }), client.invalidateQueries({ queryKey: getGetParticipantSessionInteractiveActivitiesQueryKey(sessionId) })]) });
  return <article className="si-activity-card" data-testid={`staff-interaction-${activity.id}`}>
    <div className="si-activity-main"><span className={`si-status si-status-${activity.status}`}><i />{t(activity.status)}</span><h4>{activity.title}</h4>{activity.description && <p>{activity.description}</p>}<span className="si-meta">{t(activity.type)} · {activity.questions.length} {t(activity.questions.length === 1 ? 'question' : 'questions')} · {activity.responseCount} {t('responses')}</span></div>
    <div className="si-actions">{canEdit && activity.status === 'draft' && <button type="button" className="si-small-action" onClick={() => setEditing(true)} data-testid={`button-edit-interaction-${activity.id}`}>{t('Edit')}</button>}
      {canControl && activity.status !== 'draft' && <button type="button" className="si-small-action si-status-action" disabled={update.isPending} onClick={toggleStatus} data-testid={`button-toggle-interaction-${activity.id}`}>{t(activity.status === 'open' ? 'Close' : 'Reopen')}</button>}
      {activity.status === 'draft' && canControl && <button type="button" className="si-small-action si-status-action" disabled={update.isPending} onClick={toggleStatus} data-testid={`button-open-interaction-${activity.id}`}>{t('Open')}</button>}
      <button type="button" className="si-small-action" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} data-testid={`button-review-interaction-${activity.id}`}>{t(expanded ? 'Hide responses' : 'View responses')} <ChevronDown size={13} /></button></div>
    {expanded && <div className="si-response-panel">{!activity.responses.length ? <p>{t('No responses yet.')}</p> : activity.responses.map((response,index) => <article className="si-response" key={`${activity.id}-${index}`}><b>{response.businessName}</b><time>{fmtDate(response.submittedAt)}</time><div>{activity.questions.map(question => { const answer = response.answers.find(item => item.questionId === question.id); const label = question.options?.find(option => option.id === String(answer?.value))?.label; return <p key={question.id}><span>{question.prompt}</span><b>{label || answer?.value || '—'}</b></p>; })}</div></article>)}</div>}
    {editing && <ActivityEditor activity={activity} sessionId={sessionId} onClose={() => setEditing(false)} />}
  </article>;
}

function SessionQuestionList({ sessionId, trainer, coordinator }: { sessionId: number; trainer: boolean; coordinator: boolean }) {
  const client = useQueryClient();
  const query = useGetSessionQuestions(sessionId, { query: { queryKey: getGetSessionQuestionsQueryKey(sessionId), refetchInterval: 3000, enabled: trainer || coordinator } });
  const replyMutation = useReplyTrainingQuestion();
  const [replies, setReplies] = useState<Record<number, string>>({});
  if (!trainer && !coordinator) return null;
  if (query.isLoading) return <div className="si-inline-loading">{t('Loading live questions')}</div>;
  if (query.isError) return <div className="si-inline-error"><AlertCircle size={14} />{t('Questions could not load.')} <button type="button" onClick={() => void query.refetch()}>{t('Retry')}</button></div>;
  const questions = query.data?.questions || [];
  return <div className="si-questions-list" data-testid={`session-questions-${sessionId}`}>
    {!questions.length ? <p className="si-empty">{t('No questions from the cohort yet.')}</p> : questions.map(question => <article className="si-question-thread" key={question.id} data-testid={`session-question-${question.id}`}><div className="si-q-avatar">{question.businessName.slice(0,1).toUpperCase()}</div><div className="si-q-content"><div className="si-q-heading"><b>{question.businessName}</b><time>{fmtDate(question.createdAt)}</time></div><p>{question.question}</p>{question.reply ? <div className="si-reply"><b>{t('Trainer reply')}</b><span>{question.reply}</span></div> : trainer ? <form className="si-reply-form" onSubmit={event => { event.preventDefault(); const reply = (replies[question.id] || '').trim(); if (!reply) return; replyMutation.mutate({ id: question.id, data: { reply } }, { onSuccess: () => { setReplies(value => ({ ...value, [question.id]: '' })); void Promise.all([client.invalidateQueries({ queryKey: getGetSessionQuestionsQueryKey(sessionId) }), client.invalidateQueries({ queryKey: getGetParticipantSessionQuestionsQueryKey(sessionId) })]); } }); }}><input value={replies[question.id] || ''} maxLength={3000} onChange={event => setReplies(value => ({ ...value, [question.id]: event.target.value }))} placeholder={t('Write a useful reply…')} aria-label={t('Trainer reply')} data-testid={`input-session-reply-${question.id}`} /><button type="submit" disabled={replyMutation.isPending || !(replies[question.id] || '').trim()} aria-label={t('Send reply')} data-testid={`button-send-session-reply-${question.id}`}><Send size={14} /></button></form> : <span className="si-awaiting">{t('Awaiting trainer reply')}</span>}</div></article>)}
  </div>;
}

export function StaffSessionInteractions({ sessionId, coordinator, staffId, trainerStaffId }: { sessionId: number; coordinator: boolean; staffId?: number; trainerStaffId?: number | null }) {
  useAppLanguage();
  const trainer = staffId !== undefined && trainerStaffId === staffId;
  const visible = coordinator || trainer;
  const [editing, setEditing] = useState(false);
  const activitiesQuery = useGetSessionInteractiveActivities(sessionId, { query: { queryKey: getGetSessionInteractiveActivitiesQueryKey(sessionId), enabled: visible } });
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  if (!visible) return null;
  const activities = activitiesQuery.data?.activities || [];
  return <section className="session-interactions" data-testid={`session-interactions-${sessionId}`}>
    <header className="si-section-head"><div className="si-mark"><Activity size={16} /></div><div className="si-heading"><span className="si-kicker">{t('LIVE SESSION')}</span><h3>{t('Cohort interactions')}</h3><p>{t('Polls, surveys and questions for this session.')}</p></div>{coordinator && <button className="si-create" type="button" onClick={() => setEditing(true)} data-testid={`button-create-interaction-${sessionId}`}><Plus size={14} />{t('Create activity')}</button>}</header>
    {activitiesQuery.isLoading ? <div className="si-loading"><i /><i /></div> : activitiesQuery.isError ? <div className="si-inline-error"><AlertCircle size={14} />{t('Activities could not load.')} <button type="button" onClick={() => void activitiesQuery.refetch()}>{t('Retry')}</button></div> : activities.length ? <div className="si-activity-list">{activities.map(activity => <StaffActivityCard key={activity.id} activity={activity} sessionId={sessionId} canEdit={coordinator} canControl={coordinator || trainer} />)}</div> : <div className="si-empty-activities"><ShieldCheck size={16} /><span>{t('No live activities yet.')}{coordinator ? ` ${t('Create a poll or survey for the cohort.')}` : ''}</span></div>}
    {(trainer || coordinator) && <div className="si-qna"><button type="button" className="si-qna-toggle" aria-expanded={questionsExpanded} onClick={() => setQuestionsExpanded(value => !value)} data-testid={`button-toggle-session-questions-${sessionId}`}><span className="si-qna-icon"><MessageCircle size={15} /></span><span><b>{t('Live Q&A')}</b><small>{t('Cohort questions and trainer replies')}</small></span><ChevronDown size={15} /></button>{questionsExpanded && <SessionQuestionList sessionId={sessionId} trainer={trainer} coordinator={coordinator} />}</div>}
    {editing && <ActivityEditor sessionId={sessionId} onClose={() => setEditing(false)} />}
  </section>;
}

export function ParticipantSessionInteractions({ sessionId, programId, businessName }: { sessionId: number; programId: number; businessName?: string }) {
  useAppLanguage();
  const client = useQueryClient();
  const activitiesQuery = useGetParticipantSessionInteractiveActivities(sessionId, { query: { queryKey: getGetParticipantSessionInteractiveActivitiesQueryKey(sessionId), refetchInterval: 15000 } });
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const questionsQuery = useGetParticipantSessionQuestions(sessionId, { query: { queryKey: getGetParticipantSessionQuestionsQueryKey(sessionId), enabled: questionsExpanded, refetchInterval: questionsExpanded ? 3000 : false } });
  const submit = useSubmitParticipantSessionInteractiveActivity();
  const ask = useAskTrainingQuestion();
  const [answers, setAnswers] = useState<Record<number, Record<string, string | number>>>({});
  const [question, setQuestion] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const activities = activitiesQuery.data?.activities || [];
  const submitActivity = (activity: ParticipantSessionInteractiveActivity) => {
    const values = answers[activity.id] || {};
    if (activity.questions.some(item => values[item.id] === undefined || values[item.id] === '')) { setError(t('Answer each question before submitting.')); return; }
    const data: SessionInteractiveActivityResponseInput = { answers: activity.questions.map(item => ({ questionId: item.id, value: values[item.id] })) };
    setError('');
    submit.mutate({ id: activity.id, data }, { onSuccess: () => { setNotice(t('Your response has been recorded.')); void Promise.all([client.invalidateQueries({ queryKey: getGetParticipantSessionInteractiveActivitiesQueryKey(sessionId) }), client.invalidateQueries({ queryKey: getGetSessionInteractiveActivitiesQueryKey(sessionId) })]); }, onError: () => setError(t('Your response could not be submitted. Try again.')) });
  };
  const askQuestion = (event: FormEvent) => { event.preventDefault(); const text = question.trim(); if (text.length < 5) { setError(t('Write at least five characters for your question.')); return; } setError(''); ask.mutate({ data: { programId, sessionId, question: text } }, { onSuccess: () => { setQuestion(''); setNotice(t('Your question has been shared with the cohort.')); void Promise.all([client.invalidateQueries({ queryKey: getGetParticipantSessionQuestionsQueryKey(sessionId) }), client.invalidateQueries({ queryKey: getGetSessionQuestionsQueryKey(sessionId) })]); }, onError: () => setError(t('Your question could not be sent. Try again.')) }); };
  return <section className="participant-interactions" data-testid={`participant-session-interactions-${sessionId}`}>
    <header className="participant-si-head"><span className="si-mark"><CircleHelp size={15} /></span><div><b>{t('Take part in this session')}</b><small>{t('Share a response or ask the cohort a question.')}</small></div></header>
    {activitiesQuery.isLoading ? <div className="si-loading"><i /><i /></div> : activitiesQuery.isError ? <div className="si-inline-error"><AlertCircle size={14} />{t('Activities could not load.')} <button type="button" onClick={() => void activitiesQuery.refetch()}>{t('Retry')}</button></div> : activities.length > 0 && <div className="participant-si-activities">{activities.map(activity => {
      const values = answers[activity.id] || {};
      const resultsVisible = activity.type === 'poll' && Boolean(activity.results) && (activity.hasResponded || activity.status === 'closed');
      return <article className="participant-si-activity" key={activity.id} data-testid={`participant-interaction-${activity.id}`}><div className="participant-si-title"><span className={`si-status si-status-${activity.status}`}><i />{t(activity.status)}</span><span className="si-status-kind">{t(activity.type)}</span></div><h4>{activity.title}</h4>{activity.description && <p>{activity.description}</p>}
        {activity.hasResponded ? <div className="si-submitted"><Check size={14} />{t('Your response is in. Thank you.')}</div> : activity.status === 'open' ? <div className="si-participant-questions">{activity.questions.map((item,index) => <fieldset key={item.id} className="si-participant-question"><legend><span>{t('Question')} {index+1}</span>{item.prompt}</legend>{item.type === 'single_choice' ? <div className="si-participant-options">{(item.options || []).map(option => <label key={option.id} className={`si-pick ${values[item.id] === option.id ? 'selected' : ''}`}><input type="radio" name={`activity-${activity.id}-${item.id}`} checked={values[item.id] === option.id} onChange={() => setAnswers(current => ({ ...current, [activity.id]: { ...current[activity.id], [item.id]: option.id } }))} />{option.label}</label>)}</div> : item.type === 'rating' ? <div className="si-rating" role="radiogroup" aria-label={item.prompt}>{[1,2,3,4,5].map(rating => <button type="button" key={rating} className={values[item.id] === rating ? 'selected' : ''} aria-pressed={values[item.id] === rating} onClick={() => setAnswers(current => ({ ...current, [activity.id]: { ...current[activity.id], [item.id]: rating } }))} data-testid={`button-rate-${activity.id}-${item.id}-${rating}`}>{rating}</button>)}</div> : <textarea rows={2} maxLength={1500} value={String(values[item.id] || '')} onChange={event => setAnswers(current => ({ ...current, [activity.id]: { ...current[activity.id], [item.id]: event.target.value } }))} placeholder={t('Write your answer…')} data-testid={`input-short-answer-${activity.id}-${item.id}`} />}</fieldset>)}<button type="button" className="button button-primary si-submit" onClick={() => submitActivity(activity)} disabled={submit.isPending} data-testid={`button-submit-interaction-${activity.id}`}>{submit.isPending ? t('Submitting…') : <>{t('Submit response')} <Check size={14} /></>}</button></div> : <div className="si-closed-note">{t('This activity is closed.')}</div>}
        {resultsVisible && <div className="si-results"><b>{t('Poll results')} · {activity.responseCount} {t('responses')}</b>{activity.results?.map(result => <div className="si-result-row" key={result.choiceId}><span>{result.label}</span><strong>{result.count}</strong></div>)}</div>}
      </article>;
    })}</div>}
    {notice && <p className="si-notice" role="status"><Check size={14} />{notice}</p>}{error && <p className="si-error" role="alert"><AlertCircle size={14} />{error}</p>}
    <div className="participant-si-qna">
      <button type="button" className="participant-si-qna-toggle" aria-expanded={questionsExpanded} onClick={() => setQuestionsExpanded(value => !value)} data-testid={`button-toggle-participant-qna-${sessionId}`}>
        <span className="participant-si-qna-title"><MessageCircle size={15} /><span><b>{t('Ask the cohort')}</b><small>{t('Your question and trainer replies are visible to this cohort.')}</small></span></span>
        <ChevronDown size={15} />
      </button>
      {questionsExpanded && <>
        <form className="si-ask-form" onSubmit={askQuestion}><textarea rows={2} maxLength={3000} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('What would you like to ask about this session?')} data-testid={`input-ask-session-question-${sessionId}`} /><button type="submit" className="button button-primary" disabled={ask.isPending || question.trim().length < 5} data-testid={`button-ask-session-question-${sessionId}`}>{ask.isPending ? t('Sending…') : <>{t('Ask question')} <Send size={13} /></>}</button></form>
        {questionsQuery.isLoading ? <div className="si-inline-loading">{t('Loading cohort thread')}</div> : questionsQuery.isError ? <div className="si-inline-error">{t('Questions could not load.')} <button type="button" onClick={() => void questionsQuery.refetch()}>{t('Retry')}</button></div> : <div className="si-questions-list">{(questionsQuery.data?.questions || []).length === 0 ? <p className="si-empty">{t('Start the conversation with a question.')}</p> : questionsQuery.data?.questions.map(item => <article className="si-question-thread" key={item.id}><div className="si-q-avatar">{item.businessName.slice(0,1).toUpperCase()}</div><div className="si-q-content"><div className="si-q-heading"><b>{item.businessName === businessName ? t('Your business') : item.businessName}</b><time>{fmtDate(item.createdAt)}</time></div><p>{item.question}</p>{item.reply ? <div className="si-reply"><b>{t('Trainer reply')}</b><span>{item.reply}</span></div> : <span className="si-awaiting">{t('Awaiting trainer reply')}</span>}</div></article>)}</div>}
      </>}
    </div>
  </section>;
}
