import assert from "node:assert/strict";
import test from "node:test";
import {
  assessmentAttemptBelongsToApplication,
  calculateCohortAssessmentGain,
} from "../src/lib/assessmentGains";

const quizzes = [
  { quizId: 1, assessmentType: "pre_course" },
  { quizId: 2, assessmentType: "pre_course" },
  { quizId: 3, assessmentType: "post_course" },
];
const submittedAt = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`);

test("cohort gain uses first attempts and averages only participants with both assessment types", () => {
  const comparison = calculateCohortAssessmentGain([
    {
      quizzes,
      attempts: [
        { id: 1, quizId: 1, score: 4, totalQuestions: 10, submittedAt: submittedAt(1) },
        { id: 2, quizId: 1, score: 10, totalQuestions: 10, submittedAt: submittedAt(2) },
        { id: 3, quizId: 2, score: 8, totalQuestions: 10, submittedAt: submittedAt(3) },
        { id: 4, quizId: 3, score: 7, totalQuestions: 10, submittedAt: submittedAt(4) },
      ],
    },
    {
      quizzes,
      attempts: [
        { id: 5, quizId: 1, score: 0, totalQuestions: 10, submittedAt: submittedAt(1) },
        { id: 6, quizId: 3, score: 4, totalQuestions: 10, submittedAt: submittedAt(2) },
      ],
    },
    {
      quizzes,
      attempts: [
        { id: 7, quizId: 1, score: 10, totalQuestions: 10, submittedAt: submittedAt(1) },
      ],
    },
    {
      quizzes,
      attempts: [
        { id: 8, quizId: 3, score: 0, totalQuestions: 10, submittedAt: submittedAt(1) },
      ],
    },
    { quizzes, attempts: [] },
  ]);

  assert.deepEqual(comparison, {
    eligibleParticipants: 5,
    participantsWithPre: 3,
    participantsWithPost: 3,
    pairedParticipants: 2,
    preAveragePercent: 30,
    postAveragePercent: 55,
    averageGainPercentagePoints: 25,
  });
});

test("missing assessment results remain unavailable rather than becoming zero scores", () => {
  const comparison = calculateCohortAssessmentGain([
    {
      quizzes,
      attempts: [{ id: 1, quizId: 1, score: 0, totalQuestions: 10, submittedAt: submittedAt(1) }],
    },
    { quizzes, attempts: [] },
  ]);

  assert.deepEqual(comparison, {
    eligibleParticipants: 2,
    participantsWithPre: 1,
    participantsWithPost: 0,
    pairedParticipants: 0,
    preAveragePercent: null,
    postAveragePercent: null,
    averageGainPercentagePoints: null,
  });
});

test("assessment attempts are matched to their application before grouping a cohort", () => {
  const application = { id: 101, businessId: 201, clerkUserId: "founder-a" };

  assert.equal(assessmentAttemptBelongsToApplication({
    applicationId: 101,
    participantBusinessId: 201,
    participantClerkUserId: "founder-a",
  }, application), true);
  assert.equal(assessmentAttemptBelongsToApplication({
    applicationId: 102,
    participantBusinessId: 201,
    participantClerkUserId: "founder-a",
  }, application), false);
  assert.equal(assessmentAttemptBelongsToApplication({
    applicationId: null,
    participantBusinessId: 201,
    participantClerkUserId: "founder-a",
  }, application), true);
  assert.equal(assessmentAttemptBelongsToApplication({
    applicationId: null,
    participantBusinessId: 202,
    participantClerkUserId: "founder-a",
  }, application), false);
  assert.equal(assessmentAttemptBelongsToApplication({
    applicationId: null,
    participantBusinessId: null,
    participantClerkUserId: "founder-a",
  }, application, 2), false);
  assert.equal(assessmentAttemptBelongsToApplication({
    applicationId: null,
    participantBusinessId: 201,
    participantClerkUserId: "founder-b",
  }, application), false);
});
