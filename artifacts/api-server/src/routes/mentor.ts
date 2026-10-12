import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  GetMentorDashboardResponse,
  UpdateAssignedMentoringBody,
  UpdateAssignedMentoringParams,
  UpdateAssignedMentoringResponse,
} from "@workspace/api-zod";
import { businessesTable, db, programsTable, supportTable } from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const engagements = await db.select({
    id: supportTable.id,
    businessId: supportTable.businessId,
    businessName: businessesTable.businessName,
    founderName: businessesTable.founderName,
    programName: programsTable.name,
    type: supportTable.type,
    provider: supportTable.provider,
    topic: supportTable.topic,
    scheduledDate: supportTable.scheduledDate,
    status: supportTable.status,
    notes: supportTable.notes,
  }).from(supportTable)
    .innerJoin(businessesTable, eq(supportTable.businessId, businessesTable.id))
    .innerJoin(programsTable, eq(businessesTable.programId, programsTable.id))
    .where(eq(supportTable.mentorStaffId, staff.id))
    .orderBy(asc(supportTable.scheduledDate));
  res.json(GetMentorDashboardResponse.parse({
    engagements,
    calendlyBookingUrl: staff.calendlyBookingUrl,
  }));
});

router.patch("/support/:id", async (req, res): Promise<void> => {
  const params = UpdateAssignedMentoringParams.safeParse(req.params);
  const body = UpdateAssignedMentoringBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const [updated] = await db.update(supportTable).set(body.data)
    .where(and(eq(supportTable.id, params.data.id), eq(supportTable.mentorStaffId, staff.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Engagement is not assigned to this mentor." });
    return;
  }
  const [record] = await db.select({
    id: supportTable.id,
    businessId: supportTable.businessId,
    businessName: businessesTable.businessName,
    founderName: businessesTable.founderName,
    programName: programsTable.name,
    type: supportTable.type,
    provider: supportTable.provider,
    topic: supportTable.topic,
    scheduledDate: supportTable.scheduledDate,
    status: supportTable.status,
    notes: supportTable.notes,
  }).from(supportTable)
    .innerJoin(businessesTable, eq(supportTable.businessId, businessesTable.id))
    .innerJoin(programsTable, eq(businessesTable.programId, programsTable.id))
    .where(eq(supportTable.id, updated.id)).limit(1);
  res.json(UpdateAssignedMentoringResponse.parse(record));
});

export default router;
