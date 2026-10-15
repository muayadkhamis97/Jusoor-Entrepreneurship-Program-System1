import { useEffect, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCourseModuleQuizzesQueryKey, getGetCourseQuizAttemptsQueryKey,
  getGetParticipantCourseModuleQuizzesQueryKey, getGetParticipantCoursesQueryKey,
  useCreateCourseQuiz, useGetCourseModuleQuizzes, useGetCourseQuizAttempts,
  useGetParticipantCourseModuleQuizzes, useSubmitParticipantCourseQuizAttempt,
  useUpdateCourseQuiz,
} from '@workspace/api-client-react';
import type {
  CourseQuiz, CourseQuizInput, CourseQuizQuestionInput,
  ParticipantCourseQuiz, ParticipantCourseQuizQuestion, CourseQuizAttempt,
  CourseQuizSubmissionInput,
} from '@workspace/api-client-react';
import {
  AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, ClipboardCheck,
  GripVertical, LockKeyhole, Pencil, Plus, RotateCcw, Save, ShieldCheck,
} from 'lucide-react';
import { currentLanguage, t, useAppLanguage } from './language';
import { AccessibleDialogSurface } from './accessible-dialog';
import { clearCourseQuizDraft, courseQuizDraftStorageKey, readCourseQuizDraft, writeCourseQuizDraft } from './course-quiz-drafts';
import './course-quizzes.css';

type DraftQuestion = CourseQuizQuestionInput & { key: string };
type QuizDraft = { title: string; description: string; language: 'en' | 'ar'; isPublished: boolean; assessmentType: CourseQuiz['assessmentType']; gradingFormat: CourseQuiz['gradingFormat']; letterGradeScale: CourseQuiz['letterGradeScale']; questions: DraftQuestion[] };
const defaultScale: CourseQuiz['letterGradeScale'] = [{ grade: 'A', minimumPercent: 90 }, { grade: 'B', minimumPercent: 80 }, { grade: 'C', minimumPercent: 70 }, { grade: 'D', minimumPercent: 60 }, { grade: 'F', minimumPercent: 0 }];

const makeQuestion = (index = 0): DraftQuestion => ({
  key: `question-${Date.now()}-${index}`,
  questionType: 'multiple_choice',
  prompt: '',
  choices: [
    { id: `choice-${Date.now()}-${index}-a`, text: '' },
    { id: `choice-${Date.now()}-${index}-b`, text: '' },
  ],
  correctAnswer: '',
  explanation: '',
});
const cleanDraft = (quiz?: CourseQuiz): QuizDraft => quiz ? ({
  title: quiz.title,
  description: quiz.description || '',
  language: quiz.language || 'en',
  isPublished: quiz.isPublished,
  assessmentType: quiz.assessmentType || 'knowledge_check',
  gradingFormat: quiz.gradingFormat || 'numerical',
  letterGradeScale: quiz.letterGradeScale?.length ? quiz.letterGradeScale.map(band => ({ ...band })) : defaultScale.map(band => ({ ...band })),
  questions: quiz.questions.map(question => ({ ...question, key: `saved-${question.id}` })),
}) : ({ title: '', description: '', language: 'en', isPublished: false, assessmentType: 'knowledge_check', gradingFormat: 'numerical', letterGradeScale: defaultScale.map(band => ({ ...band })), questions: [makeQuestion()] });
const formatLabel = (format: string) => t(({ numerical: 'Numerical', percentage: 'Percentage', letter: 'Letter grade' } as Record<string, string>)[format] || format);
const assessmentLabel = (assessment: string) => t(({ knowledge_check: 'Knowledge check', pre_course: 'Pre-course assessment', post_course: 'Post-course assessment' } as Record<string, string>)[assessment] || assessment);

function Feedback({ attempt }: { attempt: CourseQuizAttempt }) {
  return <div className="quiz-feedback-list">
    <div className="quiz-feedback-grade" data-testid={`text-participant-grade-${attempt.id}`}><span>{t('Graded result')} · {formatLabel(attempt.gradeFormat)}</span><b>{attempt.gradeValue}</b><small>{attempt.score} / {attempt.totalQuestions}</small></div>
    {attempt.answers.map((answer, index) => {
      return <article className={`quiz-feedback ${answer.isCorrect ? 'is-correct' : 'is-incorrect'}`} key={answer.questionId} data-testid={`quiz-feedback-${answer.questionId}`}>
        <div className="quiz-feedback-top"><span>{t('Question')} {index + 1}</span><b>{answer.isCorrect ? t('Correct') : t('Review this answer')}</b></div>
        <h4>{answer.prompt}</h4>
        <p><strong>{t('Your answer')}</strong> {answer.submittedAnswer}</p>
        {!answer.isCorrect && <p><strong>{t('Correct answer')}</strong> {answer.correctAnswer}</p>}
        {answer.explanation && <p className="quiz-explanation"><strong>{t('Why')}</strong> {answer.explanation}</p>}
      </article>;
    })}
  </div>;
}

function QuizAttemptList({ quizId }: { quizId: number }) {
  const query = useGetCourseQuizAttempts(quizId, { query: { queryKey: getGetCourseQuizAttemptsQueryKey(quizId) } });
  if (query.isLoading) return <div className="quiz-attempt-loading" aria-label={t('Loading attempts')}><span /><span /><span /></div>;
  if (query.isError) return <div className="quiz-inline-error" role="alert"><AlertCircle size={15} />{t('Attempts could not load.')} <button type="button" onClick={() => void query.refetch()}>{t('Retry')}</button></div>;
  const attempts = query.data || [];
  if (!attempts.length) return <div className="quiz-empty-attempts">{t('No participant attempts yet.')}</div>;
  return <div className="quiz-attempts">
    {attempts.map(attempt => <details className="quiz-attempt" key={attempt.id} data-testid={`quiz-attempt-${attempt.id}`}>
      <summary><span className="quiz-attempt-avatar" aria-hidden="true">{attempt.participantName.slice(0, 1).toUpperCase()}</span><span className="quiz-attempt-name"><b>{attempt.participantName}</b><small>{new Date(attempt.submittedAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</small></span><span className="quiz-score">{attempt.gradeValue}<small> · {formatLabel(attempt.gradeFormat)}</small></span><ChevronDown size={15} /></summary>
      <div className="quiz-attempt-detail"><div className="quiz-attempt-grade" data-testid={`text-attempt-grade-${attempt.id}`}><span>{t('Graded result')}</span><b>{attempt.gradeValue}</b><small>{formatLabel(attempt.gradeFormat)} · {attempt.score} / {attempt.totalQuestions}</small></div>{attempt.answers.map((answer, index) => <article className="quiz-review-answer" key={`${attempt.id}-${answer.questionId}`}><span>{t('Question')} {index + 1} · {answer.isCorrect ? t('Correct') : t('Incorrect')}</span><h4>{answer.prompt}</h4><p><b>{t('Participant answer')}</b> {answer.submittedAnswer}</p>{!answer.isCorrect && <p><b>{t('Correct answer')}</b> {answer.correctAnswer}</p>}{answer.explanation && <p className="quiz-explanation"><b>{t('Explanation')}</b> {answer.explanation}</p>}</article>)}</div>
    </details>)}
  </div>;
}

function QuizEditor({ moduleId, quiz, onClose, onSaved }: { moduleId: number; quiz?: CourseQuiz; onClose: () => void; onSaved: () => void }) {
  const create = useCreateCourseQuiz();
  const update = useUpdateCourseQuiz();
  const client = useQueryClient();
  const draftStorageKey = courseQuizDraftStorageKey(moduleId, quiz?.id);
  const [draft, setDraft] = useState<QuizDraft>(() => readCourseQuizDraft(draftStorageKey, cleanDraft(quiz)));
  const [error, setError] = useState('');
  const pending = create.isPending || update.isPending;
  useEffect(() => {
    writeCourseQuizDraft(draftStorageKey, draft);
  }, [draftStorageKey, draft]);
  const discardDraft = () => {
    clearCourseQuizDraft(draftStorageKey);
    onClose();
  };
  const patchQuestion = (key: string, patch: Partial<DraftQuestion>) => setDraft(current => ({ ...current, questions: current.questions.map(question => question.key === key ? { ...question, ...patch } : question) }));
  const changeType = (question: DraftQuestion, type: DraftQuestion['questionType']) => {
    let choices = type === 'true_false'
      ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }]
      : question.choices.length >= 2 ? question.choices : [{ id: `${question.key}-a`, text: '' }, { id: `${question.key}-b`, text: '' }];
    if (type === 'ordering' && choices.length < 3) {
      choices = [...choices, ...Array.from({ length: 3 - choices.length }, (_, index) => ({
        id: `${question.key}-order-${choices.length + index + 1}`,
        text: '',
      }))];
    }
    const correctAnswer: CourseQuizQuestionInput['correctAnswer'] = type === 'ordering' ? choices.map(choice => choice.id) : type === 'true_false' ? true : choices[0]?.id || '';
    patchQuestion(question.key, { questionType: type, choices, correctAnswer });
  };
  const save = () => {
    const title = draft.title.trim();
    if (!title) { setError(t('Add a quiz title.')); return; }
    if (!draft.questions.length) { setError(t('Add at least one question.')); return; }
    if (draft.letterGradeScale.length < 2 || draft.letterGradeScale.length > 12) { setError(t('Use between 2 and 12 grade bands.')); return; }
    const gradeLabels = draft.letterGradeScale.map(band => band.grade.trim().toLowerCase());
    const thresholds = draft.letterGradeScale.map(band => Number(band.minimumPercent));
    if (gradeLabels.some(label => !label) || new Set(gradeLabels).size !== gradeLabels.length) { setError(t('Grade labels must be non-empty and unique.')); return; }
    if (thresholds.some(value => !Number.isFinite(value) || value < 0 || value > 100) || new Set(thresholds).size !== thresholds.length) { setError(t('Grade cutoffs must be unique percentages from 0 to 100.')); return; }
    if (!thresholds.includes(0)) { setError(t('One grade band must start at 0%.')); return; }
    for (let index = 0; index < draft.questions.length; index += 1) {
      const question = draft.questions[index];
      if (!question.prompt.trim()) { setError(`${t('Add a prompt for question')} ${index + 1}.`); return; }
      const minimumChoices = question.questionType === 'ordering' ? 3 : 2;
      if (question.choices.length < minimumChoices || question.choices.some(choice => !choice.text.trim())) {
        const message = question.questionType === 'ordering' ? 'Add at least three complete items for question' : 'Add at least two complete choices for question';
        setError(`${t(message)} ${index + 1}.`); return;
      }
      if (question.questionType === 'multiple_choice' && !question.choices.some(choice => choice.id === question.correctAnswer)) { setError(`${t('Choose the correct answer for question')} ${index + 1}.`); return; }
      if (question.questionType === 'ordering' && (!Array.isArray(question.correctAnswer) || question.correctAnswer.length !== question.choices.length)) { setError(`${t('Set the correct order for question')} ${index + 1}.`); return; }
    }
    const data: CourseQuizInput = {
      title, description: draft.description.trim() || null, language: draft.language, isPublished: draft.isPublished,
      assessmentType: draft.assessmentType, gradingFormat: draft.gradingFormat,
      letterGradeScale: draft.letterGradeScale.map(band => ({ grade: band.grade.trim(), minimumPercent: Number(band.minimumPercent) })),
      questions: draft.questions.map(question => ({
        questionType: question.questionType, prompt: question.prompt.trim(),
        choices: question.choices.map(choice => ({ ...choice, text: choice.text.trim() })),
        correctAnswer: question.correctAnswer,
        explanation: question.explanation?.trim() || null,
      })),
    };
    const done = () => {
      void Promise.all([
        client.invalidateQueries({ queryKey: getGetCourseModuleQuizzesQueryKey(moduleId) }),
        client.invalidateQueries({ queryKey: getGetParticipantCourseModuleQuizzesQueryKey(moduleId) }),
        client.invalidateQueries({ queryKey: getGetParticipantCoursesQueryKey() }),
        ...(quiz ? [client.invalidateQueries({ queryKey: getGetCourseQuizAttemptsQueryKey(quiz.id) })] : []),
      ]);
      clearCourseQuizDraft(draftStorageKey);
      onSaved();
    };
    if (quiz) update.mutate({ id: quiz.id, data }, { onSuccess: done, onError: () => setError(t('Quiz could not be saved. Try again.')) });
    else create.mutate({ id: moduleId, data }, { onSuccess: done, onError: () => setError(t('Quiz could not be created. Try again.')) });
  };
  return <AccessibleDialogSurface
    className="quiz-editor"
    labelledBy="quiz-editor-title"
    describedBy="quiz-editor-description"
    initialFocusSelector="[data-testid='input-quiz-title']"
    onClose={onClose}
    closeOnEscape={!pending}
    closeOnOutsideInteraction={!pending}
    testId="dialog-quiz-editor"
  >
       <header className="quiz-editor-head"><div><span className="eyebrow">{t('COHORT LEARNING / ASSESSMENT')}</span><h2 id="quiz-editor-title">{t(quiz ? 'Edit quiz' : 'Create a quiz')}</h2><p id="quiz-editor-description">{t('Build clear checks for understanding. Answers stay private until a founder submits.')}</p></div><button className="quiz-close" type="button" onClick={onClose} disabled={pending} aria-label={t('Close quiz editor')}>×</button></header>
      <div className="quiz-editor-scroll">
        <label className="quiz-field">{t('Quiz title')}<input value={draft.title} maxLength={180} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder={t('e.g. Customer discovery check-in')} data-testid="input-quiz-title" /></label>
        <label className="quiz-field">{t('Description')}<textarea rows={2} maxLength={2000} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder={t('What should founders take away?')} data-testid="input-quiz-description" /></label>
         <label className="quiz-field">{t('Content language')}<select value={draft.language} onChange={event => setDraft(current => ({ ...current, language: event.target.value as 'en' | 'ar' }))} data-testid="select-quiz-language"><option value="en">English</option><option value="ar">العربية / Arabic</option></select></label>
         <div className="quiz-assessment-grid">
           <label className="quiz-field">{t('Assessment type')}<select value={draft.assessmentType} onChange={event => setDraft(current => ({ ...current, assessmentType: event.target.value as QuizDraft['assessmentType'] }))} data-testid="select-quiz-assessment-type"><option value="knowledge_check">{t('Knowledge check')}</option><option value="pre_course">{t('Pre-course assessment')}</option><option value="post_course">{t('Post-course assessment')}</option></select></label>
           <label className="quiz-field">{t('Grading format')}<select value={draft.gradingFormat} onChange={event => setDraft(current => ({ ...current, gradingFormat: event.target.value as QuizDraft['gradingFormat'] }))} data-testid="select-quiz-grading-format"><option value="numerical">{t('Numerical')}</option><option value="percentage">{t('Percentage')}</option><option value="letter">{t('Letter grade')}</option></select></label>
         </div>
         {draft.gradingFormat === 'letter' && <section className="quiz-grade-scale" aria-label={t('Letter grade scale')} data-testid="section-letter-grade-scale"><div className="quiz-grade-scale-head"><div><b>{t('Letter grade scale')}</b><small>{t('Set each grade label and its minimum percentage. The server orders the bands.')}</small></div><button className="quiz-add-choice" type="button" disabled={draft.letterGradeScale.length >= 12} onClick={() => setDraft(current => ({ ...current, letterGradeScale: [...current.letterGradeScale, { grade: '', minimumPercent: 0 }] }))} data-testid="button-add-grade-band"><Plus size={12} />{t('Add grade band')}</button></div><div className="quiz-grade-bands">{draft.letterGradeScale.map((band, index) => <div className="quiz-grade-band" key={`grade-band-${index}`}><label>{t('Grade label')}<input value={band.grade} maxLength={8} onChange={event => setDraft(current => ({ ...current, letterGradeScale: current.letterGradeScale.map((item, itemIndex) => itemIndex === index ? { ...item, grade: event.target.value } : item) }))} data-testid={`input-grade-label-${index}`} /></label><label>{t('Minimum percent')}<span className="quiz-percent-input"><input type="number" min="0" max="100" step="0.1" value={band.minimumPercent} onChange={event => setDraft(current => ({ ...current, letterGradeScale: current.letterGradeScale.map((item, itemIndex) => itemIndex === index ? { ...item, minimumPercent: Number(event.target.value) } : item) }))} data-testid={`input-grade-cutoff-${index}`} /><i>%</i></span></label><button type="button" className="quiz-remove-choice" aria-label={`${t('Remove grade band')} ${index + 1}`} disabled={draft.letterGradeScale.length <= 2} onClick={() => setDraft(current => ({ ...current, letterGradeScale: current.letterGradeScale.filter((_, itemIndex) => itemIndex !== index) }))} data-testid={`button-remove-grade-band-${index}`}>×</button></div>)}</div><small className="quiz-grade-scale-note">{t('Use 2 to 12 distinct labels and cutoffs, including one band at 0%.')}</small></section>}
        <div className="quiz-editor-section-head"><div><span className="eyebrow">{t('QUESTIONS')}</span><p>{t('Multiple-choice questions need two options; ordering questions need three items.')}</p></div><button className="button button-outline quiz-add-question" type="button" disabled={draft.questions.length >= 50} onClick={() => setDraft(current => ({ ...current, questions: [...current.questions, makeQuestion(current.questions.length)] }))} data-testid="button-add-quiz-question"><Plus size={14} />{t('Add question')}</button></div>
         {draft.questions.map((question, index) => <article className="quiz-question-editor" key={question.key} data-testid={`quiz-editor-question-${index}`}>
          <div className="quiz-question-editor-top"><span>{t('Question')} {String(index + 1).padStart(2, '0')}</span><button className="quiz-remove-question" type="button" disabled={draft.questions.length <= 1} onClick={() => setDraft(current => ({ ...current, questions: current.questions.filter(item => item.key !== question.key) }))}>{t('Remove question')}</button></div>
          <label className="quiz-field">{t('Question prompt')}<textarea rows={2} maxLength={1500} value={question.prompt} onChange={event => patchQuestion(question.key, { prompt: event.target.value })} data-testid={`input-quiz-prompt-${index}`} /></label>
          <label className="quiz-field">{t('Question type')}<select value={question.questionType} onChange={event => changeType(question, event.target.value as DraftQuestion['questionType'])} data-testid={`select-quiz-type-${index}`}><option value="multiple_choice">{t('Multiple choice')}</option><option value="true_false">{t('True or false')}</option><option value="ordering">{t('Ordering')}</option></select></label>
          <div className="quiz-choice-list"><span className="quiz-mini-label">{question.questionType === 'ordering' ? t('Correct sequence') : t('Answer choices')}</span>
            {question.choices.map((choice, choiceIndex) => <div className="quiz-choice-edit" key={choice.id}>
              {question.questionType === 'ordering' && <span className="quiz-order-index">{choiceIndex + 1}</span>}
              {question.questionType === 'true_false' ? <span className="quiz-static-choice">{t(choice.text)}</span> : <input aria-label={`${t('Choice')} ${choiceIndex + 1}`} value={choice.text} maxLength={500} onChange={event => patchQuestion(question.key, { choices: question.choices.map(item => item.id === choice.id ? { ...item, text: event.target.value } : item) })} data-testid={`input-quiz-choice-${index}-${choiceIndex}`} />}
              {question.questionType === 'multiple_choice' && <label className="quiz-correct-pick"><input type="radio" name={`correct-${question.key}`} checked={question.correctAnswer === choice.id} onChange={() => patchQuestion(question.key, { correctAnswer: choice.id })} />{t('Correct')}</label>}
              {question.questionType === 'ordering' && <div className="quiz-order-controls"><button type="button" aria-label={`${t('Move up')} ${choice.text || `${t('choice')} ${choiceIndex + 1}`}`} disabled={choiceIndex === 0} onClick={() => { const choices = [...question.choices]; [choices[choiceIndex - 1], choices[choiceIndex]] = [choices[choiceIndex], choices[choiceIndex - 1]]; patchQuestion(question.key, { choices, correctAnswer: choices.map(item => item.id) }); }}><ArrowUp size={13} /></button><button type="button" aria-label={`${t('Move down')} ${choice.text || `${t('choice')} ${choiceIndex + 1}`}`} disabled={choiceIndex === question.choices.length - 1} onClick={() => { const choices = [...question.choices]; [choices[choiceIndex + 1], choices[choiceIndex]] = [choices[choiceIndex], choices[choiceIndex + 1]]; patchQuestion(question.key, { choices, correctAnswer: choices.map(item => item.id) }); }}><ArrowDown size={13} /></button></div>}
              {question.questionType !== 'true_false' && <button className="quiz-remove-choice" type="button" aria-label={t('Remove choice')} disabled={question.choices.length <= 2} onClick={() => { const choices = question.choices.filter(item => item.id !== choice.id); const correctAnswer = question.questionType === 'ordering' ? choices.map(item => item.id) : question.correctAnswer === choice.id ? choices[0].id : question.correctAnswer; patchQuestion(question.key, { choices, correctAnswer }); }}>×</button>}
            </div>)}
            {question.questionType !== 'true_false' && <button type="button" className="quiz-add-choice" disabled={question.choices.length >= 10} onClick={() => { const choices = [...question.choices, { id: `${question.key}-choice-${Date.now()}`, text: '' }]; patchQuestion(question.key, { choices, ...(question.questionType === 'ordering' ? { correctAnswer: choices.map(item => item.id) } : {}) }); }}><Plus size={12} />{t('Add choice')}</button>}
            {question.questionType === 'true_false' && <div className="quiz-correct-truefalse"><label><input type="radio" name={`truth-${question.key}`} checked={question.correctAnswer === true} onChange={() => patchQuestion(question.key, { correctAnswer: true })} />{t('True')}</label><label><input type="radio" name={`truth-${question.key}`} checked={question.correctAnswer === false} onChange={() => patchQuestion(question.key, { correctAnswer: false })} />{t('False')}</label><span>{t('Choose the correct answer')}</span></div>}
          </div>
          <label className="quiz-field">{t('Explanation shown after submission')}<textarea rows={2} maxLength={2000} value={question.explanation || ''} onChange={event => patchQuestion(question.key, { explanation: event.target.value })} placeholder={t('Explain the reasoning, not just the answer.')} data-testid={`input-quiz-explanation-${index}`} /></label>
        </article>)}
        <label className="quiz-publish-check"><input type="checkbox" checked={draft.isPublished} onChange={event => setDraft(current => ({ ...current, isPublished: event.target.checked }))} /> <span><b>{t('Publish this quiz')}</b><small>{t('Participants can see it only after this module is published and released.')}</small></span></label>
      </div>
      {error && <p className="quiz-form-error" role="alert"><AlertCircle size={15} />{error}</p>}
       <footer className="quiz-editor-actions"><button className="button button-quiet" type="button" onClick={onClose} disabled={pending}>{t('Close')}</button><button className="button button-quiet" type="button" onClick={discardDraft} disabled={pending} data-testid="button-discard-quiz-draft">{t('Discard draft')}</button><button className="button button-primary" type="button" onClick={save} disabled={pending} data-testid="button-save-quiz">{pending ? t('Saving quiz…') : <><Save size={14} />{t('Save quiz')}</>}</button></footer>
  </AccessibleDialogSurface>;
}

export function CourseQuizManagement({ moduleId, readOnly = false }: { moduleId: number; readOnly?: boolean }) {
  useAppLanguage();
  const client = useQueryClient();
  const query = useGetCourseModuleQuizzes(moduleId, { query: { queryKey: getGetCourseModuleQuizzesQueryKey(moduleId) } });
  const [editing, setEditing] = useState<CourseQuiz | 'new' | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const update = useUpdateCourseQuiz();
  const quizzes = query.data?.quizzes || [];
  const setPublished = (quiz: CourseQuiz) => {
    const data: CourseQuizInput = { title: quiz.title, description: quiz.description, language: quiz.language, assessmentType: quiz.assessmentType, gradingFormat: quiz.gradingFormat, letterGradeScale: quiz.letterGradeScale, isPublished: !quiz.isPublished, questions: quiz.questions.map(question => ({ questionType: question.questionType, prompt: question.prompt, choices: question.choices, correctAnswer: question.correctAnswer, explanation: question.explanation })) };
    setError(''); setSuccess('');
    update.mutate({ id: quiz.id, data }, { onSuccess: () => { void Promise.all([client.invalidateQueries({ queryKey: getGetCourseModuleQuizzesQueryKey(moduleId) }), client.invalidateQueries({ queryKey: getGetCourseQuizAttemptsQueryKey(quiz.id) }), client.invalidateQueries({ queryKey: getGetParticipantCourseModuleQuizzesQueryKey(moduleId) }), client.invalidateQueries({ queryKey: getGetParticipantCoursesQueryKey() })]); setSuccess(t(data.isPublished ? 'Quiz published.' : 'Quiz unpublished. Saved attempts are kept.')); }, onError: () => setError(t('Quiz status could not be changed. Try again.')) });
  };
  return <section className={`course-quiz-management ${readOnly ? 'quiz-readonly' : ''}`} aria-label={t('Module quizzes')} data-testid={`course-quizzes-${moduleId}`}>
    <header className="course-quiz-head"><div className="quiz-mark"><ClipboardCheck size={16} /></div><div className="course-quiz-heading"><span className="eyebrow">{t('MODULE ASSESSMENT')}</span><h3>{t('Quizzes')}</h3><p>{t(readOnly ? 'Review quiz attempts for your assigned, released cohorts.' : 'Create focused checks for understanding and review founder attempts.')}</p></div>{!readOnly && <button className="button button-outline quiz-create-trigger" type="button" onClick={() => { setEditing('new'); setError(''); }} data-testid={`button-create-quiz-${moduleId}`}><Plus size={14} />{t('Add quiz')}</button>}</header>
    {success && <div className="quiz-success" role="status"><Check size={14} />{success}</div>}
    {error && <div className="quiz-inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
    {query.isLoading ? <div className="quiz-skeleton" aria-label={t('Loading quizzes')}><span /><span /></div>
      : query.isError ? <div className="quiz-inline-error" role="alert"><AlertCircle size={15} />{t('Quizzes could not load.')} <button type="button" onClick={() => void query.refetch()}>{t('Retry')}</button></div>
      : !quizzes.length ? <div className="quiz-management-empty"><ShieldCheck size={17} /><span><b>{t('No quizzes in this module yet.')}</b><small>{t(readOnly ? 'An admin’s published assessments will appear here.' : 'Add a quiz when this module is ready for a knowledge check.')}</small></span></div>
      : <div className="course-quiz-list">{quizzes.map(quiz => <article className="course-quiz-item" key={quiz.id} data-testid={`course-quiz-${quiz.id}`}>
            <div className="course-quiz-item-main"><span className={`quiz-status ${quiz.isPublished ? 'published' : 'draft'}`}><i />{t(quiz.isPublished ? 'Published' : 'Unpublished')}</span><h4>{quiz.title}</h4>{quiz.description && <p>{quiz.description}</p>}<span className="quiz-item-meta">{assessmentLabel(quiz.assessmentType)} · {formatLabel(quiz.gradingFormat)} · {quiz.language === 'ar' ? 'العربية' : 'English'} · {quiz.questions.length} {t(quiz.questions.length === 1 ? 'question' : 'questions')}</span></div>
          <div className="course-quiz-item-actions">{!readOnly && <><button type="button" className="quiz-action" onClick={() => { setEditing(quiz); setError(''); }} data-testid={`button-edit-quiz-${quiz.id}`}><Pencil size={13} />{t('Edit')}</button><button type="button" className={`quiz-action ${quiz.isPublished ? 'unpublish' : 'publish'}`} disabled={update.isPending} onClick={() => setPublished(quiz)} data-testid={`button-toggle-publish-quiz-${quiz.id}`}>{quiz.isPublished ? t('Unpublish') : t('Publish')}</button></>}<button type="button" className="quiz-action review" aria-expanded={reviewingId === quiz.id} onClick={() => setReviewingId(current => current === quiz.id ? null : quiz.id)} data-testid={`button-review-quiz-attempts-${quiz.id}`}>{t(reviewingId === quiz.id ? 'Close attempts' : 'Review attempts')}<ChevronDown size={13} /></button></div>
          {reviewingId === quiz.id && <div className="quiz-review-panel"><div className="quiz-review-heading"><b>{t('Participant attempts')}</b><span>{t('Business names, answers and explanations')}</span></div><QuizAttemptList quizId={quiz.id} /></div>}
        </article>)}</div>}
    {editing && <QuizEditor moduleId={moduleId} quiz={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSuccess(t('Quiz saved.')); }} />}
  </section>;
}

function answerLabel(answer: string | boolean | string[], choices: { id: string; text: string }[]): string {
  if (typeof answer === 'boolean') return t(answer ? 'True' : 'False');
  if (Array.isArray(answer)) return answer.map(id => choices.find(choice => choice.id === id)?.text || id).join(' → ');
  try {
    const parsed: unknown = JSON.parse(answer);
    if (Array.isArray(parsed)) return parsed.map(id => choices.find(choice => choice.id === id)?.text || String(id)).join(' → ');
    if (typeof parsed === 'boolean') return t(parsed ? 'True' : 'False');
    if (typeof parsed === 'string') return choices.find(choice => choice.id === parsed)?.text || parsed;
  } catch { /* API may return display text rather than serialized values. */ }
  return choices.find(choice => choice.id === answer)?.text || answer;
}

function defaultChoiceOrder(question: ParticipantCourseQuizQuestion): string[] {
  return question.choices.map(choice => choice.id).reverse();
}

function ParticipantQuizCard({ quiz }: { quiz: ParticipantCourseQuiz }) {
  const client = useQueryClient();
  const submit = useSubmitParticipantCourseQuizAttempt();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string | boolean | string[]>>({});
  const [orderDrag, setOrderDrag] = useState<{ questionId: number; choiceId: string } | null>(null);
  const [attempt, setAttempt] = useState<CourseQuizAttempt | null>(null);
  const [validation, setValidation] = useState('');
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const questions = quiz.questions;
  const latest = attempt || quiz.latestAttempt;
  const choose = (questionId: number, answer: string | boolean | string[]) => setAnswers(current => ({ ...current, [questionId]: answer }));
  const moveChoice = (questionId: number, choiceId: string, delta: number) => {
    const question = questions.find(item => item.id === questionId);
    const current = answers[questionId];
    const order = Array.isArray(current) ? current : question?.choices.map(choice => choice.id) || [];
    const index = order.indexOf(choiceId);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order]; [next[index], next[target]] = [next[target], next[index]];
    choose(questionId, next);
  };
  const startAgain = () => { submit.reset(); setFeedbackVisible(false); setAnswers({}); setValidation(''); setOpen(true); };
  const toggleQuiz = () => {
    if (open) { setOpen(false); setValidation(''); }
    else if (latest) startAgain();
    else { setOpen(true); setValidation(''); }
  };
  const doSubmit = () => {
    if (questions.some(question => answers[question.id] === undefined)) { setValidation(t('Answer each question before submitting.')); return; }
    const data: CourseQuizSubmissionInput = { answers: questions.map(question => ({ questionId: question.id, answer: answers[question.id]! })) };
    setValidation('');
    submit.mutate({ id: quiz.id, data }, { onSuccess: result => {
      setAttempt(result); setFeedbackVisible(true); setOpen(false);
      void Promise.all([client.invalidateQueries({ queryKey: getGetParticipantCourseModuleQuizzesQueryKey(quiz.moduleId) }), client.invalidateQueries({ queryKey: getGetCourseQuizAttemptsQueryKey(quiz.id) }), client.invalidateQueries({ queryKey: getGetParticipantCoursesQueryKey() })]);
    } });
  };
  const beginDrag = (event: DragEvent<HTMLButtonElement>, questionId: number, choiceId: string) => {
    setOrderDrag({ questionId, choiceId });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', choiceId);
  };
  const dropOn = (event: DragEvent<HTMLDivElement>, questionId: number, targetId: string) => {
    event.preventDefault();
    const dragged = orderDrag?.questionId === questionId ? orderDrag.choiceId : event.dataTransfer.getData('text/plain');
    if (!dragged || dragged === targetId) return;
    const question = questions.find(item => item.id === questionId);
    const current = answers[questionId];
    const order = Array.isArray(current) ? [...current] : question?.choices.map(choice => choice.id) || [];
    const from = order.indexOf(dragged); const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1); order.splice(to, 0, dragged); choose(questionId, order); setOrderDrag(null);
  };
  return <article className="participant-quiz-card" data-testid={`participant-quiz-${quiz.id}`}>
     <div className="participant-quiz-top"><span className="participant-quiz-icon"><ClipboardCheck size={15} /></span><div className="participant-quiz-copy"><h4>{quiz.title}</h4>{quiz.description && <p>{quiz.description}</p>}<span>{assessmentLabel(quiz.assessmentType)} · {formatLabel(quiz.gradingFormat)} · {quiz.language === 'ar' ? 'العربية' : 'English'} · {quiz.questionCount} {t(quiz.questionCount === 1 ? 'question' : 'questions')} · {quiz.attemptCount} {t(quiz.attemptCount === 1 ? 'attempt' : 'attempts')}</span></div><button type="button" className="button button-outline participant-quiz-open" onClick={toggleQuiz} aria-expanded={open} data-testid={`button-open-quiz-${quiz.id}`}>{t(open ? 'Close quiz' : latest ? 'Retake quiz' : 'Start quiz')}<ChevronDown size={14} /></button></div>
     {latest && !open && <div className="latest-quiz-result" data-testid={`latest-quiz-result-${quiz.id}`}><span className="quiz-result-score"><b>{latest.gradeValue}</b></span><span><strong>{t('Latest result')} · {formatLabel(latest.gradeFormat)}</strong><small>{latest.score} / {latest.totalQuestions} · {new Date(latest.submittedAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</small></span><button type="button" className="quiz-action" onClick={() => setFeedbackVisible(value => !value)}>{t(feedbackVisible ? 'Hide feedback' : 'View feedback')}</button></div>}
    {feedbackVisible && !open && latest && <Feedback attempt={latest} />}
    {open && <div className="participant-quiz-body"><div className="quiz-answer-notice"><LockKeyhole size={14} />{t('Your answers and feedback appear after you submit.')}</div>
      {questions.map((question, index) => {
        const selected = answers[question.id];
        const orderedIds = Array.isArray(selected) ? selected : defaultChoiceOrder(question);
        return <fieldset className="participant-question" key={question.id} data-testid={`participant-question-${question.id}`}>
          <legend><span>{t('Question')} {index + 1} / {questions.length}</span><b>{question.prompt}</b></legend>
          {question.questionType === 'ordering' ? <div className="participant-order-list" aria-label={t('Drag choices to put them in order, or use the move buttons.')}>
            {orderedIds.map((choiceId, choiceIndex) => {
              const choice = question.choices.find(item => item.id === choiceId);
              if (!choice) return null;
              return <div className={`participant-order-choice ${orderDrag?.choiceId === choiceId ? 'drag-active' : ''}`} key={choiceId} onDragOver={event => event.preventDefault()} onDrop={event => dropOn(event, question.id, choiceId)} data-testid={`ordering-choice-${question.id}-${choiceId}`}>
                <button type="button" className="quiz-drag-handle" draggable aria-label={`${t('Drag to reorder')} ${choice.text}`} onDragStart={event => beginDrag(event, question.id, choice.id)} onDragEnd={() => setOrderDrag(null)}><GripVertical size={15} /></button><span className="quiz-order-index">{choiceIndex + 1}</span><span className="participant-choice-label">{choice.text}</span><span className="quiz-order-controls"><button type="button" aria-label={`${t('Move up')} ${choice.text}`} disabled={choiceIndex === 0} onClick={() => moveChoice(question.id, choiceId, -1)}><ArrowUp size={14} /></button><button type="button" aria-label={`${t('Move down')} ${choice.text}`} disabled={choiceIndex === orderedIds.length - 1} onClick={() => moveChoice(question.id, choiceId, 1)}><ArrowDown size={14} /></button></span>
              </div>;
            })}
          </div> : <div className="participant-choice-list">{question.choices.map((choice, choiceIndex) => {
            const value = question.questionType === 'true_false' ? choice.id === 'true' || choiceIndex === 0 : choice.id;
            const checked = question.questionType === 'true_false' ? selected === value : selected === choice.id;
            return <label className={`participant-choice ${checked ? 'selected' : ''}`} key={choice.id}><input type="radio" name={`participant-quiz-${quiz.id}-question-${question.id}`} checked={checked} onChange={() => choose(question.id, value)} /> <span>{question.questionType === 'true_false' ? t(choice.text) : choice.text}</span></label>;
          })}</div>}
        </fieldset>;
      })}
      {validation && <p className="quiz-form-error" role="alert"><AlertCircle size={14} />{validation}</p>}
      {submit.isError && <p className="quiz-form-error" role="alert"><AlertCircle size={14} />{t('Your answers were not submitted. Try again.')}</p>}
      <div className="participant-quiz-submit-row"><span>{t('You can retake this quiz after you see your result.')}</span><button className="button button-primary" type="button" onClick={doSubmit} disabled={submit.isPending} data-testid={`button-submit-quiz-${quiz.id}`}>{submit.isPending ? t('Submitting…') : <><Check size={14} />{t('Submit answers')}</>}</button></div>
    </div>}
    {latest && open && <div className="quiz-previous-result"><span>{t('Your previous result')}: <b>{latest.score} / {latest.totalQuestions}</b></span><button type="button" className="quiz-action" onClick={() => { setOpen(false); setFeedbackVisible(true); }}>{t('View latest feedback')} <RotateCcw size={13} /></button></div>}
  </article>;
}

export function ParticipantModuleQuizzes({ moduleId }: { moduleId: number }) {
  useAppLanguage();
  const query = useGetParticipantCourseModuleQuizzes(moduleId, { query: { queryKey: getGetParticipantCourseModuleQuizzesQueryKey(moduleId) } });
  if (query.isLoading) return <div className="participant-quizzes-loading" aria-label={t('Loading module quizzes')}><span /><span /></div>;
  if (query.isError) return <div className="quiz-inline-error" role="alert"><AlertCircle size={15} />{t('Module quizzes could not load.')} <button type="button" onClick={() => void query.refetch()}>{t('Retry')}</button></div>;
  const quizzes = query.data?.quizzes || [];
  if (!quizzes.length) return null;
  return <div className="participant-module-quizzes" data-testid={`participant-module-quizzes-${moduleId}`}>{quizzes.map(quiz => <ParticipantQuizCard key={quiz.id} quiz={quiz} />)}</div>;
}
