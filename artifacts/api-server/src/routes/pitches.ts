import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  AssignPitchJudgeBody,
  AssignPitchJudgeParams,
  AssignPitchJudgeResponse,
  CreatePitchBody,
  CreatePitchResponse,
  DeletePitchParams,
  ListPitchJudgesParams,
  ListPitchJudgesResponse,
  ListPitchesQueryParams,
  ListPitchesResponse,
  RemovePitchJudgeParams,
  UpdatePitchBody,
  UpdatePitchParams,
  UpdatePitchResponse,
} from "@workspace/api-zod";
import { businessesTable, db, grantReceiptsTable, pitchJudgesTable, pitchesTable, staffMembersTable } from "@workspace/db";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";
import { cents, totalGrantReceived } from "../lib/grant-ledger";
import { activeProgramIdsFor } from "../lib/programScope";

const router: IRouter = Router();

router.get("/pitches/:id/judges", requireCoordinator, async (req, res): Promise<void> => {
  const params = ListPitchJudgesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const assignments = await db.select({
    id: pitchJudgesTable.id,
    pitchId: pitchJudgesTable.pitchId,
    judgeStaffId: pitchJudgesTable.judgeStaffId,
    judgeEmail: staffMembersTable.email,
    judgeName: staffMembersTable.email,
    score: pitchJudgesTable.score,
    feedback: pitchJudgesTable.feedback,
    submittedAt: pitchJudgesTable.submittedAt,
  }).from(pitchJudgesTable)
    .innerJoin(staffMembersTable, eq(pitchJudgesTable.judgeStaffId, staffMembersTable.id))
    .where(eq(pitchJudgesTable.pitchId, params.data.id));
  res.json(ListPitchJudgesResponse.parse(assignments));
});

router.post("/pitches/:id/judges", requireCoordinator, async (req, res): Promise<void> => {
  const params = AssignPitchJudgeParams.safeParse(req.params);
  const body = AssignPitchJudgeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [pitch] = await db.select({ id: pitchesTable.id }).from(pitchesTable)
    .where(eq(pitchesTable.id, params.data.id)).limit(1);
  if (!pitch) {
    res.status(404).json({ error: "Pitch event not found." });
    return;
  }
  const [judge] = await db.select().from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, body.data.judgeStaffId),
      eq(staffMembersTable.role, "judge"),
    )).limit(1);
  if (!judge) {
    res.status(400).json({ error: "Select an account with the Judge role." });
    return;
  }
  const [assignment] = await db.insert(pitchJudgesTable)
    .values({ pitchId: pitch.id, judgeStaffId: judge.id })
    .onConflictDoNothing()
    .returning();
  if (!assignment) {
    res.status(409).json({ error: "This judge is already assigned to the event." });
    return;
  }
  res.status(201).json(AssignPitchJudgeResponse.parse({
    ...assignment,
    judgeEmail: judge.email,
    judgeName: judge.email,
  }));
});

router.delete("/pitch-judge-assignments/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = RemovePitchJudgeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [assignment] = await db.select().from(pitchJudgesTable)
    .where(eq(pitchJudgesTable.id, params.data.id)).limit(1);
  if (!assignment) {
    res.status(404).json({ error: "Judge assignment not found." });
    return;
  }
  if (assignment.submittedAt) {
    res.status(409).json({ error: "Submitted scorecards cannot be removed." });
    return;
  }
  await db.delete(pitchJudgesTable).where(eq(pitchJudgesTable.id, assignment.id));
  res.sendStatus(204);
});

router.get("/pitches", async (req, res): Promise<void> => {
  const query = ListPitchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const activeProgramIds = await activeProgramIdsFor(staff);
  if (activeProgramIds.length === 0) {
    res.json([]);
    return;
  }
  const scopedBusinesses = await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(inArray(businessesTable.programId, activeProgramIds));
  const businessIds = scopedBusinesses.map(({ id }) => id);
  if (businessIds.length === 0) {
    res.json([]);
    return;
  }
  const filters = [];
  filters.push(inArray(pitchesTable.businessId, businessIds));
  if (query.data.businessId !== undefined) filters.push(eq(pitchesTable.businessId, query.data.businessId));
  if (query.data.eventType) filters.push(eq(pitchesTable.eventType, query.data.eventType));
  const records = await db.select().from(pitchesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(pitchesTable.eventDate));
  const visibleRecords = staff.role === "coordinator"
    ? records
    : records.map((record) => ({ ...record, grantDecision: "pending", grantAmount: null }));
  res.json(ListPitchesResponse.parse(visibleRecords));
});

router.post("/pitches", async (req, res): Promise<void> => {
  const parsed = CreatePitchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess | undefined;
  if (staff?.role !== "coordinator"
    && (parsed.data.grantDecision !== undefined || parsed.data.grantAmount !== undefined)) {
    res.status(403).json({ error: "Coordinator access is required to change grant awards." });
    return;
  }
  const activeProgramIds = await activeProgramIdsFor(staff!);
  const [business] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, parsed.data.businessId)).limit(1);
  if (!business || !activeProgramIds.includes(business.programId)) {
    res.status(404).json({ error: "Business not found or not assigned." });
    return;
  }
  const [record] = await db.insert(pitchesTable).values(parsed.data).returning();
  res.status(201).json(CreatePitchResponse.parse(record));
});

router.patch("/pitches/:id", async (req, res): Promise<void> => {
  const params = DeletePitchParams.safeParse(req.params);
  const body = UpdatePitchBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess | undefined;
  if (staff?.role !== "coordinator"
    && (body.data.grantDecision !== undefined || body.data.grantAmount !== undefined)) {
    res.status(403).json({ error: "Coordinator access is required to change grant awards." });
    return;
  }
  const activeProgramIds = await activeProgramIdsFor(staff!);
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(pitchesTable)
      .where(eq(pitchesTable.id, params.data.id)).for("update").limit(1);
    if (!current) return { kind: "not_found" as const };
    const [currentBusiness] = await tx.select({ programId: businessesTable.programId })
      .from(businessesTable).where(eq(businessesTable.id, current.businessId)).limit(1);
    if (!currentBusiness || !activeProgramIds.includes(currentBusiness.programId)) {
      return { kind: "not_found" as const };
    }
    if (body.data.businessId !== undefined) {
      const [nextBusiness] = await tx.select({ programId: businessesTable.programId })
        .from(businessesTable).where(eq(businessesTable.id, body.data.businessId)).limit(1);
      if (!nextBusiness || !activeProgramIds.includes(nextBusiness.programId)) {
        return { kind: "not_found" as const };
      }
    }

    const existingReceipts = await tx.select({
      kind: grantReceiptsTable.kind,
      amount: grantReceiptsTable.amount,
    }).from(grantReceiptsTable)
      .where(eq(grantReceiptsTable.pitchId, current.id));
    if (existingReceipts.length > 0) {
      const received = totalGrantReceived(existingReceipts);
      const nextAwardAmount = body.data.grantAmount === undefined ? current.grantAmount : body.data.grantAmount;
      if ((body.data.grantDecision !== undefined && body.data.grantDecision !== "awarded")
        || (body.data.businessId !== undefined && body.data.businessId !== current.businessId)
        || nextAwardAmount === null
        || cents(nextAwardAmount) < cents(received)) {
        return { kind: "ledger_conflict" as const };
      }
    }
    const [record] = await tx.update(pitchesTable).set(body.data)
      .where(eq(pitchesTable.id, current.id)).returning();
    return record ? { kind: "updated" as const, record } : { kind: "not_found" as const };
  });
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Pitch record not found" });
    return;
  }
  if (result.kind === "ledger_conflict") {
    res.status(409).json({ error: "This award has receipts. Keep it awarded to the same business and do not lower its amount below funds received." });
    return;
  }
  res.json(UpdatePitchResponse.parse(result.record));
});

router.delete("/pitches/:id", async (req, res): Promise<void> => {
  const params = UpdatePitchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const activeProgramIds = await activeProgramIdsFor(staff);
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: pitchesTable.id, businessId: pitchesTable.businessId }).from(pitchesTable)
      .where(eq(pitchesTable.id, params.data.id)).for("update").limit(1);
    if (!current) return { kind: "not_found" as const };
    const [business] = await tx.select({ programId: businessesTable.programId })
      .from(businessesTable).where(eq(businessesTable.id, current.businessId)).limit(1);
    if (!business || !activeProgramIds.includes(business.programId)) {
      return { kind: "not_found" as const };
    }
    const [receipt] = await tx.select({ id: grantReceiptsTable.id }).from(grantReceiptsTable)
      .where(eq(grantReceiptsTable.pitchId, current.id)).limit(1);
    if (receipt) return { kind: "has_receipts" as const };
    await tx.delete(pitchesTable).where(eq(pitchesTable.id, current.id));
    return { kind: "deleted" as const };
  });
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Pitch record not found" });
    return;
  }
  if (result.kind === "has_receipts") {
    res.status(409).json({ error: "This award has a receipt ledger. Preserve its funding history instead of deleting the award." });
    return;
  }
  res.sendStatus(204);
});

export default router;
