import React from 'react';
import type { CourseProgressQuiz } from '@workspace/api-client-react';
import { t } from './language';

type AssessmentType = 'pre_course' | 'post_course';

export function calculateAssessmentComparison(quizzes: CourseProgressQuiz[]) {
  const average = (type: AssessmentType): number | null => {
    const percentages = quizzes
      .filter(quiz => quiz.assessmentType === type && quiz.firstScore != null && quiz.firstTotalQuestions > 0)
      .map(quiz => quiz.firstScore! / quiz.firstTotalQuestions * 100);
    return percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
  };
  const pre = average('pre_course');
  const post = average('post_course');
  return { pre, post, delta: pre == null || post == null ? null : post - pre };
}

export function AssessmentComparison({ quizzes, testId }: { quizzes: CourseProgressQuiz[]; testId: string }) {
  const { pre, post, delta } = calculateAssessmentComparison(quizzes);
  const score = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
  return <div className="lp-assessment-comparison" data-testid={testId}>
    <div><span>{t('Pre-course first score')}</span><b data-testid={`${testId}-pre`}>{score(pre)}</b></div>
    <div><span>{t('Post-course first score')}</span><b data-testid={`${testId}-post`}>{score(post)}</b></div>
    <div className={delta == null ? '' : delta > 0 ? 'is-gain' : delta < 0 ? 'is-loss' : ''}>
      <span>{t('Percentage-point change')}</span>
      <b data-testid={`${testId}-change`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${t('pp')}`}</b>
    </div>
  </div>;
}
