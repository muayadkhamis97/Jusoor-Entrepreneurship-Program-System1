import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  CreateSupportBody,
  CreateSupportResponse,
  DeleteSupportParams,
  ListSupportQueryParams,
  ListSupportResponse,
  UpdateSupportBody,
  UpdateSupportParams,
  UpdateSupportResponse,
} from "@workspace/api-zod";
import { businessesTable, db, staffMembersTable, staffProgramAssignmentsTable, supportTable } from "@workspace/db";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import type { StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/support", async (req, res): Promise<void> => {
  const query = ListSupportQueryParams.safeParse(req.query);
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
  const businessRows = await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(inArray(businessesTable.programId, activeProgramIds));
  const businessIds = businessRows.map(({ id }) => id);
  if (businessIds.length === 0) {
    res.json([]);
    return;
  }
  const filters = [];
  filters.push(inArray(supportTable.businessId, businessIds));
  if (query.data.businessId !== undefined) filters.push(eq(supportTable.businessId, query.data.businessId));
  if (query.data.type) filters.push(eq(supportTable.type, query.data.type));
  const engagements = await db.select().from(supportTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(supportTable.createdAt));
  res.json(ListSupportResponse.parse(engagements));
});

router.post("/support", async (req, res): Promise<void> => {
  const parsed = CreateSupportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const [business] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, parsed.data.businessId)).limit(1);
  if (!business || !await canAccessActiveProgram(staff, business.programId)) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  if (parsed.data.mentorStaffId !== undefined && parsed.data.mentorStaffId !== null) {
    const [mentor] = await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
      .where(and(eq(staffMembersTable.id, parsed.data.mentorStaffId), eq(staffMembersTable.role, "mentor"))).limit(1);
    if (!mentor) {
      res.status(400).json({ error: "Select an account with the Mentor role." });
      return;
    }
    if (staff.role !== "coordinator") {
      const [assignment] = await db.select({ id: staffProgramAssignmentsTable.id })
        .from(staffProgramAssignmentsTable)
        .where(and(
          eq(staffProgramAssignmentsTable.staffId, parsed.data.mentorStaffId),
          eq(staffProgramAssignmentsTable.programId, business.programId),
        )).limit(1);
      if (!assignment) {
        res.status(400).json({ error: "The mentor is not assigned to this program." });
        return;
      }
    }
  }
  const [engagement] = await db.insert(supportTable).values(parsed.data).returning();
  res.status(201).json(CreateSupportResponse.parse(engagement));
});

router.patch("/support/:id", async (req, res): Promise<void> => {
  const params = DeleteSupportParams.safeParse(req.params);
  const body = UpdateSupportBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [current] = await db.select().from(supportTable)
    .where(eq(supportTable.id, params.data.id)).limit(1);
  const staff = res.locals.staff as StaffAccess;
  const [currentBusiness] = current
    ? await db.select().from(businessesTable).where(eq(businessesTable.id, current.businessId)).limit(1)
    : [];
  if (!current || !currentBusiness || !await canAccessActiveProgram(staff, currentBusiness.programId)) {
    res.status(404).json({ error: "Support engagement not found." });
    return;
  }
  const nextBusinessId = body.data.businessId ?? current.businessId;
  const [nextBusiness] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, nextBusinessId)).limit(1);
  if (!nextBusiness || !await canAccessActiveProgram(staff, nextBusiness.programId)) {
    res.status(404).json({ error: "Business not found." });
    return;
  }
  if (body.data.mentorStaffId !== undefined && body.data.mentorStaffId !== null) {
    const [mentor] = await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
      .where(and(eq(staffMembersTable.id, body.data.mentorStaffId), eq(staffMembersTable.role, "mentor"))).limit(1);
    if (!mentor) {
      res.status(400).json({ error: "Select an account with the Mentor role." });
      return;
    }
    if (staff.role !== "coordinator") {
      const [assignment] = await db.select({ id: staffProgramAssignmentsTable.id })
        .from(staffProgramAssignmentsTable)
        .where(and(
          eq(staffProgramAssignmentsTable.staffId, body.data.mentorStaffId),
          eq(staffProgramAssignmentsTable.programId, nextBusiness.programId),
        )).limit(1);
      if (!assignment) {
        res.status(400).json({ error: "The mentor is not assigned to this program." });
        return;
      }
    }
  }
  const values = {
    ...body.data,
    scheduledDate: body.data.scheduledDate instanceof Date
      ? body.data.scheduledDate.toISOString().slice(0, 10)
      : body.data.scheduledDate,
  };
  const [engagement] = await db.update(supportTable).set(values)
    .where(and(eq(supportTable.id, params.data.id), eq(supportTable.businessId, current.businessId))).returning();
  if (!engagement) {
    res.status(404).json({ error: "Support engagement not found" });
    return;
  }
  res.json(UpdateSupportResponse.parse(engagement));
});

router.delete("/support/:id", async (req, res): Promise<void> => {
  const params = UpdateSupportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [current] = await db.select().from(supportTable)
    .where(eq(supportTable.id, params.data.id)).limit(1);
  const staff = res.locals.staff as StaffAccess;
  const [business] = current
    ? await db.select().from(businessesTable).where(eq(businessesTable.id, current.businessId)).limit(1)
    : [];
  if (!current || !business || !await canAccessActiveProgram(staff, business.programId)) {
    res.status(404).json({ error: "Support engagement not found." });
    return;
  }
  const [engagement] = await db.delete(supportTable).where(and(
    eq(supportTable.id, params.data.id),
    eq(supportTable.businessId, current.businessId),
  )).returning();
  if (!engagement) {
    res.status(404).json({ error: "Support engagement not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
