import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CourseProgressQuiz } from '@workspace/api-client-react';
import { AssessmentComparison, calculateAssessmentComparison } from './assessment-comparison';

function quiz(
  quizId: number,
  assessmentType: CourseProgressQuiz['assessmentType'],
  firstScore: number | null,
  totalQuestions = 10,
  latestScore: number | null = firstScore,
): CourseProgressQuiz {
  return {
    quizId,
    title: `Assessment ${quizId}`,
    assessmentType,
    gradingFormat: 'numerical',
    letterGradeScale: [],
    attempts: latestScore === firstScore ? 1 : 2,
    bestScore: latestScore,
    totalQuestions,
    firstScore,
    latestScore,
    firstSubmittedAt: firstScore == null ? null : '2026-10-01T12:00:00.000Z',
    latestSubmittedAt: latestScore == null ? null : '2026-10-05T12:00:00.000Z',
  };
}

test('participant and coordinator comparisons average first-attempt percentages and show percentage-point change', () => {
  const quizzes = [
    quiz(1, 'pre_course', 4, 10, 10),
    quiz(2, 'pre_course', 8, 10, 0),
    quiz(3, 'post_course', 7, 10, 0),
    quiz(4, 'post_course', 9, 10, 10),
  ];

  assert.deepEqual(calculateAssessmentComparison(quizzes), { pre: 60, post: 80, delta: 20 });

  for (const testId of ['assessment-comparison-participant-9', 'assessment-comparison-coordinator-101']) {
    const markup = renderToStaticMarkup(<AssessmentComparison quizzes={quizzes} testId={testId} />);
    assert.match(markup, new RegExp(`data-testid="${testId}-pre">60\\.0%`));
    assert.match(markup, new RegExp(`data-testid="${testId}-post">80\\.0%`));
    assert.match(markup, new RegExp(`data-testid="${testId}-change">\\+20\\.0 pp`));
    assert.match(markup, /class="is-gain"/);
  }
});

test('missing pre- or post-course first attempts stay unavailable and never become a false gain', () => {
  const postOnly = [quiz(1, 'post_course', 0)];
  assert.deepEqual(calculateAssessmentComparison(postOnly), { pre: null, post: 0, delta: null });

  for (const testId of ['assessment-comparison-participant-9', 'assessment-comparison-coordinator-101']) {
    const markup = renderToStaticMarkup(<AssessmentComparison quizzes={postOnly} testId={testId} />);
    assert.match(markup, new RegExp(`data-testid="${testId}-pre">—`));
    assert.match(markup, new RegExp(`data-testid="${testId}-post">0\\.0%`));
    assert.match(markup, new RegExp(`data-testid="${testId}-change">—`));
    assert.doesNotMatch(markup, /is-gain|is-loss|\\+\\d/);
  }

  assert.deepEqual(calculateAssessmentComparison([quiz(2, 'pre_course', 5)]), {
    pre: 50,
    post: null,
    delta: null,
  });
});

test('assessments with no valid first-attempt percentage are excluded from the average', () => {
  const quizzes = [
    quiz(1, 'pre_course', 0),
    quiz(2, 'pre_course', null),
    quiz(3, 'pre_course', 10, 0),
    quiz(4, 'post_course', 5),
  ];

  assert.deepEqual(calculateAssessmentComparison(quizzes), { pre: 0, post: 50, delta: 50 });
});
