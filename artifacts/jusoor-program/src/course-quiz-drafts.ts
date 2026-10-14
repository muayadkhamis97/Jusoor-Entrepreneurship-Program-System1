export type CourseQuizDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function courseQuizDraftStorageKey(moduleId: number, quizId?: number): string {
  return `jusoor:course-quiz-draft:v1:module-${moduleId}:quiz-${quizId ?? 'new'}`;
}

function isStoredDraft<T>(value: unknown, fallback: T): value is T {
  if (!value || typeof value !== 'object' || !fallback || typeof fallback !== 'object') return false;
  const draft = value as Record<string, unknown>;
  const gradeBands = draft.letterGradeScale;
  const questions = draft.questions;
  return typeof draft.title === 'string'
    && typeof draft.description === 'string'
    && (draft.language === 'en' || draft.language === 'ar')
    && typeof draft.isPublished === 'boolean'
    && ['knowledge_check', 'pre_course', 'post_course'].includes(String(draft.assessmentType))
    && ['numerical', 'percentage', 'letter'].includes(String(draft.gradingFormat))
    && Array.isArray(gradeBands)
    && gradeBands.every(band => !!band && typeof band === 'object'
      && typeof band.grade === 'string'
      && typeof band.minimumPercent === 'number')
    && Array.isArray(questions)
    && questions.every(question => !!question && typeof question === 'object'
      && typeof question.key === 'string'
      && typeof question.prompt === 'string'
      && ['multiple_choice', 'true_false', 'ordering'].includes(String(question.questionType))
      && Array.isArray(question.choices)
      && question.choices.every((choice: unknown) => !!choice && typeof choice === 'object'
        && typeof (choice as Record<string, unknown>).id === 'string'
        && typeof (choice as Record<string, unknown>).text === 'string')
      && (typeof question.correctAnswer === 'string'
        || typeof question.correctAnswer === 'boolean'
        || Array.isArray(question.correctAnswer))
      && (typeof question.explanation === 'string' || question.explanation === null));
}

export function readCourseQuizDraft<T>(
  key: string,
  fallback: T,
  storage?: CourseQuizDraftStorage,
): T {
  try {
    const storedValue = (storage ?? window.localStorage).getItem(key);
    if (!storedValue) return fallback;
    const parsed: unknown = JSON.parse(storedValue);
    return isStoredDraft(parsed, fallback) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeCourseQuizDraft(
  key: string,
  draft: unknown,
  storage?: CourseQuizDraftStorage,
): void {
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(draft));
  } catch {
    // Keep editing usable when browser storage is unavailable or full.
  }
}

export function clearCourseQuizDraft(key: string, storage?: CourseQuizDraftStorage): void {
  try {
    (storage ?? window.localStorage).removeItem(key);
  } catch {
    // Closing or saving the editor should still work when storage is unavailable.
  }
}
