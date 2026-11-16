import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  ArchiveProgramParams,
  ArchiveProgramResponse,
  ListAllProgramLifecycleEventsResponse,
  CreateProgramBody,
  CreateProgramResponse,
  DeleteProgramParams,
  ListProgramLifecycleEventsParams,
  ListProgramLifecycleEventsResponse,
  ListProgramsQueryParams,
  ListProgramsResponse,
  RestoreProgramParams,
  RestoreProgramResponse,
  UpdateProgramBody,
  UpdateProgramParams,
  UpdateProgramResponse,
} from "@workspace/api-zod";
import { db, programLifecycleEventsTable, programsTable, staffMembersTable } from "@workspace/db";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";
import { isValidProgramTimeZone } from "../lib/program-time-zone";

const router: IRouter = Router();

router.get("/programs/lifecycle-events", requireCoordinator, async (_req, res): Promise<void> => {
  const events = await db.select({
    id: programLifecycleEventsTable.id,
    programId: programsTable.id,
    programName: programsTable.name,
    action: programLifecycleEventsTable.action,
    createdAt: programLifecycleEventsTable.createdAt,
    actorEmail: staffMembersTable.email,
  }).from(programLifecycleEventsTable)
    .innerJoin(programsTable, eq(programLifecycleEventsTable.programId, programsTable.id))
    .leftJoin(staffMembersTable, eq(programLifecycleEventsTable.actorStaffId, staffMembersTable.id))
    .orderBy(desc(programLifecycleEventsTable.createdAt), desc(programLifecycleEventsTable.id));
  res.json(ListAllProgramLifecycleEventsResponse.parse(events));
});

router.get("/programs", async (req, res): Promise<void> => {
  const query = ListProgramsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  if (query.data.includeArchived && staff.role !== "coordinator") {
    res.status(403).json({ error: "Only admins can view archived programs." });
    return;
  }
  if (staff.role === "staff" && staff.programIds.length === 0) {
    res.json([]);
    return;
  }

  const filters = [];
  if (!query.data.includeArchived) filters.push(isNull(programsTable.archivedAt));
  if (staff.role === "staff") filters.push(inArray(programsTable.id, staff.programIds));
  const programs = await db.select().from(programsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(programsTable.createdAt));
  res.json(ListProgramsResponse.parse(programs));
});

router.get("/programs/:id/lifecycle-events", requireCoordinator, async (req, res): Promise<void> => {
  const params = ListProgramLifecycleEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [program] = await db.select({ id: programsTable.id })
    .from(programsTable)
    .where(eq(programsTable.id, params.data.id))
    .limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  const events = await db.select({
    id: programLifecycleEventsTable.id,
    action: programLifecycleEventsTable.action,
    createdAt: programLifecycleEventsTable.createdAt,
    actorEmail: staffMembersTable.email,
  }).from(programLifecycleEventsTable)
    .leftJoin(staffMembersTable, eq(programLifecycleEventsTable.actorStaffId, staffMembersTable.id))
    .where(eq(programLifecycleEventsTable.programId, params.data.id))
    .orderBy(desc(programLifecycleEventsTable.createdAt), desc(programLifecycleEventsTable.id));
  res.json(ListProgramLifecycleEventsResponse.parse(events));
});

router.post("/programs", requireCoordinator, async (req, res): Promise<void> => {
  const parsed = CreateProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.timeZone !== undefined && !isValidProgramTimeZone(parsed.data.timeZone)) {
    res.status(400).json({ error: "Choose a valid IANA time zone." });
    return;
  }
  const [program] = await db.insert(programsTable).values(parsed.data).returning();
  res.status(201).json(CreateProgramResponse.parse(program));
});

router.patch("/programs/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = UpdateProgramParams.safeParse(req.params);
  const body = UpdateProgramBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  if (body.data.timeZone !== undefined && !isValidProgramTimeZone(body.data.timeZone)) {
    res.status(400).json({ error: "Choose a valid IANA time zone." });
    return;
  }
  const values = {
    ...body.data,
    startDate: body.data.startDate instanceof Date ? body.data.startDate.toISOString().slice(0, 10) : body.data.startDate,
    endDate: body.data.endDate instanceof Date ? body.data.endDate.toISOString().slice(0, 10) : body.data.endDate,
    applicationDeadline: body.data.applicationDeadline instanceof Date
      ? body.data.applicationDeadline.toISOString().slice(0, 10)
      : body.data.applicationDeadline,
  };
  const [program] = await db.update(programsTable).set(values)
    .where(and(eq(programsTable.id, params.data.id), isNull(programsTable.archivedAt))).returning();
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  res.json(UpdateProgramResponse.parse(program));
});

router.post("/programs/:id/archive", requireCoordinator, async (req, res): Promise<void> => {
  const params = ArchiveProgramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(programsTable)
      .where(eq(programsTable.id, params.data.id)).for("update").limit(1);
    if (!existing) return { kind: "missing" as const };
    if (existing.archivedAt) return { kind: "already_archived" as const };

    const [program] = await tx.update(programsTable)
      .set({ archivedAt: new Date() })
      .where(and(eq(programsTable.id, params.data.id), isNull(programsTable.archivedAt)))
      .returning();
    if (!program) return { kind: "already_archived" as const };
    await tx.insert(programLifecycleEventsTable).values({
      programId: program.id,
      action: "archived",
      actorStaffId: staff.id,
    });
    return { kind: "ok" as const, program };
  });
  if (result.kind === "missing") {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  if (result.kind === "already_archived") {
    res.status(409).json({ error: "Program is already archived." });
    return;
  }
  res.json(ArchiveProgramResponse.parse(result.program));
});

router.post("/programs/:id/restore", requireCoordinator, async (req, res): Promise<void> => {
  const params = RestoreProgramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(programsTable)
      .where(eq(programsTable.id, params.data.id)).for("update").limit(1);
    if (!existing) return { kind: "missing" as const };
    if (!existing.archivedAt) return { kind: "not_archived" as const };

    const [program] = await tx.update(programsTable)
      .set({ archivedAt: null })
      .where(and(eq(programsTable.id, params.data.id), isNotNull(programsTable.archivedAt)))
      .returning();
    if (!program) return { kind: "not_archived" as const };
    await tx.insert(programLifecycleEventsTable).values({
      programId: program.id,
      action: "restored",
      actorStaffId: staff.id,
    });
    return { kind: "ok" as const, program };
  });
  if (result.kind === "missing") {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  if (result.kind === "not_archived") {
    res.status(409).json({ error: "Program is not archived." });
    return;
  }
  res.json(RestoreProgramResponse.parse(result.program));
});

router.delete("/programs/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = DeleteProgramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [program] = await db.select({ id: programsTable.id })
    .from(programsTable).where(eq(programsTable.id, params.data.id)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  res.status(409).json({ error: "Programs are archived instead of deleted." });
});

export default router;
