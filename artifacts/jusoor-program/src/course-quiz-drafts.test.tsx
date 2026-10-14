import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearCourseQuizDraft,
  courseQuizDraftStorageKey,
  readCourseQuizDraft,
  writeCourseQuizDraft,
} from './course-quiz-drafts';

function makeStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)); },
    removeItem: key => { entries.delete(key); },
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  };
}

const initialDraft = {
  title: '',
  description: '',
  language: 'en',
  isPublished: false,
  assessmentType: 'knowledge_check',
  gradingFormat: 'numerical',
  letterGradeScale: [{ grade: 'A', minimumPercent: 90 }],
  questions: [{
    key: 'q1',
    questionType: 'multiple_choice',
    prompt: 'Initial prompt',
    choices: [{ id: 'a', text: 'First choice' }, { id: 'b', text: 'Second choice' }],
    correctAnswer: 'a',
    explanation: '',
  }],
};

test('quiz drafts persist and remain isolated by module and quiz', () => {
  const storage = makeStorage();
  const moduleOneQuizDraft = { ...initialDraft, title: 'Module one edit' };
  const moduleTwoQuizDraft = { ...initialDraft, title: 'Module two edit' };
  const firstKey = courseQuizDraftStorageKey(1, 10);
  const secondKey = courseQuizDraftStorageKey(2, 10);

  writeCourseQuizDraft(firstKey, moduleOneQuizDraft, storage);
  writeCourseQuizDraft(secondKey, moduleTwoQuizDraft, storage);

  assert.deepEqual(readCourseQuizDraft(firstKey, initialDraft, storage), moduleOneQuizDraft);
  assert.deepEqual(readCourseQuizDraft(secondKey, initialDraft, storage), moduleTwoQuizDraft);
  assert.notEqual(firstKey, secondKey);
  assert.notEqual(courseQuizDraftStorageKey(1), courseQuizDraftStorageKey(2));
});

test('clearing a saved or discarded draft leaves other quiz drafts untouched', () => {
  const storage = makeStorage();
  const firstKey = courseQuizDraftStorageKey(3, 20);
  const secondKey = courseQuizDraftStorageKey(3, 21);
  const savedDraft = { ...initialDraft, title: 'Unsaved' };

  writeCourseQuizDraft(firstKey, savedDraft, storage);
  writeCourseQuizDraft(secondKey, { ...savedDraft, title: 'Other quiz' }, storage);
  clearCourseQuizDraft(firstKey, storage);

  assert.deepEqual(readCourseQuizDraft(firstKey, initialDraft, storage), initialDraft);
  assert.equal(readCourseQuizDraft(secondKey, initialDraft, storage).title, 'Other quiz');
});

test('malformed drafts fall back to the current quiz data', () => {
  const storage = makeStorage();
  const key = courseQuizDraftStorageKey(4, 30);
  storage.setItem(key, JSON.stringify({
    ...initialDraft,
    questions: [{ key: 'q1', prompt: 'Broken question', choices: null }],
  }));

  assert.deepEqual(readCourseQuizDraft(key, initialDraft, storage), initialDraft);
});

test('storage failures do not prevent the quiz editor from opening or closing', () => {
  const failingStorage: Storage = {
    ...makeStorage(),
    getItem: () => { throw new Error('Storage unavailable'); },
    setItem: () => { throw new Error('Storage unavailable'); },
    removeItem: () => { throw new Error('Storage unavailable'); },
  };

  assert.deepEqual(readCourseQuizDraft('key', initialDraft, failingStorage), initialDraft);
  assert.doesNotThrow(() => writeCourseQuizDraft('key', initialDraft, failingStorage));
  assert.doesNotThrow(() => clearCourseQuizDraft('key', failingStorage));
});
