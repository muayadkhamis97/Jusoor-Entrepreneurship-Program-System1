import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  AssignParticipantBusinessBody,
  AssignParticipantBusinessParams,
  AssignParticipantBusinessResponse,
  CreateStaffBody,
  CreateStaffResponse,
  DeleteStaffParams,
  GetAuthMeResponse,
  GetMentorBookingStatusResponse,
  GetMentorBookingStatusResponseItem,
  GetProgramTeamAssignmentsParams,
  GetProgramTeamAssignmentsResponse,
  ListStaffResponse,
  UpdateMentorBookingFollowUpBody,
  UpdateMentorBookingFollowUpParams,
  UpdateProgramStaffRolesBody,
  UpdateProgramStaffRolesParams,
  UpdateProgramStaffRolesResponse,
  UpdateStaffBody,
  UpdateStaffParams,
  UpdateStaffResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  db,
  participantBusinessMembershipsTable,
  programsTable,
  staffMembersTable,
  staffAssignmentAuditEventsTable,
  staffProgramAssignmentsTable,
  staffProgramRolesTable,
  type ProgramSpecialistRole,
} from "@workspace/db";
import { requireCoordinator, requireOperationsStaff, type StaffAccess } from "../middlewares/staffAccess";
import { hasAnyProgramStaffRole } from "../lib/programStaffRoles";
import { canManageProgramAssignments } from "../lib/programAssignmentAuthorization";
import { makeBusinessTeamAuditEvent, makeStaffRoleAuditEvent } from "../lib/staffAssignmentAudit";

const router: IRouter = Router();
const isUndefinedRelation = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");
function isProgramSpecialistRole(role: string): role is ProgramSpecialistRole {
  return role === "trainer" || role === "mentor" || role === "judge";
}

router.get("/auth/me", (_req, res): void => {
  res.json(GetAuthMeResponse.parse(res.locals.staff));
});

async function withProgramIds<T extends { id: number; role: string }>(members: T[]) {
  if (members.length === 0) return members.map((member) => ({ ...member, primaryRole: member.role, programIds: [] as number[], programRoles: [] as { programId: number; role: ProgramSpecialistRole }[] }));
  const assignments = await db.select({
      staffId: staffProgramAssignmentsTable.staffId,
      programId: staffProgramAssignmentsTable.programId,
    }).from(staffProgramAssignmentsTable)
      .where(inArray(staffProgramAssignmentsTable.staffId, members.map(({ id }) => id)));
  let roleAssignments: { staffId: number; programId: number; role: ProgramSpecialistRole }[] = [];
  let roleSchemaAvailable = true;
  try {
    roleAssignments = await db.select({
      staffId: staffProgramRolesTable.staffId,
      programId: staffProgramRolesTable.programId,
      role: staffProgramRolesTable.role,
    }).from(staffProgramRolesTable)
      .where(inArray(staffProgramRolesTable.staffId, members.map(({ id }) => id)));
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
    roleSchemaAvailable = false;
    console.warn("Program specialist-role migration is not applied; returning legacy staff access.");
  }
  const programsByStaff = new Map<number, Set<number>>();
  const rolesByStaff = new Map<number, { programId: number; role: ProgramSpecialistRole }[]>();
  for (const { staffId, programId } of assignments) {
    const ids = programsByStaff.get(staffId) ?? new Set<number>();
    ids.add(programId);
    programsByStaff.set(staffId, ids);
  }
  for (const { staffId, programId, role } of roleAssignments) {
    const roles = rolesByStaff.get(staffId) ?? [];
    roles.push({ programId, role });
    rolesByStaff.set(staffId, roles);
  }
  for (const { id, role } of members) {
    if (!roleSchemaAvailable && (role === "trainer" || role === "mentor" || role === "judge")) {
      for (const programId of programsByStaff.get(id) ?? []) {
        const roles = rolesByStaff.get(id) ?? [];
        if (!roles.some((entry) => entry.programId === programId && entry.role === role)) {
          roles.push({ programId, role });
          rolesByStaff.set(id, roles);
        }
      }
    }
  }
  return members.map((member) => ({
    ...member,
    primaryRole: member.role,
    programIds: [...(programsByStaff.get(member.id) ?? new Set<number>())].sort((a, b) => a - b),
    programRoles: rolesByStaff.get(member.id) ?? [],
  }));
}

async function specialistRoleTableAvailable(): Promise<boolean> {
  try {
    await db.select({ id: staffProgramRolesTable.id }).from(staffProgramRolesTable).limit(1);
    return true;
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
    return false;
  }
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
  let specialistAssignments: { staffId: number }[] = [];
  try {
    specialistAssignments = await db.select({ staffId: staffProgramRolesTable.staffId })
      .from(staffProgramRolesTable)
      .where(inArray(staffProgramRolesTable.programId, current.programIds));
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
  }
  const visibleStaffIds = [...new Set([
    ...assignments.map(({ staffId }) => staffId),
    ...specialistAssignments.map(({ staffId }) => staffId),
  ])];
  if (visibleStaffIds.length === 0) {
    res.json([]);
    return;
  }
  const members = await db.select().from(staffMembersTable)
    .where(inArray(staffMembersTable.id, visibleStaffIds))
    .orderBy(asc(staffMembersTable.email));
  res.json(ListStaffResponse.parse(await withProgramIds(members)));
});

router.get("/staff/assignment-history", requireCoordinator, async (_req, res): Promise<void> => {
  const events = await db.select({
    id: staffAssignmentAuditEventsTable.id,
    assignmentType: staffAssignmentAuditEventsTable.assignmentType,
    programId: staffAssignmentAuditEventsTable.programId,
    programName: staffAssignmentAuditEventsTable.programName,
    actorStaffId: staffAssignmentAuditEventsTable.actorStaffId,
    actorEmail: staffAssignmentAuditEventsTable.actorEmail,
    affectedStaffId: staffAssignmentAuditEventsTable.affectedStaffId,
    affectedAccountEmail: staffAssignmentAuditEventsTable.affectedAccountEmail,
    applicationId: staffAssignmentAuditEventsTable.applicationId,
    affectedApplicationName: staffAssignmentAuditEventsTable.affectedApplicationName,
    previousValue: staffAssignmentAuditEventsTable.previousValue,
    newValue: staffAssignmentAuditEventsTable.newValue,
    createdAt: staffAssignmentAuditEventsTable.createdAt,
  }).from(staffAssignmentAuditEventsTable)
    .orderBy(desc(staffAssignmentAuditEventsTable.createdAt), desc(staffAssignmentAuditEventsTable.id))
    .limit(250);
  res.json(events.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  })));
});

async function canManageProgram(programId: number, staff: StaffAccess): Promise<"allowed" | "missing" | "denied"> {
  const [program] = await db.select({ id: programsTable.id })
    .from(programsTable)
    .where(and(eq(programsTable.id, programId), isNull(programsTable.archivedAt)))
    .limit(1);
  if (!program) return "missing";
  return canManageProgramAssignments(staff.role, staff.programIds, programId, true) ? "allowed" : "denied";
}

async function hasAssignmentSchema(res: Response, includeMembership = true): Promise<boolean> {
  try {
    await db.select({ id: staffProgramRolesTable.id }).from(staffProgramRolesTable).limit(1);
    if (includeMembership) {
      await db.select({ id: participantBusinessMembershipsTable.id })
        .from(participantBusinessMembershipsTable)
        .limit(1);
    }
    return true;
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
    res.status(503).json({
      error: "Program role and business-team assignments require the additive assignment database migration.",
    });
    return false;
  }
}

async function hasAssignmentAuditSchema(res: Response): Promise<boolean> {
  try {
    await db.select({ id: staffAssignmentAuditEventsTable.id })
      .from(staffAssignmentAuditEventsTable)
      .limit(1);
    return true;
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
    res.status(503).json({
      error: "Assignment history requires the additive staff-assignment audit migration.",
    });
    return false;
  }
}

router.get("/programs/:programId/team-assignments", requireOperationsStaff, async (req, res): Promise<void> => {
  const params = GetProgramTeamAssignmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = res.locals.staff as StaffAccess;
  const scope = await canManageProgram(params.data.programId, current);
  if (scope === "missing") {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  if (scope === "denied") {
    res.status(403).json({ error: "You can manage assignments only in programs assigned to you." });
    return;
  }
  if (!(await hasAssignmentSchema(res))) return;

  const [roleAssignments, applications, businesses] = await Promise.all([
    db.select({
      staffId: staffProgramRolesTable.staffId,
      role: staffProgramRolesTable.role,
    }).from(staffProgramRolesTable)
      .where(eq(staffProgramRolesTable.programId, params.data.programId)),
    db.select({
      id: applicationsTable.id,
      founderName: applicationsTable.founderName,
      email: applicationsTable.email,
      businessName: applicationsTable.businessName,
      businessId: applicationsTable.businessId,
    }).from(applicationsTable)
      .where(and(
        eq(applicationsTable.programId, params.data.programId),
        eq(applicationsTable.status, "accepted"),
      ))
      .orderBy(asc(applicationsTable.founderName), asc(applicationsTable.id)),
    db.select({
      id: businessesTable.id,
      businessName: businessesTable.businessName,
      stage: businessesTable.stage,
    }).from(businessesTable)
      .where(eq(businessesTable.programId, params.data.programId))
      .orderBy(asc(businessesTable.businessName)),
  ]);

  const roleRowsByApplication = applications.length
    ? await db.select({
      applicationId: participantBusinessMembershipsTable.applicationId,
      businessId: participantBusinessMembershipsTable.businessId,
    }).from(participantBusinessMembershipsTable)
      .where(inArray(participantBusinessMembershipsTable.applicationId, applications.map(({ id }) => id)))
    : [];
  const membershipBusinessByApplication = new Map(roleRowsByApplication.map(({ applicationId, businessId }) => [applicationId, businessId]));

  const members = await db.select({
    id: staffMembersTable.id,
    email: staffMembersTable.email,
    role: staffMembersTable.role,
    status: staffMembersTable.status,
  }).from(staffMembersTable)
    .where(ne(staffMembersTable.role, "coordinator"))
    .orderBy(asc(staffMembersTable.email));
  const explicitRoles = new Map<number, ProgramSpecialistRole[]>();
  for (const { staffId, role } of roleAssignments) {
    explicitRoles.set(staffId, [...(explicitRoles.get(staffId) ?? []), role]);
  }
  res.json(GetProgramTeamAssignmentsResponse.parse({
    programId: params.data.programId,
    staff: members.map((member) => {
      const existing = explicitRoles.get(member.id) ?? [];
      return { staffId: member.id, email: member.email, status: member.status, roles: [...new Set(existing)] };
    }),
    participants: applications.map((application) => ({
      applicationId: application.id,
      founderName: application.founderName,
      email: application.email,
      businessName: application.businessName,
      assignedBusinessId: application.businessId ?? membershipBusinessByApplication.get(application.id) ?? null,
    })),
    businesses,
  }));
});

router.put("/programs/:programId/staff/:staffId/roles", requireOperationsStaff, async (req, res): Promise<void> => {
  const params = UpdateProgramStaffRolesParams.safeParse(req.params);
  const body = UpdateProgramStaffRolesBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const current = res.locals.staff as StaffAccess;
  const scope = await canManageProgram(params.data.programId, current);
  if (scope === "missing") {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  if (scope === "denied") {
    res.status(403).json({ error: "You can manage assignments only in programs assigned to you." });
    return;
  }
  if (!(await hasAssignmentSchema(res, false))) return;
  if (!(await hasAssignmentAuditSchema(res))) return;
  const roles = [...new Set(body.data.roles)];
  const [target] = await db.select({ id: staffMembersTable.id, email: staffMembersTable.email, role: staffMembersTable.role })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.id, params.data.staffId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  if (target.role === "coordinator") {
    res.status(400).json({ error: "Admins do not need specialist program-role assignments." });
    return;
  }
  if (current.role !== "coordinator" && target.id === current.id) {
    res.status(403).json({ error: "Project staff cannot assign specialist roles to their own account." });
    return;
  }
  const [program] = await db.select({ name: programsTable.name })
    .from(programsTable)
    .where(eq(programsTable.id, params.data.programId))
    .limit(1);
  await db.transaction(async (tx) => {
    const previousRoleRows = await tx.select({ role: staffProgramRolesTable.role })
      .from(staffProgramRolesTable)
      .where(and(
        eq(staffProgramRolesTable.staffId, params.data.staffId),
        eq(staffProgramRolesTable.programId, params.data.programId),
      ))
      .for("update");
    const previousRoles = previousRoleRows.map(({ role }) => role).sort();
    const nextRoles = [...roles].sort();
    await tx.delete(staffProgramRolesTable).where(and(
      eq(staffProgramRolesTable.staffId, params.data.staffId),
      eq(staffProgramRolesTable.programId, params.data.programId),
    ));
    if (roles.length) {
      await tx.insert(staffProgramRolesTable).values(roles.map((role) => ({
        staffId: params.data.staffId,
        programId: params.data.programId,
        role,
        assignedByStaffId: current.id,
      })));
    }
    const auditEvent = makeStaffRoleAuditEvent({
        programId: params.data.programId,
        programName: program?.name ?? `Program ${params.data.programId}`,
        actorStaffId: current.id,
        actorEmail: current.email,
        affectedStaffId: target.id,
        affectedAccountEmail: target.email,
        applicationId: null,
        affectedApplicationName: null,
      }, previousRoles, nextRoles);
    if (auditEvent) await tx.insert(staffAssignmentAuditEventsTable).values(auditEvent);
  });
  res.json(UpdateProgramStaffRolesResponse.parse({
    staffId: params.data.staffId,
    programId: params.data.programId,
    roles,
  }));
});

router.put("/programs/:programId/participant-business-membership", requireOperationsStaff, async (req, res): Promise<void> => {
  const params = AssignParticipantBusinessParams.safeParse(req.params);
  const body = AssignParticipantBusinessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const current = res.locals.staff as StaffAccess;
  const scope = await canManageProgram(params.data.programId, current);
  if (scope === "missing") {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  if (scope === "denied") {
    res.status(403).json({ error: "You can manage assignments only in programs assigned to you." });
    return;
  }
  if (!(await hasAssignmentSchema(res, false))) return;
  if (!(await hasAssignmentAuditSchema(res))) return;

  const [participant] = await db.select({
    id: applicationsTable.id,
    businessId: applicationsTable.businessId,
    founderName: applicationsTable.founderName,
  }).from(applicationsTable)
    .where(and(
      eq(applicationsTable.id, body.data.applicationId),
      eq(applicationsTable.programId, params.data.programId),
      eq(applicationsTable.status, "accepted"),
    ))
    .limit(1);
  if (!participant) {
    res.status(404).json({ error: "Accepted participant not found in this program." });
    return;
  }
  if (body.data.businessId !== null) {
    const [business] = await db.select({ id: businessesTable.id })
      .from(businessesTable)
      .where(and(
        eq(businessesTable.id, body.data.businessId),
        eq(businessesTable.programId, params.data.programId),
      ))
      .limit(1);
    if (!business) {
      res.status(400).json({ error: "Choose a business from this program." });
      return;
    }
    if (participant.businessId !== null && participant.businessId !== body.data.businessId) {
      res.status(400).json({ error: "A business founder cannot be moved away from their application's business." });
      return;
    }
  } else if (participant.businessId !== null) {
    res.status(400).json({ error: "A business founder cannot be unassigned from their application's business." });
    return;
  }

  const [program] = await db.select({ name: programsTable.name })
    .from(programsTable)
    .where(eq(programsTable.id, params.data.programId))
    .limit(1);
  await db.transaction(async (tx) => {
    const [existingMembership] = await tx.select({
      businessId: participantBusinessMembershipsTable.businessId,
    }).from(participantBusinessMembershipsTable)
      .where(eq(participantBusinessMembershipsTable.applicationId, participant.id))
      .for("update");
    const nextBusinessId = participant.businessId === null ? body.data.businessId : null;
    const previousBusinessId = existingMembership?.businessId ?? null;
    if (previousBusinessId !== nextBusinessId) {
      const businessIds = [...new Set([previousBusinessId, nextBusinessId].filter((id): id is number => id !== null))];
      const businessRows = businessIds.length
        ? await tx.select({ id: businessesTable.id, businessName: businessesTable.businessName })
          .from(businessesTable)
          .where(inArray(businessesTable.id, businessIds))
        : [];
      const businessNames = new Map(businessRows.map(({ id, businessName }) => [id, businessName]));
      const auditEvent = makeBusinessTeamAuditEvent({
        programId: params.data.programId,
        programName: program?.name ?? `Program ${params.data.programId}`,
        actorStaffId: current.id,
        actorEmail: current.email,
        affectedStaffId: null,
        affectedAccountEmail: null,
        applicationId: participant.id,
        affectedApplicationName: participant.founderName,
      }, {
        id: previousBusinessId,
        name: previousBusinessId === null ? null : businessNames.get(previousBusinessId) ?? null,
      }, {
        id: nextBusinessId,
        name: nextBusinessId === null ? null : businessNames.get(nextBusinessId) ?? null,
      });
      if (auditEvent) await tx.insert(staffAssignmentAuditEventsTable).values(auditEvent);
    }
    await tx.delete(participantBusinessMembershipsTable)
      .where(eq(participantBusinessMembershipsTable.applicationId, participant.id));
    if (body.data.businessId !== null && participant.businessId === null) {
      await tx.insert(participantBusinessMembershipsTable).values({
        applicationId: participant.id,
        businessId: body.data.businessId,
        assignedByStaffId: current.id,
      });
    }
  });
  res.json(AssignParticipantBusinessResponse.parse({
    applicationId: participant.id,
    businessId: participant.businessId ?? body.data.businessId,
  }));
});

router.get("/staff/mentor-booking-status", requireCoordinator, async (_req, res): Promise<void> => {
  const primaryMentors = await db.select({ staffId: staffMembersTable.id })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.role, "mentor"));
  let programMentors: { staffId: number }[] = [];
  try {
    programMentors = await db.select({ staffId: staffProgramRolesTable.staffId })
      .from(staffProgramRolesTable)
      .innerJoin(programsTable, eq(programsTable.id, staffProgramRolesTable.programId))
      .where(and(
        eq(staffProgramRolesTable.role, "mentor"),
        isNull(programsTable.archivedAt),
      ));
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
  }
  const mentorIds = [...new Set([
    ...primaryMentors.map(({ staffId }) => staffId),
    ...programMentors.map(({ staffId }) => staffId),
  ])];
  const mentors = mentorIds.length ? await db.select({
    staffId: staffMembersTable.id,
    email: staffMembersTable.email,
    status: staffMembersTable.status,
    bookingProvider: staffMembersTable.bookingProvider,
    calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
    calendlyFollowUpDate: staffMembersTable.calendlyFollowUpDate,
    calendlyFollowUpNote: staffMembersTable.calendlyFollowUpNote,
    googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
  }).from(staffMembersTable)
    .where(inArray(staffMembersTable.id, mentorIds))
    .orderBy(asc(staffMembersTable.email)) : [];

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
    role: staffMembersTable.role,
    calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
  }).from(staffMembersTable)
    .where(eq(staffMembersTable.id, params.data.id))
    .limit(1);
  if (!mentor || (mentor.role !== "mentor" && !await hasAnyProgramStaffRole(params.data.id, "mentor"))) {
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
    res.status(400).json({ error: "Admins have global access and cannot have program assignments." });
    return;
  }
  let programNames = new Map<number, string>();
  if (programIds.length > 0) {
    const activePrograms = await db.select({ id: programsTable.id, name: programsTable.name }).from(programsTable)
      .where(and(inArray(programsTable.id, programIds), isNull(programsTable.archivedAt)));
    if (activePrograms.length !== programIds.length) {
      res.status(400).json({ error: "Choose only active programs." });
      return;
    }
    programNames = new Map(activePrograms.map(({ id, name }) => [id, name]));
  }
  const current = res.locals.staff as StaffAccess;
  const roleSchemaAvailable = await specialistRoleTableAvailable();
  const primarySpecialistRole = isProgramSpecialistRole(parsed.data.role) ? parsed.data.role : null;
  if (roleSchemaAvailable && primarySpecialistRole && programIds.length && !(await hasAssignmentAuditSchema(res))) return;
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
      if (roleSchemaAvailable && primarySpecialistRole) {
        await tx.insert(staffProgramRolesTable).values(programIds.map((programId) => ({
          staffId: created.id,
          programId,
          role: primarySpecialistRole,
          assignedByStaffId: current.id,
        }))).onConflictDoNothing();
        for (const programId of programIds) {
          const auditEvent = makeStaffRoleAuditEvent({
            programId,
            programName: programNames.get(programId) ?? `Program ${programId}`,
            actorStaffId: current.id,
            actorEmail: current.email,
            affectedStaffId: created.id,
            affectedAccountEmail: created.email,
            applicationId: null,
            affectedApplicationName: null,
          }, [], [primarySpecialistRole]);
          if (auditEvent) await tx.insert(staffAssignmentAuditEventsTable).values(auditEvent);
        }
      }
    }
    return created;
  });
  if (!member) {
    res.status(409).json({ error: "This email already has staff access." });
    return;
  }

  const [memberWithAssignments] = await withProgramIds([member]);
  res.status(201).json(CreateStaffResponse.parse(memberWithAssignments));
});

router.patch("/staff/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  const body = UpdateStaffBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }

  const current = res.locals.staff as { id: number; email: string };
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
      res.status(400).json({ error: "At least one admin must remain." });
      return;
    }
  }

  const existingAssignments = await db.select({ programId: staffProgramAssignmentsTable.programId })
    .from(staffProgramAssignmentsTable)
    .where(eq(staffProgramAssignmentsTable.staffId, params.data.id));
  const programIds = body.data.role === "coordinator"
    ? []
    : [...new Set(body.data.programIds ?? existingAssignments.map(({ programId }) => programId))];
  let programNames = new Map<number, string>();
  if (body.data.role === "coordinator" && (body.data.programIds?.length ?? 0) > 0) {
    res.status(400).json({ error: "Admins have global access and cannot have program assignments." });
    return;
  }
  if (programIds.length > 0) {
    const activePrograms = await db.select({ id: programsTable.id, name: programsTable.name }).from(programsTable)
      .where(and(inArray(programsTable.id, programIds), isNull(programsTable.archivedAt)));
    if (activePrograms.length !== programIds.length) {
      res.status(400).json({ error: "Choose only active programs." });
      return;
    }
    programNames = new Map(activePrograms.map(({ id, name }) => [id, name]));
  } else {
    programNames = new Map();
  }
  const roleSchemaAvailable = await specialistRoleTableAvailable();
  const previousSpecialistRole = isProgramSpecialistRole(target.role) ? target.role : null;
  const nextSpecialistRole = isProgramSpecialistRole(body.data.role) ? body.data.role : null;
  if (roleSchemaAvailable && body.data.role !== target.role && !(await hasAssignmentAuditSchema(res))) return;
  const [member] = await db.transaction(async (tx) => {
    const previousRoleRows = roleSchemaAvailable ? await tx.select({
      programId: staffProgramRolesTable.programId,
      role: staffProgramRolesTable.role,
    }).from(staffProgramRolesTable)
      .where(eq(staffProgramRolesTable.staffId, params.data.id))
      .for("update") : [];
    const previousRolesByProgram = new Map<number, Set<ProgramSpecialistRole>>();
    previousRoleRows.forEach(({ programId, role }) => {
      const roles = previousRolesByProgram.get(programId) ?? new Set<ProgramSpecialistRole>();
      roles.add(role);
      previousRolesByProgram.set(programId, roles);
    });
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
    if (roleSchemaAvailable && body.data.role !== target.role) {
      if (previousSpecialistRole) {
        await tx.delete(staffProgramRolesTable)
          .where(and(
            eq(staffProgramRolesTable.staffId, params.data.id),
            eq(staffProgramRolesTable.role, previousSpecialistRole),
          ));
      }
      if (nextSpecialistRole && programIds.length > 0) {
        await tx.insert(staffProgramRolesTable).values(programIds.map((programId) => ({
          staffId: params.data.id,
          programId,
          role: nextSpecialistRole,
          assignedByStaffId: current.id,
        }))).onConflictDoNothing();
      }
    }
    if (roleSchemaAvailable && body.data.role !== target.role) {
      const nextRolesByProgram = new Map(
        [...previousRolesByProgram].map(([programId, roles]) => [programId, new Set(roles)]),
      );
      if (previousSpecialistRole) {
        for (const [programId, roles] of nextRolesByProgram) roles.delete(previousSpecialistRole);
      }
      if (nextSpecialistRole) {
        for (const programId of programIds) {
          const roles = nextRolesByProgram.get(programId) ?? new Set<ProgramSpecialistRole>();
          roles.add(nextSpecialistRole);
          nextRolesByProgram.set(programId, roles);
        }
      }
      const affectedProgramIds = [...new Set([
        ...previousRolesByProgram.keys(),
        ...nextRolesByProgram.keys(),
      ])];
      const missingProgramIds = affectedProgramIds.filter((programId) => !programNames.has(programId));
      if (missingProgramIds.length) {
        const archivedPrograms = await tx.select({ id: programsTable.id, name: programsTable.name })
          .from(programsTable)
          .where(inArray(programsTable.id, missingProgramIds));
        archivedPrograms.forEach(({ id, name }) => programNames.set(id, name));
      }
      for (const programId of affectedProgramIds) {
        const previousRoles = [...(previousRolesByProgram.get(programId) ?? [])].sort();
        const nextRoles = [...(nextRolesByProgram.get(programId) ?? [])].sort();
        const auditEvent = makeStaffRoleAuditEvent({
          programId,
          programName: programNames.get(programId) ?? `Program ${programId}`,
          actorStaffId: current.id,
          actorEmail: current.email,
          affectedStaffId: target.id,
          affectedAccountEmail: target.email,
          applicationId: null,
          affectedApplicationName: null,
        }, previousRoles, nextRoles);
        if (auditEvent) await tx.insert(staffAssignmentAuditEventsTable).values(auditEvent);
      }
    }
    return [updated];
  });
  if (!member) {
    res.status(404).json({ error: "Staff member not found." });
    return;
  }
  const [memberWithAssignments] = await withProgramIds([member]);
  res.json(UpdateStaffResponse.parse(memberWithAssignments));
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
      res.status(400).json({ error: "At least one admin must remain." });
      return;
    }
  }

  const roleSchemaAvailable = await specialistRoleTableAvailable();
  if (roleSchemaAvailable && !(await hasAssignmentAuditSchema(res))) return;
  await db.transaction(async (tx) => {
    if (roleSchemaAvailable) {
      const assignments = await tx.select({
        programId: staffProgramRolesTable.programId,
        role: staffProgramRolesTable.role,
      }).from(staffProgramRolesTable)
        .where(eq(staffProgramRolesTable.staffId, params.data.id))
        .for("update");
      const byProgram = new Map<number, ProgramSpecialistRole[]>();
      assignments.forEach(({ programId, role }) => {
        const roles = byProgram.get(programId) ?? [];
        roles.push(role);
        byProgram.set(programId, roles);
      });
      const programIds = [...byProgram.keys()];
      const programs = programIds.length ? await tx.select({ id: programsTable.id, name: programsTable.name })
        .from(programsTable)
        .where(inArray(programsTable.id, programIds)) : [];
      const programNames = new Map(programs.map(({ id, name }) => [id, name]));
      for (const [programId, roles] of byProgram) {
        const auditEvent = makeStaffRoleAuditEvent({
          programId,
          programName: programNames.get(programId) ?? `Program ${programId}`,
          actorStaffId: current.id,
          actorEmail: (res.locals.staff as StaffAccess).email,
          affectedStaffId: target.id,
          affectedAccountEmail: target.email,
          applicationId: null,
          affectedApplicationName: null,
        }, roles, []);
        if (auditEvent) await tx.insert(staffAssignmentAuditEventsTable).values(auditEvent);
      }
    }
    await tx.delete(staffMembersTable).where(eq(staffMembersTable.id, params.data.id));
  });
  res.sendStatus(204);
});

export default router;
