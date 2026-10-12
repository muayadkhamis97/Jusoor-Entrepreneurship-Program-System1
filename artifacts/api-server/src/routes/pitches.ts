import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
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
import { db, pitchJudgesTable, pitchesTable, staffMembersTable } from "@workspace/db";
import { requireCoordinator } from "../middlewares/staffAccess";

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
  const filters = [];
  if (query.data.businessId !== undefined) filters.push(eq(pitchesTable.businessId, query.data.businessId));
  if (query.data.eventType) filters.push(eq(pitchesTable.eventType, query.data.eventType));
  const records = await db.select().from(pitchesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(pitchesTable.eventDate));
  res.json(ListPitchesResponse.parse(records));
});

router.post("/pitches", async (req, res): Promise<void> => {
  const parsed = CreatePitchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
  const [record] = await db.update(pitchesTable).set(body.data)
    .where(eq(pitchesTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Pitch record not found" });
    return;
  }
  res.json(UpdatePitchResponse.parse(record));
});

router.delete("/pitches/:id", async (req, res): Promise<void> => {
  const params = UpdatePitchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [record] = await db.delete(pitchesTable).where(eq(pitchesTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Pitch record not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
