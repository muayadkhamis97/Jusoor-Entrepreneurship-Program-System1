import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { GetPublicJudgingFormResponse, SubmitPublicJudgingResponseBody, SubmitPublicJudgingResponseResponse } from "@workspace/api-zod";
import { db, judgingFormsTable, judgingResponsesTable, programsTable, type JudgingResponse } from "@workspace/db";
import { JudgingFormError, judgingBusinesses, judgingTokenHash, normalizeJudgingAssessment, validJudgingToken } from "../lib/judgingForms";
import { judgingFormErrors } from "./judgingFormErrors";
import { lockGoogleSheetsProgram, queueGoogleSheetsEvent } from "../lib/googleSheetsSync";

const router = Router();
const limits = new Map<string, { count: number; expires: number }>();
// Bounded, per-process abuse protection; it is not an identity-verification gate.
function rateLimit(key: string, maximum: number, period: number) {
  const now = Date.now();
  const entry = limits.get(key);
  if (entry && entry.expires > now) {
    if (++entry.count > maximum) throw new JudgingFormError(429, "Too many requests. Wait a few minutes and try again.");
  } else limits.set(key, { count: 1, expires: now + period });
  if (limits.size > 10000) {
    for (const [storedKey, value] of limits) if (value.expires <= now) limits.delete(storedKey);
    if (limits.size > 10000) limits.delete(limits.keys().next().value!);
  }
}
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  rateLimit(`ip:${req.ip}`, 1200, 60_000);
  if (!validJudgingToken(req.query.token)) throw new JudgingFormError(404, "This judging link is invalid or unavailable.");
  rateLimit(`${req.ip}:${judgingTokenHash(req.query.token)}`, 1200, 10 * 60_000);
  next();
});
function lookup(token: string) {
  return db.select({ form: judgingFormsTable, programName: programsTable.name }).from(judgingFormsTable)
    .innerJoin(programsTable, eq(programsTable.id, judgingFormsTable.programId))
    .where(and(eq(judgingFormsTable.shareTokenHash, judgingTokenHash(token)), isNull(programsTable.archivedAt))).limit(1);
}
function receipt(row: JudgingResponse) {
  return SubmitPublicJudgingResponseResponse.parse({ received: true, businessName: row.businessName, scoreTotal: row.scoreTotal, maxScore: row.maxScore });
}
router.get("/", async (req, res) => {
  const [row] = await lookup(req.query.token as string);
  if (!row || !row.form.publishedAt) throw new JudgingFormError(404, "This judging link is invalid or unavailable.");
  if (row.form.status !== "open") throw new JudgingFormError(410, "This judging form is not accepting responses.");
  res.json(GetPublicJudgingFormResponse.parse({
    id: row.form.id, title: row.form.title, instructions: row.form.instructions, programName: row.programName,
    criteria: row.form.criteria, questions: row.form.questions, businesses: await judgingBusinesses(row.form, db, true),
  }));
});
router.post("/responses", async (req, res) => {
  const parsed = SubmitPublicJudgingResponseBody.safeParse(req.body);
  if (!parsed.success) throw new JudgingFormError(400, "Provide a valid name and email, scores, required answers and submission identifier.");
  const token = req.query.token as string;
  rateLimit(`${req.ip}:${judgingTokenHash(`${token}:${parsed.data.judgeEmail.trim().toLowerCase()}`)}`, 60, 10 * 60_000);
  const result = await db.transaction(async tx => {
    // Hold a share lock until commit so Close cannot race an accepted submission.
    const [row] = await tx.select({ form: judgingFormsTable }).from(judgingFormsTable)
      .innerJoin(programsTable, eq(programsTable.id, judgingFormsTable.programId))
      .where(and(eq(judgingFormsTable.shareTokenHash, judgingTokenHash(token)), isNull(programsTable.archivedAt)))
      .limit(1).for("share", { of: judgingFormsTable });
    if (!row || !row.form.publishedAt) throw new JudgingFormError(404, "This judging link is invalid or unavailable.");
    const assessment = normalizeJudgingAssessment(row.form, parsed.data);
    const existing = async () => {
      const [previous] = await tx.select().from(judgingResponsesTable).where(and(
        eq(judgingResponsesTable.formId, row.form.id), eq(judgingResponsesTable.clientSubmissionId, parsed.data.clientSubmissionId),
      )).limit(1);
      if (previous && previous.payloadHash !== assessment.payloadHash) throw new JudgingFormError(409, "This submission identifier has already been used for another assessment.");
      return previous;
    };
    const previous = await existing();
    if (previous) return previous; // Safe recovery even if staff closed the form after receipt.
    if (row.form.status !== "open") throw new JudgingFormError(410, "This judging form is not accepting responses.");
    const business = (await judgingBusinesses(row.form, tx, true)).find(business => business.id === parsed.data.businessId);
    if (!business) throw new JudgingFormError(400, "Choose one of the businesses listed on this form.");
    await lockGoogleSheetsProgram(tx, row.form.programId);
    const [created] = await tx.insert(judgingResponsesTable).values({
      ...assessment, formId: row.form.id, businessName: business.name, clientSubmissionId: parsed.data.clientSubmissionId,
    }).onConflictDoNothing().returning();
    const saved = created ?? await existing();
    if (!saved) throw new JudgingFormError(409, "An assessment with this email has already been received for this business.");
    if (created) {
      await queueGoogleSheetsEvent(tx, {
        programId: row.form.programId,
        sourceType: "judging_response",
        sourceId: created.id,
      });
    }
    return saved;
  });
  res.json(receipt(result));
});
router.use(judgingFormErrors);
export default router;
