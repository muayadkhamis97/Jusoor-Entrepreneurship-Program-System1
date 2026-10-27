import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  CreateSupportBody,
  CreateSupportResponse,
  DeleteSupportParams,
  ListSupportCalendlyMeetingsResponse,
  ListSupportGoogleCalendarMeetingsResponse,
  ListSupportQueryParams,
  ListSupportResponse,
  UpdateSupportBody,
  UpdateSupportParams,
  UpdateSupportResponse,
} from "@workspace/api-zod";
import {
  businessesTable,
  calendlyMeetingsTable,
  db,
  googleCalendarMeetingsTable,
  staffMembersTable,
  supportTable,
} from "@workspace/db";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import { hasProgramStaffRole } from "../lib/programStaffRoles";
import { queueProgramGoogleSheetsSnapshot } from "../lib/googleSheetsSync";
import type { StaffAccess } from "../middlewares/staffAccess";
import { requireCoordinator } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/support/calendly-meetings", requireCoordinator, async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const activeProgramIds = await activeProgramIdsFor(staff);
  if (activeProgramIds.length === 0) {
    res.json([]);
    return;
  }
  const meetings = await db.selectDistinct({
    id: calendlyMeetingsTable.id,
    businessId: calendlyMeetingsTable.businessId,
    mentorStaffId: calendlyMeetingsTable.mentorStaffId,
    mentorEmail: staffMembersTable.email,
    eventName: calendlyMeetingsTable.eventName,
    startsAt: calendlyMeetingsTable.startsAt,
    endsAt: calendlyMeetingsTable.endsAt,
    timezone: calendlyMeetingsTable.timezone,
    status: calendlyMeetingsTable.status,
  })
    .from(calendlyMeetingsTable)
    .innerJoin(businessesTable, eq(calendlyMeetingsTable.businessId, businessesTable.id))
    .innerJoin(supportTable, and(
      eq(supportTable.businessId, calendlyMeetingsTable.businessId),
      eq(supportTable.mentorStaffId, calendlyMeetingsTable.mentorStaffId),
      eq(supportTable.type, "mentor"),
    ))
    .innerJoin(staffMembersTable, eq(staffMembersTable.id, calendlyMeetingsTable.mentorStaffId))
    .where(inArray(businessesTable.programId, activeProgramIds))
    .orderBy(desc(calendlyMeetingsTable.startsAt));
  res.json(ListSupportCalendlyMeetingsResponse.parse(meetings));
});

router.get("/support/google-calendar-meetings", requireCoordinator, async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const activeProgramIds = await activeProgramIdsFor(staff);
  if (activeProgramIds.length === 0) {
    res.json([]);
    return;
  }
  const meetings = await db.selectDistinct({
    id: googleCalendarMeetingsTable.id,
    businessId: googleCalendarMeetingsTable.businessId,
    mentorStaffId: googleCalendarMeetingsTable.mentorStaffId,
    mentorEmail: staffMembersTable.email,
    startsAt: googleCalendarMeetingsTable.startsAt,
    endsAt: googleCalendarMeetingsTable.endsAt,
    timezone: googleCalendarMeetingsTable.timezone,
    status: googleCalendarMeetingsTable.status,
  })
    .from(googleCalendarMeetingsTable)
    .innerJoin(businessesTable, eq(googleCalendarMeetingsTable.businessId, businessesTable.id))
    .innerJoin(supportTable, and(
      eq(supportTable.businessId, googleCalendarMeetingsTable.businessId),
      eq(supportTable.mentorStaffId, googleCalendarMeetingsTable.mentorStaffId),
      eq(supportTable.type, "mentor"),
    ))
    .innerJoin(staffMembersTable, eq(staffMembersTable.id, googleCalendarMeetingsTable.mentorStaffId))
    .where(inArray(businessesTable.programId, activeProgramIds))
    .orderBy(desc(googleCalendarMeetingsTable.startsAt));
  res.json(ListSupportGoogleCalendarMeetingsResponse.parse(meetings.map((meeting) => ({
    ...meeting,
    eventName: "Mentoring session",
  }))));
});

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
    if (!await hasProgramStaffRole(parsed.data.mentorStaffId, business.programId, "mentor")) {
      res.status(400).json({ error: "Select a mentor assigned to this program." });
      return;
    }
  }
  const engagement = await db.transaction(async (tx) => {
    const [created] = await tx.insert(supportTable).values(parsed.data).returning();
    await queueProgramGoogleSheetsSnapshot(tx, business.programId);
    return created;
  });
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
    if (!await hasProgramStaffRole(body.data.mentorStaffId, nextBusiness.programId, "mentor")) {
      res.status(400).json({ error: "Select a mentor assigned to this program." });
      return;
    }
  }
  const values = {
    ...body.data,
    scheduledDate: body.data.scheduledDate instanceof Date
      ? body.data.scheduledDate.toISOString().slice(0, 10)
      : body.data.scheduledDate,
  };
  const engagement = await db.transaction(async (tx) => {
    const [updated] = await tx.update(supportTable).set(values)
      .where(and(eq(supportTable.id, params.data.id), eq(supportTable.businessId, current.businessId))).returning();
    if (updated) {
      await queueProgramGoogleSheetsSnapshot(tx, currentBusiness.programId);
      if (nextBusiness.programId !== currentBusiness.programId) {
        await queueProgramGoogleSheetsSnapshot(tx, nextBusiness.programId);
      }
    }
    return updated;
  });
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
  const engagement = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(supportTable).where(and(
      eq(supportTable.id, params.data.id),
      eq(supportTable.businessId, current.businessId),
    )).returning();
    if (deleted) await queueProgramGoogleSheetsSnapshot(tx, business.programId);
    return deleted;
  });
  if (!engagement) {
    res.status(404).json({ error: "Support engagement not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
