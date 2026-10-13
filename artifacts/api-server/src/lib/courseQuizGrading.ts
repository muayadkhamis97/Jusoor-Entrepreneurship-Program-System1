import type { QuizAnswerResult, QuizChoice, QuizCorrectAnswer, QuizQuestionType } from "@workspace/db";

export type CourseQuizQuestionWriteInput = {
  questionType: QuizQuestionType;
  prompt: string;
  choices: QuizChoice[];
  correctAnswer: QuizCorrectAnswer;
  explanation?: string | null;
};
export type CourseQuizWriteInput = {
  title: string;
  description: string | null;
  isPublished: boolean;
  questions: CourseQuizQuestionWriteInput[];
};
export type QuizSubmissionValue = string | boolean | string[];

export type GradeableQuestion = {
  id: number;
  questionType: QuizQuestionType;
  prompt: string;
  choices: QuizChoice[];
  correctAnswer: QuizCorrectAnswer;
  explanation: string | null;
};

function uniqueChoiceIds(choices: QuizChoice[]): boolean {
  return new Set(choices.map(({ id }) => id)).size === choices.length;
}

export function validateCourseQuizQuestions(questions: CourseQuizWriteInput["questions"]): string | null {
  for (const question of questions) {
    if (!uniqueChoiceIds(question.choices)) return "Every answer choice must have a unique identifier.";

    if (question.questionType === "multiple_choice") {
      if (typeof question.correctAnswer !== "string" ||
          !question.choices.some(({ id }) => id === question.correctAnswer)) {
        return "Choose one of the listed options as the correct answer.";
      }
    }

    if (question.questionType === "true_false") {
      const ids = question.choices.map(({ id }) => id).sort();
      if (typeof question.correctAnswer !== "boolean" || ids[0] !== "false" || ids[1] !== "true") {
        return "True/false questions must include true and false answer options.";
      }
    }

    if (question.questionType === "ordering") {
      if (!Array.isArray(question.correctAnswer)) {
        return "Choose the correct order for every item.";
      }
      const answer = question.correctAnswer;
      const choiceIds = question.choices.map(({ id }) => id).sort();
      const answerIds = [...answer].sort();
      if (new Set(answer).size !== answer.length ||
          answer.length !== question.choices.length ||
          choiceIds.some((id, index) => id !== answerIds[index])) {
        return "Ordering questions must include every listed item once in the correct order.";
      }
    }
  }
  return null;
}

export function isValidQuizSubmissionValue(
  question: GradeableQuestion,
  answer: unknown,
): answer is QuizSubmissionValue {
  if (question.questionType === "multiple_choice") {
    return typeof answer === "string" && question.choices.some(({ id }) => id === answer);
  }
  if (question.questionType === "true_false") return typeof answer === "boolean";
  if (!Array.isArray(answer) || answer.some((id) => typeof id !== "string")) return false;
  const choiceIds = question.choices.map(({ id }) => id).sort();
  const answerIds = [...answer].sort();
  return answer.length === question.choices.length &&
    new Set(answer).size === answer.length &&
    choiceIds.every((id, index) => id === answerIds[index]);
}

function displayAnswer(question: GradeableQuestion, answer: QuizSubmissionValue): string {
  if (question.questionType === "true_false") {
    const choiceId = answer ? "true" : "false";
    return question.choices.find(({ id }) => id === choiceId)?.text ?? (answer ? "True" : "False");
  }

  if (question.questionType === "multiple_choice") {
    return question.choices.find(({ id }) => id === answer)?.text ?? "";
  }

  return (answer as string[])
    .map((id) => question.choices.find((choice) => choice.id === id)?.text ?? "")
    .join(" → ");
}

function answersMatch(
  question: GradeableQuestion,
  submitted: QuizSubmissionValue,
): boolean {
  if (question.questionType === "multiple_choice") {
    return typeof submitted === "string" &&
      typeof question.correctAnswer === "string" &&
      submitted === question.correctAnswer;
  }
  if (question.questionType === "true_false") {
    return typeof submitted === "boolean" &&
      typeof question.correctAnswer === "boolean" &&
      submitted === question.correctAnswer;
  }
  if (!Array.isArray(submitted) || !Array.isArray(question.correctAnswer)) return false;
  const correctAnswer = question.correctAnswer;
  return submitted.length === correctAnswer.length &&
    submitted.every((id, index) => id === correctAnswer[index]);
}

export function gradeCourseQuizAttempt(
  questions: GradeableQuestion[],
  submitted: Map<number, QuizSubmissionValue>,
): { score: number; totalQuestions: number; answers: QuizAnswerResult[] } {
  const answers = questions.map((question) => {
    const response = submitted.get(question.id);
    if (response === undefined) throw new Error("A submitted answer is missing.");
    let correctAnswer: string;
    if (question.questionType === "ordering") {
      if (!Array.isArray(question.correctAnswer)) throw new Error("Ordering question answer key is invalid.");
      correctAnswer = displayAnswer(question, question.correctAnswer);
    } else if (question.questionType === "true_false") {
      if (typeof question.correctAnswer !== "boolean") throw new Error("True/false question answer key is invalid.");
      correctAnswer = displayAnswer(question, question.correctAnswer);
    } else {
      if (typeof question.correctAnswer !== "string") throw new Error("Multiple-choice answer key is invalid.");
      correctAnswer = displayAnswer(question, question.correctAnswer);
    }
    return {
      questionId: question.id,
      prompt: question.prompt,
      submittedAnswer: displayAnswer(question, response),
      correctAnswer,
      isCorrect: answersMatch(question, response),
      explanation: question.explanation,
    };
  });

  return {
    score: answers.filter(({ isCorrect }) => isCorrect).length,
    totalQuestions: questions.length,
    answers,
  };
}

export function shuffleQuizChoices<T>(choices: T[], random: () => number = Math.random): T[] {
  const shuffled = [...choices];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}
