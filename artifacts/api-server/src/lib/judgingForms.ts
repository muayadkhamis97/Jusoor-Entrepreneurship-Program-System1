import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { JudgingFormInput, JudgingResponseInput } from "@workspace/api-zod";
import {
  businessesTable, db, judgingFormBusinessesTable, judgingFormsTable, programsTable,
  type JudgingForm,
} from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import { activeProgramIdsFor } from "./programScope";

export class JudgingFormError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type JudgingExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export const judgingTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new JudgingFormError(503, "Judging share links are not configured.");
  return createHash("sha256").update(secret).update(":program-judging-share-token").digest();
}
export function newJudgingToken() {
  const token = randomBytes(32).toString("base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from("program-judging-share-token"));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { hash: judgingTokenHash(token), encrypted: [iv, cipher.getAuthTag(), encrypted].map(value => value.toString("base64url")).join(".") };
}
export function readJudgingToken(encrypted: string): string | null {
  try {
    const [iv, tag, value] = encrypted.split(".");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"), { authTagLength: 16 });
    decipher.setAAD(Buffer.from("program-judging-share-token"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const token = Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8");
    return validJudgingToken(token) ? token : null;
  } catch { return null; }
}
export function validJudgingToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function normalizeJudgingDefinition(input: JudgingFormInput): JudgingFormInput {
  const normalized = {
    ...input, title: input.title.trim(), instructions: input.instructions.trim(),
    criteria: input.criteria.map(criterion => ({ ...criterion, id: criterion.id.toLowerCase(), label: criterion.label.trim(), description: criterion.description.trim() })),
    questions: input.questions.map(question => ({ ...question, id: question.id.toLowerCase(), label: question.label.trim() })),
  };
  const ids = [...normalized.criteria, ...normalized.questions].map(field => field.id);
  if (!normalized.title || (!ids.length) || new Set(ids).size !== ids.length
    || normalized.criteria.some(field => !field.label || !Number.isInteger(field.maxScore))
    || normalized.questions.some(field => !field.label)
    || normalized.businessIds.some(id => !Number.isSafeInteger(id))
    || new Set(normalized.businessIds).size !== normalized.businessIds.length) {
    throw new JudgingFormError(400, "Use a title, unique fields, valid scoring limits and at least one criterion or written question.");
  }
  return normalized;
}
export function normalizeJudgingAssessment(form: JudgingForm, input: JudgingResponseInput) {
  const judgeName = input.judgeName.trim();
  const judgeEmail = input.judgeEmail.trim().toLowerCase();
  const scoreMap = new Map(input.scores.map(score => [score.criterionId, score.score]));
  const answerMap = new Map(input.answers.map(answer => [answer.questionId, answer.text.trim()]));
  if (!judgeName || scoreMap.size !== input.scores.length || answerMap.size !== input.answers.length
    || scoreMap.size !== form.criteria.length
    || input.scores.some(score => !form.criteria.some(criterion => criterion.id === score.criterionId))
    || input.answers.some(answer => !form.questions.some(question => question.id === answer.questionId))) {
    throw new JudgingFormError(400, "Provide your name and email and complete the form's current scoring fields.");
  }
  const scores = form.criteria.map(criterion => {
    const score = scoreMap.get(criterion.id);
    if (score === undefined || !Number.isFinite(score) || score < 0 || score > criterion.maxScore) {
      throw new JudgingFormError(400, "Every score must be within the displayed scoring range.");
    }
    return { criterionId: criterion.id, score };
  });
  const answers = form.questions.map(question => {
    const text = answerMap.get(question.id) ?? "";
    if (question.required && !text) throw new JudgingFormError(400, "Complete every required written question.");
    return { questionId: question.id, text };
  });
  const normalized = { businessId: input.businessId, judgeName, judgeEmail, scores, answers };
  return {
    ...normalized,
    scoreTotal: Math.round(scores.reduce((sum, value) => sum + value.score, 0) * 100) / 100,
    maxScore: form.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0),
    payloadHash: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
  };
}
export async function staffJudgingForm(staff: StaffAccess, formId: number, executor: JudgingExecutor = db, lock = false) {
  if (!Number.isSafeInteger(formId) || formId < 1) throw new JudgingFormError(404, "Judging form not found.");
  const ids = await activeProgramIdsFor(staff);
  const query = executor.select({ form: judgingFormsTable, programName: programsTable.name }).from(judgingFormsTable)
    .innerJoin(programsTable, eq(programsTable.id, judgingFormsTable.programId))
    .where(and(eq(judgingFormsTable.id, formId), inArray(judgingFormsTable.programId, ids), isNull(programsTable.archivedAt))).limit(1);
  const [row] = lock ? await query.for("update", { of: judgingFormsTable }) : await query;
  if (!row) throw new JudgingFormError(404, "Judging form not found.");
  return row;
}
export async function judgingBusinesses(form: JudgingForm, executor: JudgingExecutor = db, liveOnly = false) {
  return executor.select({ id: judgingFormBusinessesTable.businessId, name: judgingFormBusinessesTable.businessName })
    .from(judgingFormBusinessesTable)
    .innerJoin(businessesTable, eq(businessesTable.id, judgingFormBusinessesTable.businessId))
    .where(and(eq(judgingFormBusinessesTable.formId, form.id), liveOnly ? eq(businessesTable.programId, form.programId) : undefined))
    .orderBy(asc(judgingFormBusinessesTable.businessName));
}
export const judgingResponseCount = sql<number>`(select count(*)::integer from program_judging_responses r where r.form_id = "program_judging_forms"."id")`;
