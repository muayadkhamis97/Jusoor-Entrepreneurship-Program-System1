import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  GetJudgeDashboardResponse,
  SubmitJudgeScorecardBody,
  SubmitJudgeScorecardParams,
  SubmitJudgeScorecardResponse,
} from "@workspace/api-zod";
import { businessesTable, db, pitchJudgesTable, pitchesTable } from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const pitches = await db.select({
    assignmentId: pitchJudgesTable.id,
    pitchId: pitchesTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    industry: businessesTable.industry,
    eventType: pitchesTable.eventType,
    eventDate: pitchesTable.eventDate,
    score: pitchJudgesTable.score,
    feedback: pitchJudgesTable.feedback,
    submittedAt: pitchJudgesTable.submittedAt,
  }).from(pitchJudgesTable)
    .innerJoin(pitchesTable, eq(pitchJudgesTable.pitchId, pitchesTable.id))
    .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
    .where(eq(pitchJudgesTable.judgeStaffId, staff.id))
    .orderBy(desc(pitchesTable.eventDate));
  res.json(GetJudgeDashboardResponse.parse({ pitches }));
});

router.patch("/scorecards/:id", async (req, res): Promise<void> => {
  const params = SubmitJudgeScorecardParams.safeParse(req.params);
  const body = SubmitJudgeScorecardBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const [updated] = await db.update(pitchJudgesTable).set({
    ...body.data,
    submittedAt: new Date(),
  }).where(and(
    eq(pitchJudgesTable.id, params.data.id),
    eq(pitchJudgesTable.judgeStaffId, staff.id),
  )).returning();
  if (!updated) {
    res.status(404).json({ error: "This pitch is not assigned to you." });
    return;
  }
  const [pitch] = await db.select({
    assignmentId: pitchJudgesTable.id,
    pitchId: pitchesTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    industry: businessesTable.industry,
    eventType: pitchesTable.eventType,
    eventDate: pitchesTable.eventDate,
    score: pitchJudgesTable.score,
    feedback: pitchJudgesTable.feedback,
    submittedAt: pitchJudgesTable.submittedAt,
  }).from(pitchJudgesTable)
    .innerJoin(pitchesTable, eq(pitchJudgesTable.pitchId, pitchesTable.id))
    .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
    .where(eq(pitchJudgesTable.id, updated.id)).limit(1);
  res.json(SubmitJudgeScorecardResponse.parse(pitch));
});

export default router;
