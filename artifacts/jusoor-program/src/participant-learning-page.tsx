import { lazy, Suspense, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantCoursesQueryKey,
  getGetParticipantDashboardQueryKey,
  useAskTrainingQuestion,
  useGetParticipantCourses,
  useSubmitTrainingAnswer,
} from '@workspace/api-client-react';
import type {
  ParticipantAssignment,
  ParticipantEnrollment,
  ParticipantQuestion,
  TrainingAnswerInput,
  TrainingQuestionInput,
} from '@workspace/api-client-react';
import { BookOpen, CircleAlert, Download, ExternalLink as ExternalLinkIcon, FileText, Handshake, Play } from 'lucide-react';
import { ParticipantModuleQuizzes } from './course-quizzes';
import { CourseDiscussion } from './course-discussion';
import { ParticipantLearningProgress } from './learning-progress';
import { t, useAppLanguage } from './language';
import {
  ParticipantPageError,
  ParticipantRouteHeading,
  participantDateText,
  participantStatusClass,
  participantWord,
  useParticipantEnrollments,
} from './participant-page-shared';
import './course-learning.css';

const CoursePackagePlayer = lazy(() => import('./course-package-player').then(module => ({ default: module.CoursePackagePlayer })));
const participantBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function ParticipantLearningPage() {
  const query = useParticipantEnrollments();
  const accepted = (query.data?.applications || []).filter(enrollment => enrollment.applicationStatus === 'accepted');
  return <div className="participant-wrap participant-route-page page-enter">
    <ParticipantRouteHeading title="Learning" summary="Program learning, assignments, and a direct channel to ask your trainer." />
    {query.isLoading ? <div className="loading-panel" role="status" aria-busy="true"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
      : query.isError ? <ParticipantPageError retry={() => void query.refetch()} />
        : !accepted.length ? <div id="participant-learning" className="empty-panel"><span className="empty-icon"><BookOpen size={20} /></span><h2>{t('Your learning path is being prepared.')}</h2><p>{t('Course progress appears here when you are accepted into a program.')}</p></div>
          : <div className="participant-route-stack">
            <section id="participant-learning" className="participant-route-section">
              <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Your course progress, learning time and a guided sequence of released materials in one place.')}</p></div></div>
              <div className="offline-learning-note" role="note"><Download size={16} aria-hidden="true" /><div className="offline-learning-note-copy"><div className="offline-learning-note-title"><b>{t('Prepare materials for offline study')}</b></div><div className="offline-learning-note-body">{t('Uploaded files can be saved on a device. External links and interactive SCORM or xAPI packages require internet access; interactive lessons do not run offline.')}</div></div></div>
              <ParticipantLearningProgress />
              <ParticipantProgramLearning />
            </section>
            <section id="participant-assignments" className="participant-route-section"><div className="participant-route-section-title"><h2>{t('Assignments and trainer questions')}</h2><p>{t('Your assignment work and a direct channel to ask your trainer.')}</p></div>{accepted.map(enrollment => <ParticipantLearning key={enrollment.applicationId} enrollment={enrollment} />)}</section>
          </div>}
  </div>;
}

function ParticipantProgramLearning({ showHeading = true, showEmpty = true, showOfflineNote = true }: { showHeading?: boolean; showEmpty?: boolean; showOfflineNote?: boolean } = {}) {
  useAppLanguage();
  const query = useGetParticipantCourses({ query: { queryKey: getGetParticipantCoursesQueryKey(), refetchOnWindowFocus: true } });
  const [activePackage, setActivePackage] = useState<{ id: number; title: string } | null>(null);
  const now = Date.now();
  if (query.isLoading) return <section className="participant-section participant-course-section" data-testid="participant-courses-loading">{showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Loading your released learning path.')}</p></div></div>}<div className="loading-panel"><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div></section>;
  if (query.isError) return <section className="participant-section participant-course-section">{showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Your accepted cohort learning materials.')}</p></div></div>}<div className="empty-panel error-panel" data-testid="error-participant-courses"><span className="empty-icon"><CircleAlert size={20} /></span><h3>{t('Your learning path couldn’t load.')}</h3><p>{t('Try reconnecting. Your cohort progress and materials remain private.')}</p><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-participant-courses">{t('Retry learning')}</button></div></section>;
  const programs = query.data?.programs || [];
  if (!programs.length) return showEmpty ? <section className="participant-section participant-course-section" data-testid="empty-participant-courses">{showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('Your accepted cohort learning materials.')}</p></div></div>}<div className="empty-panel"><span className="empty-icon"><BookOpen size={20} /></span><h3>{t('No modules yet')}</h3><p>{t('Once released by your program team, modules and resources for your accepted cohort will appear here.')}</p></div></section> : null;
  return <><section className="participant-section participant-course-section" data-testid="participant-course-learning">
    {showHeading && <div className="participant-section-head"><div><h2>{t('Program learning')}</h2><p>{t('A guided sequence of released modules and useful materials.')}</p></div><span className="badge badge-neutral">{programs.reduce((total, program) => total + program.modules.length, 0)} {t('released modules')}</span></div>}
    {showOfflineNote && <div className="offline-learning-note" role="note"><Download size={16} aria-hidden="true" /><div className="offline-learning-note-copy"><div className="offline-learning-note-title"><b>{t('Prepare materials for offline study')}</b></div><div className="offline-learning-note-body">{t('Uploaded files can be saved on a device. External links and interactive SCORM or xAPI packages require internet access; interactive lessons do not run offline.')}</div></div></div>}
    {programs.map(program => {
      const modules = program.modules.filter(module => !module.releaseAt || new Date(module.releaseAt).getTime() <= now).sort((a, b) => a.position - b.position);
      return <article className="participant-course-program" key={program.programId} data-testid={`participant-course-program-${program.programId}`}>
        <header className="participant-course-banner"><span className="participant-course-icon"><BookOpen size={17} /></span><div><h3>{program.programName}</h3><span>{modules.length} {t('learning')} {t(modules.length === 1 ? 'module' : 'modules')} {t('available')}</span></div></header>
        {!modules.length ? <div className="empty-panel"><p>{t('Your next module will appear here when your cohort releases it.')}</p></div> : modules.map((module, index) => <section className="participant-course-module" id={`participant-course-module-${module.id}`} key={module.id} data-testid={`participant-course-module-${module.id}`}><span className="participant-course-number">{String(index + 1).padStart(2, '0')}</span><div><h4>{module.title}</h4>{module.description && <p>{module.description}</p>}<div className="participant-course-items">{module.materials.map(material => {
          const isUploadedFile = material.kind !== 'link' && material.kind !== 'scorm' && material.kind !== 'xapi' && Boolean(material.fileName);
          const href = material.kind === 'link' ? material.externalUrl || undefined : isUploadedFile ? `${participantBasePath}/api/participant/courses/materials/${material.id}/download` : undefined;
          const languageTag = material.language === 'ar' ? 'العربية' : 'English';
          if (material.kind === 'scorm' || material.kind === 'xapi') return <button className="participant-course-item participant-package-launch" type="button" key={material.id} onClick={() => setActivePackage({ id: material.id, title: material.title })} data-testid={`button-launch-course-package-${material.id}`}><Play size={13} />{material.title}<span className="participant-content-language">{languageTag}</span><span className="participant-material-mode">{t('Online only')}</span></button>;
          return href ? <a className="participant-course-item" key={material.id} href={href} download={isUploadedFile ? true : undefined} target={material.kind === 'link' ? '_blank' : undefined} rel={material.kind === 'link' ? 'noreferrer' : undefined} data-testid={`link-participant-course-material-${material.id}`}>{material.kind === 'link' ? <ExternalLinkIcon size={13} /> : <Download size={13} />}{material.title}<span className="participant-content-language">{languageTag}</span><span className="participant-material-mode">{t(material.kind === 'link' ? 'Internet required' : 'Save to device')}</span></a> : <span className="participant-course-item" key={material.id} data-testid={`text-participant-course-material-${material.id}`}><BookOpen size={13} />{material.title}<span className="participant-content-language">{languageTag}</span></span>;
        })}</div><ParticipantModuleQuizzes moduleId={module.id} /><CourseDiscussion moduleId={module.id} participant /></div></section>)}
      </article>;
    })}
  </section>{activePackage && <Suspense fallback={<div className="modal-backdrop" role="presentation"><section className="modal-card" role="status">{t('Loading course package…')}</section></div>}><CoursePackagePlayer materialId={activePackage.id} title={activePackage.title} onClose={() => setActivePackage(null)} /></Suspense>}</>;
}

function ParticipantLearning({ enrollment }: { enrollment: ParticipantEnrollment }) {
  const queryClient = useQueryClient();
  const submit = useSubmitTrainingAnswer();
  const ask = useAskTrainingQuestion();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [feedback, setFeedback] = useState('');
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getGetParticipantDashboardQueryKey() });
  const submitAnswer = (event: FormEvent<HTMLFormElement>, assignment: ParticipantAssignment) => {
    event.preventDefault();
    const answer = (answers[assignment.id] || '').trim();
    if (!answer) return;
    const data: TrainingAnswerInput = { answer };
    submit.mutate({ id: assignment.id, data }, { onSuccess: () => { invalidate(); setAnswers(old => ({ ...old, [assignment.id]: '' })); } });
  };
  const askQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [kind, rawId] = context.split(':');
    const data: TrainingQuestionInput = {
      programId: enrollment.program.id,
      question: question.trim(),
      ...(kind === 'assignment' && rawId ? { assignmentId: Number(rawId) } : {}),
      ...(kind === 'session' && rawId ? { sessionId: Number(rawId) } : {}),
    };
    ask.mutate({ data }, { onSuccess: () => { invalidate(); setQuestion(''); setFeedback('Your question has been sent to the training team.'); } });
  };
  return <section className="participant-section" data-testid={`participant-learning-${enrollment.applicationId}`}>
    <div className="participant-section-head"><div><h2>{t('Assignments and trainer questions')}</h2><p>{t('Your assignment work and a direct channel to your trainer.')}</p></div><span className="badge badge-neutral">{enrollment.assignments.length} {t('assignments')}</span></div>
    <div className="participant-grid">
      <div className="participant-card"><h3>{t('Assignments')}</h3>{enrollment.assignments.length === 0 ? <div className="participant-empty-line" data-testid={`participant-assignments-empty-${enrollment.applicationId}`}><FileText size={17} aria-hidden="true" /><p>{t('No assignments have been shared yet.')}</p></div> : enrollment.assignments.map(assignment => <article className="participant-assignment" id={`participant-assignment-${assignment.id}`} key={assignment.id} data-testid={`assignment-participant-${assignment.id}`}>
        <div className="assignment-heading"><div><b>{assignment.title}</b><span>{assignment.sessionTitle || t('Cohort work')} · {t('Due')} {participantDateText(assignment.dueDate)}</span></div><span className={`badge ${participantStatusClass(assignment.status || 'requested')}`}><span />{participantWord(assignment.status || 'not_started')}</span></div>
        <p>{assignment.instructions}</p>
        {assignment.answer && <div className="assignment-feedback"><b>{t('Your submitted answer')}</b><p>{assignment.answer}</p></div>}
        {assignment.feedback && <div className="assignment-feedback trainer-feedback"><b>{t('Trainer feedback')}{assignment.score !== null ? ` · ${assignment.score}/100` : ''}</b><p>{assignment.feedback}</p></div>}
        <form onSubmit={event => submitAnswer(event, assignment)} className="participant-answer-form"><label htmlFor={`answer-${assignment.id}`}>{assignment.answer ? t('Update your answer') : t('Your answer')}</label><textarea id={`answer-${assignment.id}`} value={answers[assignment.id] ?? ''} onChange={event => setAnswers(old => ({ ...old, [assignment.id]: event.target.value }))} required maxLength={12000} rows={4} placeholder={t('Write your response here. Text only.')} data-testid={`input-participant-answer-${assignment.id}`} /><button className="button button-primary" disabled={submit.isPending} data-testid={`button-submit-answer-${assignment.id}`}>{submit.isPending ? t('Submitting…') : assignment.answer ? t('Update submission') : t('Submit answer')}</button>{submit.isError && <span className="form-error" role="alert">{t('Your answer was not saved. Try again.')}</span>}</form>
      </article>)}</div>
      <div className="participant-card"><h3>{t('Ask your trainer')}</h3>{enrollment.questions.length === 0 ? <p className="session-info">{t('Ask about an assignment or session. Replies from your trainer will stay with your cohort here.')}</p> : <div className="participant-questions">{enrollment.questions.map((item: ParticipantQuestion) => <article key={item.id} className="participant-question" data-testid={`question-participant-${item.id}`}><span className="question-context">{item.assignmentTitle || item.sessionTitle || t('Cohort question')}</span><p>{item.question}</p>{item.reply ? <div className="question-reply"><b>{t('Trainer reply')}</b><p>{item.reply}</p></div> : <span className="badge badge-warm"><span />{t('Awaiting reply')}</span>}</article>)}</div>}
        <form className="participant-question-form" onSubmit={askQuestion}><label htmlFor={`question-context-${enrollment.applicationId}`}>{t('Related to')}</label><select id={`question-context-${enrollment.applicationId}`} value={context} onChange={event => setContext(event.target.value)} data-testid={`select-question-context-${enrollment.applicationId}`}><option value="">{t('General cohort question')}</option>{enrollment.sessions.map(session => <option key={`session-${session.id}`} value={`session:${session.id}`}>{session.title}</option>)}{enrollment.assignments.map(item => <option key={`assignment-${item.id}`} value={`assignment:${item.id}`}>{item.title}</option>)}</select><label htmlFor={`question-text-${enrollment.applicationId}`}>{t('Your question')}</label><textarea id={`question-text-${enrollment.applicationId}`} value={question} onChange={event => setQuestion(event.target.value)} minLength={5} maxLength={3000} required rows={3} placeholder={t('What would you like your trainer to clarify?')} data-testid={`input-participant-question-${enrollment.applicationId}`} /><button className="button button-primary participant-primary-action" disabled={ask.isPending} data-testid={`button-ask-trainer-${enrollment.applicationId}`}>{ask.isPending ? t('Sending…') : t('Send question')}</button>{feedback && <span className="role-success" role="status">{t(feedback)}</span>}{ask.isError && <span className="form-error" role="alert">{t('Your question was not sent. Please try again.')}</span>}</form>
      </div>
    </div>
    <div className="participant-support-note" role="note"><Handshake size={15} aria-hidden="true" /><span><b>{t('Need program support?')}</b> {t('Contact the program team if you need help outside a session.')}</span></div>
  </section>;
}
