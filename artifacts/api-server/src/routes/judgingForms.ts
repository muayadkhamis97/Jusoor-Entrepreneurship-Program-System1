import { Router } from "express";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import {
  CreateJudgingFormBody, CreateJudgingFormResponse, GetJudgingFormResponse, ListJudgingFormsResponse,
  ListJudgingFormResponsesQueryParams, ListJudgingFormResponsesResponse, UpdateJudgingFormBody,
  UpdateJudgingFormResponse, UpdateJudgingFormStatusBody, UpdateJudgingFormStatusResponse,
  type JudgingFormInput,
} from "@workspace/api-zod";
import { businessesTable, db, judgingFormBusinessesTable, judgingFormsTable, judgingResponsesTable, programsTable } from "@workspace/db";
import { requireOperationsStaff, type StaffAccess } from "../middlewares/staffAccess";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import {
  JudgingFormError, judgingBusinesses, judgingResponseCount, newJudgingToken, normalizeJudgingDefinition,
  readJudgingToken, staffJudgingForm, type JudgingExecutor,
} from "../lib/judgingForms";
import { judgingFormErrors } from "./judgingFormErrors";

const router = Router();
router.use(requireOperationsStaff);
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
async function selectedBusinesses(input: JudgingFormInput, executor: JudgingExecutor) {
  const rows = await executor.select({ id: businessesTable.id, name: businessesTable.businessName }).from(businessesTable)
    .where(and(eq(businessesTable.programId, input.programId), inArray(businessesTable.id, input.businessIds)));
  if (rows.length !== input.businessIds.length) throw new JudgingFormError(400, "Select businesses from this program only.");
  return rows;
}
async function detail(staff: StaffAccess, formId: number) {
  const { form, programName } = await staffJudgingForm(staff, formId);
  const [count] = await db.select({ count: judgingResponseCount }).from(judgingFormsTable).where(eq(judgingFormsTable.id, form.id));
  return { id: form.id, programId: form.programId, programName, title: form.title, status: form.status,
    responseCount: Number(count?.count ?? 0), publishedAt: form.publishedAt, instructions: form.instructions,
    criteria: form.criteria, questions: form.questions, businesses: await judgingBusinesses(form),
    shareToken: form.publishedAt ? readJudgingToken(form.shareTokenEnc) : null };
}
router.get("/", async (_req, res) => {
  const ids = await activeProgramIdsFor(res.locals.staff as StaffAccess);
  const rows = await db.select({
    id: judgingFormsTable.id, programId: judgingFormsTable.programId, programName: programsTable.name,
    title: judgingFormsTable.title, status: judgingFormsTable.status, publishedAt: judgingFormsTable.publishedAt,
    responseCount: judgingResponseCount,
  }).from(judgingFormsTable).innerJoin(programsTable, eq(programsTable.id, judgingFormsTable.programId))
    .where(inArray(judgingFormsTable.programId, ids)).orderBy(desc(judgingFormsTable.id));
  res.json(ListJudgingFormsResponse.parse(rows));
});
router.post("/", async (req, res) => {
  const parsed = CreateJudgingFormBody.safeParse(req.body);
  if (!parsed.success) throw new JudgingFormError(400, "Check the title, selected businesses, scoring criteria and written questions.");
  const input = normalizeJudgingDefinition(parsed.data);
  const staff = res.locals.staff as StaffAccess;
  if (!await canAccessActiveProgram(staff, input.programId)) throw new JudgingFormError(403, "Choose an active program assigned to your account.");
  const token = newJudgingToken();
  const id = await db.transaction(async tx => {
    const businesses = await selectedBusinesses(input, tx);
    const [form] = await tx.insert(judgingFormsTable).values({
      programId: input.programId, title: input.title, instructions: input.instructions,
      criteria: input.criteria, questions: input.questions, shareTokenHash: token.hash, shareTokenEnc: token.encrypted, createdByStaffId: staff.id,
    }).returning({ id: judgingFormsTable.id });
    await tx.insert(judgingFormBusinessesTable).values(businesses.map(business => ({ formId: form.id, businessId: business.id, businessName: business.name })));
    return form.id;
  });
  res.status(201).json(CreateJudgingFormResponse.parse(await detail(staff, id)));
});
router.get("/:formId", async (req, res) => {
  res.json(GetJudgingFormResponse.parse(await detail(res.locals.staff as StaffAccess, Number(req.params.formId))));
});
router.patch("/:formId", async (req, res) => {
  const parsed = UpdateJudgingFormBody.safeParse(req.body);
  if (!parsed.success) throw new JudgingFormError(400, "Check the title, selected businesses, scoring criteria and written questions.");
  const input = normalizeJudgingDefinition(parsed.data);
  const staff = res.locals.staff as StaffAccess;
  const id = Number(req.params.formId);
  await db.transaction(async tx => {
    const { form } = await staffJudgingForm(staff, id, tx, true);
    if (form.publishedAt || form.status !== "draft") throw new JudgingFormError(409, "Published form questions, scoring rules and businesses cannot be changed.");
    if (input.programId !== form.programId) throw new JudgingFormError(400, "The program cannot be changed after a form is created.");
    const businesses = await selectedBusinesses(input, tx);
    await tx.update(judgingFormsTable).set({ title: input.title, instructions: input.instructions, criteria: input.criteria, questions: input.questions, updatedAt: new Date() })
      .where(eq(judgingFormsTable.id, id));
    await tx.delete(judgingFormBusinessesTable).where(eq(judgingFormBusinessesTable.formId, id));
    await tx.insert(judgingFormBusinessesTable).values(businesses.map(business => ({ formId: id, businessId: business.id, businessName: business.name })));
  });
  res.json(UpdateJudgingFormResponse.parse(await detail(staff, id)));
});
router.patch("/:formId/status", async (req, res) => {
  const parsed = UpdateJudgingFormStatusBody.safeParse(req.body);
  if (!parsed.success) throw new JudgingFormError(400, "Choose whether submissions are open or closed.");
  const staff = res.locals.staff as StaffAccess;
  const id = Number(req.params.formId);
  await db.transaction(async tx => {
    const { form } = await staffJudgingForm(staff, id, tx, true);
    if (parsed.data.status === "closed" && !form.publishedAt) throw new JudgingFormError(409, "Open the draft before closing submissions.");
    if (parsed.data.status === "open") {
      const businesses = await judgingBusinesses(form, tx, true);
      if (!businesses.length) throw new JudgingFormError(400, "No selected businesses remain in this program.");
    }
    await tx.update(judgingFormsTable).set({
      status: parsed.data.status, publishedAt: form.publishedAt ?? new Date(), updatedAt: new Date(),
    }).where(eq(judgingFormsTable.id, id));
  });
  res.json(UpdateJudgingFormStatusResponse.parse(await detail(staff, id)));
});
router.get("/:formId/responses", async (req, res) => {
  const { form } = await staffJudgingForm(res.locals.staff as StaffAccess, Number(req.params.formId));
  const params = ListJudgingFormResponsesQueryParams.safeParse(req.query);
  if (!params.success || (params.data.beforeId !== undefined && !Number.isSafeInteger(params.data.beforeId))) throw new JudgingFormError(400, "Invalid response cursor.");
  const rows = await db.select({
    id: judgingResponsesTable.id, businessId: judgingResponsesTable.businessId, businessName: judgingResponsesTable.businessName,
    judgeName: judgingResponsesTable.judgeName, judgeEmail: judgingResponsesTable.judgeEmail,
    scores: judgingResponsesTable.scores, answers: judgingResponsesTable.answers,
    scoreTotal: judgingResponsesTable.scoreTotal, maxScore: judgingResponsesTable.maxScore, submittedAt: judgingResponsesTable.submittedAt,
  }).from(judgingResponsesTable)
    .where(and(eq(judgingResponsesTable.formId, form.id), params.data.beforeId ? lt(judgingResponsesTable.id, params.data.beforeId) : undefined))
    .orderBy(desc(judgingResponsesTable.id)).limit(51);
  const responses = rows.slice(0, 50);
  res.json(ListJudgingFormResponsesResponse.parse({ responses, nextBeforeId: rows.length > 50 ? responses.at(-1)!.id : null }));
});
router.use(judgingFormErrors);
export default router;
