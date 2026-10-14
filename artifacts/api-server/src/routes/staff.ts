import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateStaffBody,
  CreateStaffResponse,
  DeleteStaffParams,
  GetAuthMeResponse,
  GetMentorBookingStatusResponse,
  GetMentorBookingStatusResponseItem,
  ListStaffResponse,
  UpdateMentorBookingFollowUpBody,
  UpdateMentorBookingFollowUpParams,
  UpdateStaffBody,
  UpdateStaffParams,
  UpdateStaffResponse,
} from "@workspace/api-zod";
import {
  db,
  programsTable,
  staffMembersTable,
  staffProgramAssignmentsTable,
} from "@workspace/db";
import { requireCoordinator, requireOperationsStaff, type StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/auth/me", (_req, res): void => {
  res.json(GetAuthMeResponse.parse(res.locals.staff));
});

async function withProgramIds<T extends { id: number }>(members: T[]) {
  if (members.length === 0) return members.map((member) => ({ ...member, programIds: [] as number[] }));
  const assignments = await db.select({
    staffId: staffProgramAssignmentsTable.staffId,
    programId: staffProgramAssignmentsTable.programId,
  }).from(staffProgramAssignmentsTable)
    .where(inArray(staffProgramAssignmentsTable.staffId, members.map(({ id }) => id)));
  const programIdsByStaff = new Map<number, number[]>();
  for (const { staffId, programId } of assignments) {
    programIdsByStaff.set(staffId, [...(programIdsByStaff.get(staffId) ?? []), programId]);
  }
  return members.map((member) => ({
    ...member,
    programIds: [...new Set(programIdsByStaff.get(member.id) ?? [])],
  }));
}

router.get("/staff", requireOperationsStaff, async (_req, res): Promise<void> => {
  const current = res.locals.staff as StaffAccess;
  if (current.role === "coordinator") {
    const members = await db.select().from(staffMembersTable).orderBy(asc(staffMembersTable.email));
    res.json(ListStaffResponse.parse(await withProgramIds(members)));
    return;
  }
  if (current.programIds.length === 0) {
    res.json([]);
    return;
  }
  const assignments = await db.select({ staffId: staffProgramAssignmentsTable.staffId })
    .from(staffProgramAssignmentsTable)
    .where(inArray(staffProgramAssignmentsTable.programId, current.programIds));
  const visibleStaffIds = [...new Set(assignments.map(({ staffId }) => staffId))];
  if (visibleStaffIds.length === 0) {
    res.json([]);
    return;
  }
  const members = await db.select().from(staffMembersTable)
    .where(inArray(staffMembersTable.id, visibleStaffIds))
    .orderBy(asc(staffMembersTable.email));
  res.json(ListStaffResponse.parse(await withProgramIds(members)));
});

router.get("/staff/mentor-booking-status", requireCoordinator, async (_req, res): Promise<void> => {
  const mentors = await db.select({
    staffId: staffMembersTable.id,
    email: staffMembersTable.email,
    status: staffMembersTable.status,
    bookingProvider: staffMembersTable.bookingProvider,
    calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
    calendlyFollowUpDate: staffMembersTable.calendlyFollowUpDate,
    calendlyFollowUpNote: staffMembersTable.calendlyFollowUpNote,
    googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
  }).from(staffMembersTable)
    .where(eq(staffMembersTable.role, "mentor"))
    .orderBy(asc(staffMembersTable.email));

  res.json(GetMentorBookingStatusResponse.parse(mentors.map(({ calendlyBookingUrl, googleCalendarAccountEmail, ...mentor }) => ({
    ...mentor,
    calendlyConnected: Boolean(calendlyBookingUrl),
    googleCalendarConnected: Boolean(googleCalendarAccountEmail),
  }))));
});

router.patch("/staff/:id/mentor-booking-follow-up", requireCoordinator, async (req, res): Promise<void> => {
  const params = UpdateMentorBookingFollowUpParams.safeParse(req.params);
  const body = UpdateMentorBookingFollowUpBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  if (body.data.calendlyFollowUpDate && !isValidCalendarDate(body.data.calendlyFollowUpDate)) {
    res.status(400).json({ error: "Follow-up date must be a valid calendar date." });
    return;
  }

  const [mentor] = await db.select({
    staffId: staffMembersTable.id,
    calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
  }).from(staffMembersTable)
    .where(and(eq(staffMembersTable.id, params.data.id), eq(staffMembersTable.role, "mentor")))
    .limit(1);
  if (!mentor) {
    res.status(404).json({ error: "Mentor not found." });
    return;
  }
  if (mentor.calendlyBookingUrl) {
    res.status(400).json({ error: "Follow-up details can only be changed before Calendly is connected." });
    return;
  }

  const [updated] = await db.update(staffMembersTable)
    .set({
      calendlyFollowUpDate: body.data.calendlyFollowUpDate,
      calendlyFollowUpNote: body.data.calendlyFollowUpNote?.trim() || null,
    })
    .where(and(
      eq(staffMembersTable.id, params.data.id),
      eq(staffMembersTable.role, "mentor"),
      isNull(staffMembersTable.calendlyBookingUrl),
    ))
    .returning({
      staffId: staffMembersTable.id,
      email: staffMembersTable.email,
      status: staffMembersTable.status,
      bookingProvider: staffMembersTable.bookingProvider,
      calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
      calendlyFollowUpDate: staffMembersTable.calendlyFollowUpDate,
      calendlyFollowUpNote: staffMembersTable.calendlyFollowUpNote,
      googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
    });
  if (!updated) {
    res.status(400).json({ error: "Follow-up details can only be changed before Calendly is connected." });
    return;
  }

  const { calendlyBookingUrl, googleCalendarAccountEmail, ...status } = updated;
  res.json(GetMentorBookingStatusResponseItem.parse({
    ...status,
    calendlyConnected: Boolean(calendlyBookingUrl),
    googleCalendarConnected: Boolean(googleCalendarAccountEmail),
  }));
});

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

router.post("/staff", requireCoordinator, async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const programIds = [...new Set(parsed.data.programIds ?? [])];
  if (parsed.data.role === "coordinator" && programIds.length > 0) {
    res.status(400).json({ error: "Coordinators have global access and cannot have program assignments." });
    return;
  }
  if (programIds.length > 0) {
    const activePrograms = await db.select({ id: programsTable.id }).from(programsTable)
      .where(and(inArray(programsTable.id, programIds), isNull(programsTable.archivedAt)));
    if (activePrograms.length !== programIds.length) {
      res.status(400).json({ error: "Choose only active programs." });
      return;
    }
  }
  const current = res.locals.staff as StaffAccess;
  const member = await db.transaction(async (tx) => {
    const [created] = await tx.insert(staffMembersTable)
      .values({ email, role: parsed.data.role, status: "invited" })
      .onConflictDoNothing({ target: staffMembersTable.email })
      .returning();
    if (!created) return null;
    if (programIds.length > 0) {
      await tx.insert(staffProgramAssignmentsTable).values(programIds.map((programId) => ({
        staffId: created.id,
        programId,
        assignedByStaffId: current.id,
      })));
    }
    return created;
  });
  if (!member) {
    res.status(409).json({ error: "This email already has staff access." });
    return;
  }

  res.status(201).json(CreateStaffResponse.parse({ ...member, programIds }));
});

router.patch("/staff/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  const body = UpdateStaffBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }

  const current = res.locals.staff as { id: number };
  const [target] = await db.select().from(staffMembersTable)
    .where(eq(staffMembersTable.id, params.data.id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  if (target.id === current.id) {
    res.status(400).json({ error: "You cannot change your own role." });
    return;
  }

  if (target.role === "coordinator" && body.data.role !== "coordinator") {
    const [coordinatorCount] = await db.select({ value: count() })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.role, "coordinator"));
    if ((coordinatorCount?.value ?? 0) <= 1) {
      res.status(400).json({ error: "At least one coordinator must remain." });
      return;
    }
  }

  const existingAssignments = await db.select({ programId: staffProgramAssignmentsTable.programId })
    .from(staffProgramAssignmentsTable)
    .where(eq(staffProgramAssignmentsTable.staffId, params.data.id));
  const programIds = body.data.role === "coordinator"
    ? []
    : [...new Set(body.data.programIds ?? existingAssignments.map(({ programId }) => programId))];
  if (body.data.role === "coordinator" && (body.data.programIds?.length ?? 0) > 0) {
    res.status(400).json({ error: "Coordinators have global access and cannot have program assignments." });
    return;
  }
  if (programIds.length > 0) {
    const activePrograms = await db.select({ id: programsTable.id }).from(programsTable)
      .where(and(inArray(programsTable.id, programIds), isNull(programsTable.archivedAt)));
    if (activePrograms.length !== programIds.length) {
      res.status(400).json({ error: "Choose only active programs." });
      return;
    }
  }
  const [member] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(staffMembersTable)
      .set({ role: body.data.role })
      .where(eq(staffMembersTable.id, params.data.id))
      .returning();
    if (!updated) return [undefined];
    if (body.data.programIds !== undefined || body.data.role === "coordinator") {
      await tx.delete(staffProgramAssignmentsTable)
        .where(eq(staffProgramAssignmentsTable.staffId, params.data.id));
      if (programIds.length > 0) {
        await tx.insert(staffProgramAssignmentsTable).values(programIds.map((programId) => ({
          staffId: params.data.id,
          programId,
          assignedByStaffId: current.id,
        })));
      }
    }
    return [updated];
  });
  res.json(UpdateStaffResponse.parse({ ...member, programIds }));
});

router.delete("/staff/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const current = res.locals.staff as { id: number };
  const [target] = await db.select().from(staffMembersTable)
    .where(eq(staffMembersTable.id, params.data.id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  if (target.id === current.id) {
    res.status(400).json({ error: "You cannot revoke your own access." });
    return;
  }

  if (target.role === "coordinator") {
    const [coordinatorCount] = await db.select({ value: count() })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.role, "coordinator"));
    if ((coordinatorCount?.value ?? 0) <= 1) {
      res.status(400).json({ error: "At least one coordinator must remain." });
      return;
    }
  }

  await db.delete(staffMembersTable).where(eq(staffMembersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
