import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCourseQuizGrade,
  gradeCourseQuizAttempt,
  isValidQuizSubmissionValue,
  shuffleQuizChoices,
  validateCourseQuizQuestions,
  validateLetterGradeScale,
  type GradeableQuestion,
} from "../src/lib/courseQuizGrading";
import type { CourseLetterGradeBand } from "@workspace/db";

const questions: GradeableQuestion[] = [
  {
    id: 1,
    questionType: "multiple_choice",
    prompt: "Which metric best measures retention?",
    choices: [
      { id: "a", text: "Repeat purchase rate" },
      { id: "b", text: "Website visits" },
    ],
    correctAnswer: "a",
    explanation: "Retention tracks whether customers continue using the product.",
  },
  {
    id: 2,
    questionType: "true_false",
    prompt: "A cash-flow forecast tracks expected money in and out.",
    choices: [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ],
    correctAnswer: true,
    explanation: null,
  },
  {
    id: 3,
    questionType: "ordering",
    prompt: "Order the customer discovery steps.",
    choices: [
      { id: "prepare", text: "Prepare questions" },
      { id: "interview", text: "Interview customers" },
      { id: "learn", text: "Summarize what you learned" },
    ],
    correctAnswer: ["prepare", "interview", "learn"],
    explanation: "Prepare first, then interview, then synthesize what you learned.",
  },
];

test("grades multiple-choice, true/false, and ordering answers with feedback", () => {
  const graded = gradeCourseQuizAttempt(questions, new Map([
    [1, "a"],
    [2, true],
    [3, ["prepare", "interview", "learn"]],
  ]));

  assert.equal(graded.score, 3);
  assert.equal(graded.totalQuestions, 3);
  assert.deepEqual(graded.answers.map(({ isCorrect }) => isCorrect), [true, true, true]);
  assert.equal(graded.answers[0].correctAnswer, "Repeat purchase rate");
  assert.match(graded.answers[2].submittedAnswer, /Prepare questions → Interview customers/);
  assert.equal(graded.answers[2].explanation, questions[2].explanation);
});

test("incorrect or malformed answers cannot score as correct", () => {
  const graded = gradeCourseQuizAttempt(questions, new Map([
    [1, "b"],
    [2, false],
    [3, ["interview", "prepare", "learn"]],
  ]));

  assert.equal(graded.score, 0);
  assert.equal(isValidQuizSubmissionValue(questions[0], "unknown-option"), false);
  assert.equal(isValidQuizSubmissionValue(questions[1], "true"), false);
  assert.equal(isValidQuizSubmissionValue(questions[2], ["prepare", "prepare", "learn"]), false);
});

test("ordering answer keys and choice identifiers must be complete and unique", () => {
  const result = validateCourseQuizQuestions([
    {
      questionType: "ordering",
      prompt: "Order these steps",
      choices: [
        { id: "first", text: "First" },
        { id: "second", text: "Second" },
        { id: "third", text: "Third" },
      ],
      correctAnswer: ["first", "second"],
    },
  ]);
  assert.match(result ?? "", /every listed item once/i);
});

test("choice shuffling does not mutate the authored answer order", () => {
  const authored = ["one", "two", "three"];
  const shuffled = shuffleQuizChoices(authored, () => 0);

  assert.deepEqual(shuffled, ["two", "three", "one"]);
  assert.deepEqual(authored, ["one", "two", "three"]);
});

test("formats numerical, percentage, and configurable letter grades", () => {
  const scale: CourseLetterGradeBand[] = [
    { grade: "A", minimumPercent: 90 },
    { grade: "B", minimumPercent: 80 },
    { grade: "C", minimumPercent: 70 },
    { grade: "F", minimumPercent: 0 },
  ];

  assert.equal(formatCourseQuizGrade(3, 4, "numerical", scale), "3/4");
  assert.equal(formatCourseQuizGrade(3, 4, "percentage", scale), "75%");
  assert.equal(formatCourseQuizGrade(9, 10, "letter", scale), "A");
  assert.equal(formatCourseQuizGrade(8, 10, "letter", scale), "B");
  assert.equal(formatCourseQuizGrade(0, 10, "letter", scale), "F");
});

test("letter grade scales require unique thresholds and a zero-percent band", () => {
  assert.equal(validateLetterGradeScale([
    { grade: "Pass", minimumPercent: 50 },
    { grade: "Fail", minimumPercent: 0 },
  ]), null);
  assert.match(validateLetterGradeScale([
    { grade: "A", minimumPercent: 90 },
    { grade: "B", minimumPercent: 90 },
    { grade: "F", minimumPercent: 0 },
  ]) ?? "", /unique/i);
  assert.match(validateLetterGradeScale([
    { grade: "A", minimumPercent: 90 },
    { grade: "B", minimumPercent: 50 },
  ]) ?? "", /0 percent/i);
});
