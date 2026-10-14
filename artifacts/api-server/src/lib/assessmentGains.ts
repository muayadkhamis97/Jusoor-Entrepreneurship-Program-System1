export type AssessmentScoreInput = {
  quizId: number;
  assessmentType: string;
};

export type AssessmentAttemptInput = {
  id: number;
  quizId: number;
  score: number;
  totalQuestions: number;
  submittedAt: Date;
};

export type AssessmentParticipantInput = {
  quizzes: AssessmentScoreInput[];
  attempts: AssessmentAttemptInput[];
};

export type AssessmentApplicationIdentity = {
  id: number;
  businessId: number | null;
  clerkUserId: string | null;
};

export type AssessmentAttemptIdentity = {
  applicationId: number | null;
  participantBusinessId: number | null;
  participantClerkUserId: string;
};

export type CohortAssessmentGain = {
  eligibleParticipants: number;
  participantsWithPre: number;
  participantsWithPost: number;
  pairedParticipants: number;
  preAveragePercent: number | null;
  postAveragePercent: number | null;
  averageGainPercentagePoints: number | null;
};

export function assessmentAttemptBelongsToApplication(
  attempt: AssessmentAttemptIdentity,
  application: AssessmentApplicationIdentity,
  acceptedApplicationCountForUser = 1,
): boolean {
  if (attempt.applicationId !== null) return attempt.applicationId === application.id;
  if (!application.clerkUserId || attempt.participantClerkUserId !== application.clerkUserId) return false;
  if (attempt.participantBusinessId !== null) {
    return attempt.participantBusinessId === application.businessId;
  }
  return acceptedApplicationCountForUser === 1;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function calculateCohortAssessmentGain(
  participants: AssessmentParticipantInput[],
): CohortAssessmentGain {
  const scores = participants.map(({ quizzes, attempts }) => {
    const typeByQuiz = new Map(quizzes.map((quiz) => [quiz.quizId, quiz.assessmentType]));
    const firstAttemptByQuiz = new Map<number, AssessmentAttemptInput>();
    for (const attempt of [...attempts].sort((left, right) =>
      left.submittedAt.getTime() - right.submittedAt.getTime() || left.id - right.id)) {
      if (!firstAttemptByQuiz.has(attempt.quizId)) firstAttemptByQuiz.set(attempt.quizId, attempt);
    }

    const pre: number[] = [];
    const post: number[] = [];
    for (const [quizId, assessmentType] of typeByQuiz) {
      if (assessmentType !== "pre_course" && assessmentType !== "post_course") continue;
      const attempt = firstAttemptByQuiz.get(quizId);
      if (!attempt || attempt.totalQuestions <= 0) continue;
      const percent = attempt.score / attempt.totalQuestions * 100;
      if (!Number.isFinite(percent)) continue;
      (assessmentType === "pre_course" ? pre : post).push(percent);
    }

    return { pre: mean(pre), post: mean(post) };
  });

  const paired = scores.filter((score): score is { pre: number; post: number } =>
    score.pre !== null && score.post !== null);
  const preAveragePercent = mean(paired.map((score) => score.pre));
  const postAveragePercent = mean(paired.map((score) => score.post));

  return {
    eligibleParticipants: participants.length,
    participantsWithPre: scores.filter((score) => score.pre !== null).length,
    participantsWithPost: scores.filter((score) => score.post !== null).length,
    pairedParticipants: paired.length,
    preAveragePercent,
    postAveragePercent,
    averageGainPercentagePoints: mean(paired.map((score) => score.post - score.pre)),
  };
}
