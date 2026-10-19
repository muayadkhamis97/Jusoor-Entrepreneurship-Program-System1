import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  DisconnectGoogleCalendarResponse,
  GetMentorDashboardResponse,
  UpdateMentorBookingSettingsBody,
  UpdateMentorBookingSettingsResponse,
  UpdateAssignedMentoringBody,
  UpdateAssignedMentoringParams,
  UpdateAssignedMentoringResponse,
  GetMentorMeetingReportsParams,
  GetMentorMeetingReportsResponse,
  GetStaffMentorMeetingReportCoachesQueryParams,
  GetStaffMentorMeetingReportCoachesResponse,
  GetStaffMentorMeetingReportsQueryParams,
  GetStaffMentorMeetingReportsResponse,
  SubmitMentorMeetingReportBody,
  SubmitMentorMeetingReportParams,
  SubmitMentorMeetingReportResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  db,
  calendlyMeetingsTable,
  googleCalendarMeetingsTable,
  mentorMeetingReportsTable,
  participantBusinessMembershipsTable,
  programsTable,
  staffMembersTable,
  supportTable,
  userProfilesTable,
} from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import { activeProgramIdsFor } from "../lib/programScope";
import { isGoogleCalendarBookingUrl } from "../lib/googleCalendarBookingUrl";

const router: IRouter = Router();
export const staffMentorMeetingReportsRouter: IRouter = Router();

type AssignedMeetingBusiness = { id: number; businessId: number; businessName: string; programId: number };

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function meetingCalendarDate(value: Date, timezone: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const dateParts = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function reportProvider(report: { calendlyMeetingId: number | null; googleCalendarMeetingId: number | null }) {
  if (report.calendlyMeetingId !== null) return "calendly" as const;
  if (report.googleCalendarMeetingId !== null) return "google_calendar" as const;
  return "manual" as const;
}

function reportMeetingId(report: { calendlyMeetingId: number | null; googleCalendarMeetingId: number | null }) {
  return report.calendlyMeetingId ?? report.googleCalendarMeetingId;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "23505";
}

async function findAssignedMeetingBusiness(id: number, staff: StaffAccess, programIds: number[]): Promise<AssignedMeetingBusiness | null> {
  if (!programIds.length || staff.status !== "active" || staff.role !== "mentor") return null;
  const [business] = await db.select({
    id: supportTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    programId: businessesTable.programId,
  }).from(supportTable)
    .innerJoin(businessesTable, eq(supportTable.businessId, businessesTable.id))
    .where(and(
      eq(supportTable.id, id),
      eq(supportTable.mentorStaffId, staff.id),
      inArray(businessesTable.programId, programIds),
    )).limit(1);
  return business ?? null;
}

async function assignedBusinessMembers(business: AssignedMeetingBusiness) {
  return db.select({
    applicationId: applicationsTable.id,
    name: applicationsTable.founderName,
  }).from(applicationsTable)
    .leftJoin(
      participantBusinessMembershipsTable,
      eq(participantBusinessMembershipsTable.applicationId, applicationsTable.id),
    )
    .where(and(
      eq(applicationsTable.programId, business.programId),
      eq(applicationsTable.status, "accepted"),
      or(
        eq(applicationsTable.businessId, business.businessId),
        eq(participantBusinessMembershipsTable.businessId, business.businessId),
      ),
    ))
    .orderBy(asc(applicationsTable.founderName), asc(applicationsTable.id));
}

async function coachIdentity(staff: StaffAccess, req: Request) {
  let name = "";
  const [member] = await db.select({
    clerkUserId: staffMembersTable.clerkUserId,
    displayName: userProfilesTable.displayName,
  }).from(staffMembersTable)
    .leftJoin(userProfilesTable, eq(userProfilesTable.userId, staffMembersTable.clerkUserId))
    .where(and(
      eq(staffMembersTable.id, staff.id),
      eq(staffMembersTable.role, "mentor"),
      eq(staffMembersTable.status, "active"),
    )).limit(1);
  if (member?.clerkUserId) {
    const profile = member;
    name = profile?.displayName?.trim() ?? "";
    if (!name) {
      try {
        const user = await clerkClient.users.getUser(member.clerkUserId);
        name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      } catch (error) {
        req.log.warn({ err: error }, "Could not read mentor name for meeting report");
      }
    }
  }
  return { coachName: name || staff.email.split("@")[0] || staff.email, coachEmail: staff.email };
}

staffMentorMeetingReportsRouter.get("/mentor-meeting-report-coaches", async (req, res): Promise<void> => {
  const query = GetStaffMentorMeetingReportCoachesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await activeProgramIdsFor(staff);
  if (!programIds.includes(query.data.programId)) {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  const filters = [
    eq(programsTable.id, query.data.programId),
    eq(supportTable.type, "mentor"),
    inArray(businessesTable.programId, programIds),
  ];
  if (query.data.businessId !== undefined) {
    filters.push(eq(businessesTable.id, query.data.businessId));
  }
  const coaches = await db.selectDistinct({
    coachName: mentorMeetingReportsTable.coachName,
    coachEmail: mentorMeetingReportsTable.coachEmail,
  }).from(mentorMeetingReportsTable)
    .innerJoin(supportTable, eq(supportTable.id, mentorMeetingReportsTable.supportId))
    .innerJoin(businessesTable, eq(businessesTable.id, supportTable.businessId))
    .innerJoin(programsTable, eq(programsTable.id, businessesTable.programId))
    .where(and(...filters))
    .orderBy(asc(mentorMeetingReportsTable.coachName), asc(mentorMeetingReportsTable.coachEmail));
  res.json(GetStaffMentorMeetingReportCoachesResponse.parse(coaches));
});

staffMentorMeetingReportsRouter.get("/mentor-meeting-reports", async (req, res): Promise<void> => {
  const query = GetStaffMentorMeetingReportsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await activeProgramIdsFor(staff);
  if (!programIds.includes(query.data.programId)) {
    res.status(404).json({ error: "Program not found or not assigned." });
    return;
  }
  if (
    (query.data.meetingDateFrom !== undefined && !isCalendarDate(query.data.meetingDateFrom)) ||
    (query.data.meetingDateTo !== undefined && !isCalendarDate(query.data.meetingDateTo)) ||
    (query.data.meetingDateFrom !== undefined && query.data.meetingDateTo !== undefined &&
      query.data.meetingDateFrom > query.data.meetingDateTo)
  ) {
    res.status(400).json({ error: "Meeting date range is invalid." });
    return;
  }
  const filters = [
    eq(programsTable.id, query.data.programId),
    eq(supportTable.type, "mentor"),
    inArray(businessesTable.programId, programIds),
  ];
  if (query.data.businessId !== undefined) {
    filters.push(eq(businessesTable.id, query.data.businessId));
  }
  if (query.data.coachEmail !== undefined) {
    filters.push(eq(mentorMeetingReportsTable.coachEmail, query.data.coachEmail));
  }
  if (query.data.meetingDateFrom !== undefined) {
    filters.push(gte(mentorMeetingReportsTable.meetingDate, query.data.meetingDateFrom));
  }
  if (query.data.meetingDateTo !== undefined) {
    filters.push(lte(mentorMeetingReportsTable.meetingDate, query.data.meetingDateTo));
  }
  const reports = await db.select({
    id: mentorMeetingReportsTable.id,
    calendlyMeetingId: mentorMeetingReportsTable.calendlyMeetingId,
    googleCalendarMeetingId: mentorMeetingReportsTable.googleCalendarMeetingId,
    coachName: mentorMeetingReportsTable.coachName,
    coachEmail: mentorMeetingReportsTable.coachEmail,
    businessName: mentorMeetingReportsTable.businessName,
    meetingDate: mentorMeetingReportsTable.meetingDate,
    attendees: mentorMeetingReportsTable.attendees,
    sessionSummary: mentorMeetingReportsTable.sessionSummary,
    smartGrowActions: mentorMeetingReportsTable.smartGrowActions,
    achievementsAndOpportunities: mentorMeetingReportsTable.achievementsAndOpportunities,
    teamRecommendations: mentorMeetingReportsTable.teamRecommendations,
    submittedAt: mentorMeetingReportsTable.submittedAt,
    programId: programsTable.id,
    programName: programsTable.name,
    businessId: businessesTable.id,
  }).from(mentorMeetingReportsTable)
    .innerJoin(supportTable, eq(supportTable.id, mentorMeetingReportsTable.supportId))
    .innerJoin(businessesTable, eq(businessesTable.id, supportTable.businessId))
    .innerJoin(programsTable, eq(programsTable.id, businessesTable.programId))
    .where(and(...filters))
    .orderBy(desc(mentorMeetingReportsTable.meetingDate), desc(mentorMeetingReportsTable.id));
  res.json(GetStaffMentorMeetingReportsResponse.parse(reports.map((report) => ({
    ...report,
    meetingProvider: reportProvider(report),
    meetingId: reportMeetingId(report),
  }))));
});

router.get("/support/:id/meeting-reports", async (req, res): Promise<void> => {
  const params = GetMentorMeetingReportsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await activeProgramIdsFor(staff);
  const business = await findAssignedMeetingBusiness(params.data.id, staff, programIds);
  if (!business) {
    res.status(404).json({ error: "Engagement is not assigned to this mentor." });
    return;
  }
  const now = new Date();
  const [identity, attendees, reports, calendlyMeetings, googleCalendarMeetings] = await Promise.all([
    coachIdentity(staff, req),
    assignedBusinessMembers(business),
    db.select({
      id: mentorMeetingReportsTable.id,
      calendlyMeetingId: mentorMeetingReportsTable.calendlyMeetingId,
      googleCalendarMeetingId: mentorMeetingReportsTable.googleCalendarMeetingId,
      coachName: mentorMeetingReportsTable.coachName,
      coachEmail: mentorMeetingReportsTable.coachEmail,
      businessName: mentorMeetingReportsTable.businessName,
      meetingDate: mentorMeetingReportsTable.meetingDate,
      attendees: mentorMeetingReportsTable.attendees,
      sessionSummary: mentorMeetingReportsTable.sessionSummary,
      smartGrowActions: mentorMeetingReportsTable.smartGrowActions,
      achievementsAndOpportunities: mentorMeetingReportsTable.achievementsAndOpportunities,
      teamRecommendations: mentorMeetingReportsTable.teamRecommendations,
      submittedAt: mentorMeetingReportsTable.submittedAt,
    }).from(mentorMeetingReportsTable)
      .where(and(
        eq(mentorMeetingReportsTable.supportId, business.id),
        eq(mentorMeetingReportsTable.coachStaffId, staff.id),
      ))
      .orderBy(desc(mentorMeetingReportsTable.meetingDate), desc(mentorMeetingReportsTable.id)),
    db.select({
      id: calendlyMeetingsTable.id,
      eventName: calendlyMeetingsTable.eventName,
      startsAt: calendlyMeetingsTable.startsAt,
      endsAt: calendlyMeetingsTable.endsAt,
      timezone: calendlyMeetingsTable.timezone,
    }).from(calendlyMeetingsTable)
      .where(and(
        eq(calendlyMeetingsTable.businessId, business.businessId),
        eq(calendlyMeetingsTable.mentorStaffId, staff.id),
        eq(calendlyMeetingsTable.status, "confirmed"),
        lte(calendlyMeetingsTable.endsAt, now),
      ))
      .orderBy(desc(calendlyMeetingsTable.startsAt)),
    db.select({
      id: googleCalendarMeetingsTable.id,
      startsAt: googleCalendarMeetingsTable.startsAt,
      endsAt: googleCalendarMeetingsTable.endsAt,
      timezone: googleCalendarMeetingsTable.timezone,
    }).from(googleCalendarMeetingsTable)
      .where(and(
        eq(googleCalendarMeetingsTable.businessId, business.businessId),
        eq(googleCalendarMeetingsTable.mentorStaffId, staff.id),
        eq(googleCalendarMeetingsTable.status, "confirmed"),
        lte(googleCalendarMeetingsTable.endsAt, now),
      ))
      .orderBy(desc(googleCalendarMeetingsTable.startsAt)),
  ]);
  const calendlyReports = new Map(reports
    .filter((report) => report.calendlyMeetingId !== null)
    .map((report) => [report.calendlyMeetingId!, report.id]));
  const googleCalendarReports = new Map(reports
    .filter((report) => report.googleCalendarMeetingId !== null)
    .map((report) => [report.googleCalendarMeetingId!, report.id]));
  res.json(GetMentorMeetingReportsResponse.parse({
    ...identity,
    businessName: business.businessName,
    attendees,
    reports: reports.map((report) => ({
      ...report,
      meetingProvider: reportProvider(report),
      meetingId: reportMeetingId(report),
    })),
    completedMeetings: [
      ...calendlyMeetings.map((meeting) => ({
        meetingProvider: "calendly" as const,
        meetingId: meeting.id,
        eventName: meeting.eventName,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        timezone: meeting.timezone,
        reportId: calendlyReports.get(meeting.id) ?? null,
      })),
      ...googleCalendarMeetings.map((meeting) => ({
        meetingProvider: "google_calendar" as const,
        meetingId: meeting.id,
        eventName: "Google Calendar meeting",
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        timezone: meeting.timezone,
        reportId: googleCalendarReports.get(meeting.id) ?? null,
      })),
    ].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
  }));
});

router.post("/support/:id/meeting-reports", async (req, res): Promise<void> => {
  const params = SubmitMentorMeetingReportParams.safeParse(req.params);
  const body = SubmitMentorMeetingReportBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const programIds = await activeProgramIdsFor(staff);
  const business = await findAssignedMeetingBusiness(params.data.id, staff, programIds);
  if (!business) {
    res.status(404).json({ error: "Engagement is not assigned to this mentor." });
    return;
  }
  if (!isCalendarDate(body.data.meetingDate)) {
    res.status(400).json({ error: "Enter a valid meeting date." });
    return;
  }
  const meetingProvider = body.data.meetingProvider ?? "manual";
  const meetingId = body.data.meetingId;
  if (
    (meetingProvider === "manual" && meetingId !== undefined) ||
    (meetingProvider !== "manual" && (!meetingId || !Number.isInteger(meetingId)))
  ) {
    res.status(400).json({ error: "Choose a valid completed meeting or record a manual meeting." });
    return;
  }
  if (meetingProvider === "calendly" && meetingId) {
    const [meeting] = await db.select({
      id: calendlyMeetingsTable.id,
      startsAt: calendlyMeetingsTable.startsAt,
      timezone: calendlyMeetingsTable.timezone,
    })
      .from(calendlyMeetingsTable)
      .where(and(
        eq(calendlyMeetingsTable.id, meetingId),
        eq(calendlyMeetingsTable.businessId, business.businessId),
        eq(calendlyMeetingsTable.mentorStaffId, staff.id),
        eq(calendlyMeetingsTable.status, "confirmed"),
        lte(calendlyMeetingsTable.endsAt, new Date()),
      ))
      .limit(1);
    if (!meeting) {
      res.status(409).json({ error: "This meeting is not a completed, active occurrence for this engagement." });
      return;
    }
    if (body.data.meetingDate !== meetingCalendarDate(meeting.startsAt, meeting.timezone)) {
      res.status(400).json({ error: "The report date must match the selected meeting occurrence." });
      return;
    }
  } else if (meetingProvider === "google_calendar" && meetingId) {
    const [meeting] = await db.select({
      id: googleCalendarMeetingsTable.id,
      startsAt: googleCalendarMeetingsTable.startsAt,
      timezone: googleCalendarMeetingsTable.timezone,
    })
      .from(googleCalendarMeetingsTable)
      .where(and(
        eq(googleCalendarMeetingsTable.id, meetingId),
        eq(googleCalendarMeetingsTable.businessId, business.businessId),
        eq(googleCalendarMeetingsTable.mentorStaffId, staff.id),
        eq(googleCalendarMeetingsTable.status, "confirmed"),
        lte(googleCalendarMeetingsTable.endsAt, new Date()),
      ))
      .limit(1);
    if (!meeting) {
      res.status(409).json({ error: "This meeting is not a completed, active occurrence for this engagement." });
      return;
    }
    if (body.data.meetingDate !== meetingCalendarDate(meeting.startsAt, meeting.timezone)) {
      res.status(400).json({ error: "The report date must match the selected meeting occurrence." });
      return;
    }
  }
  if (
    body.data.sessionSummary.trim().length < 3 ||
    body.data.smartGrowActions.trim().length < 3 ||
    body.data.achievementsAndOpportunities.trim().length < 3
  ) {
    res.status(400).json({ error: "Complete each required meeting report answer." });
    return;
  }
  const requestedAttendeeIds = [...new Set(body.data.attendeeApplicationIds)];
  if (requestedAttendeeIds.length !== body.data.attendeeApplicationIds.length) {
    res.status(400).json({ error: "Select each attending team member only once." });
    return;
  }
  const [members, identity] = await Promise.all([
    assignedBusinessMembers(business),
    coachIdentity(staff, req),
  ]);
  const allowedNames = new Map(members.map((member) => [member.applicationId, member.name]));
  const attendees = requestedAttendeeIds.map((id) => allowedNames.get(id));
  if (attendees.some((name) => !name)) {
    res.status(400).json({ error: "Choose attending team members from the assigned business." });
    return;
  }
  try {
    const [report] = await db.insert(mentorMeetingReportsTable).values({
      supportId: business.id,
      calendlyMeetingId: meetingProvider === "calendly" ? meetingId! : null,
      googleCalendarMeetingId: meetingProvider === "google_calendar" ? meetingId! : null,
      coachStaffId: staff.id,
      ...identity,
      businessName: business.businessName,
      meetingDate: body.data.meetingDate,
      attendees: attendees as string[],
      sessionSummary: body.data.sessionSummary.trim(),
      smartGrowActions: body.data.smartGrowActions.trim(),
      achievementsAndOpportunities: body.data.achievementsAndOpportunities.trim(),
      teamRecommendations: body.data.teamRecommendations?.trim() || null,
    }).returning({
      id: mentorMeetingReportsTable.id,
      calendlyMeetingId: mentorMeetingReportsTable.calendlyMeetingId,
      googleCalendarMeetingId: mentorMeetingReportsTable.googleCalendarMeetingId,
      coachName: mentorMeetingReportsTable.coachName,
      coachEmail: mentorMeetingReportsTable.coachEmail,
      businessName: mentorMeetingReportsTable.businessName,
      meetingDate: mentorMeetingReportsTable.meetingDate,
      attendees: mentorMeetingReportsTable.attendees,
      sessionSummary: mentorMeetingReportsTable.sessionSummary,
      smartGrowActions: mentorMeetingReportsTable.smartGrowActions,
      achievementsAndOpportunities: mentorMeetingReportsTable.achievementsAndOpportunities,
      teamRecommendations: mentorMeetingReportsTable.teamRecommendations,
      submittedAt: mentorMeetingReportsTable.submittedAt,
    });
    res.status(201).json(SubmitMentorMeetingReportResponse.parse({
      ...report,
      meetingProvider,
      meetingId: reportMeetingId(report),
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A report has already been submitted for this meeting." });
      return;
    }
    throw error;
  }
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programIds = await activeProgramIdsFor(staff);
  if (!programIds.length) {
    res.json(GetMentorDashboardResponse.parse({
      engagements: [],
      bookingProvider: staff.bookingProvider,
      calendlyBookingUrl: staff.calendlyBookingUrl,
      googleCalendarBookingUrl: staff.googleCalendarBookingUrl,
      googleCalendarConnected: Boolean(staff.googleCalendarAccountEmail),
    }));
    return;
  }
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
    .where(and(
      eq(supportTable.mentorStaffId, staff.id),
      inArray(businessesTable.programId, programIds),
    ))
    .orderBy(asc(supportTable.scheduledDate));
  res.json(GetMentorDashboardResponse.parse({
    engagements,
    bookingProvider: staff.bookingProvider,
    calendlyBookingUrl: staff.calendlyBookingUrl,
    googleCalendarBookingUrl: staff.googleCalendarBookingUrl,
    googleCalendarConnected: Boolean(staff.googleCalendarAccountEmail),
  }));
});

router.patch("/booking-settings", async (req, res): Promise<void> => {
  const body = UpdateMentorBookingSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const googleCalendarBookingUrl = body.data.googleCalendarBookingUrl;
  if (
    googleCalendarBookingUrl !== null &&
    !isGoogleCalendarBookingUrl(googleCalendarBookingUrl)
  ) {
    res.status(400).json({ error: "Enter a Google Calendar appointment-schedule link." });
    return;
  }
  if (body.data.bookingProvider === "calendly" && !staff.calendlyBookingUrl) {
    res.status(400).json({ error: "Connect Calendly before selecting it as your booking provider." });
    return;
  }
  if (body.data.bookingProvider === "google_calendar") {
    if (!staff.googleCalendarAccountEmail) {
      res.status(400).json({ error: "Connect Google Calendar before selecting it as your booking provider." });
      return;
    }
    if (!googleCalendarBookingUrl) {
      res.status(400).json({ error: "Add your public Google Calendar appointment-schedule link first." });
      return;
    }
  }

  const [updated] = await db.update(staffMembersTable)
    .set({
      bookingProvider: body.data.bookingProvider,
      googleCalendarBookingUrl,
    })
    .where(and(
      eq(staffMembersTable.id, staff.id),
      eq(staffMembersTable.role, "mentor"),
      eq(staffMembersTable.status, "active"),
    ))
    .returning({
      bookingProvider: staffMembersTable.bookingProvider,
      calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
      googleCalendarBookingUrl: staffMembersTable.googleCalendarBookingUrl,
      googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
    });

  if (!updated) {
    res.status(403).json({ error: "Active mentor access is required." });
    return;
  }

  res.json(DisconnectGoogleCalendarResponse.parse({
    bookingProvider: updated.bookingProvider,
    calendlyBookingUrl: updated.calendlyBookingUrl,
    googleCalendarBookingUrl: updated.googleCalendarBookingUrl,
    googleCalendarConnected: Boolean(updated.googleCalendarAccountEmail),
  }));
});

router.delete("/google-calendar/connection", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const [updated] = await db.update(staffMembersTable)
    .set({
      bookingProvider: "calendly",
      googleCalendarAccountEmail: null,
      googleCalendarBookingUrl: null,
      googleCalendarRefreshTokenEncrypted: null,
      googleCalendarAccessTokenEncrypted: null,
      googleCalendarAccessTokenExpiresAt: null,
      googleCalendarSyncToken: null,
    })
    .where(and(
      eq(staffMembersTable.id, staff.id),
      eq(staffMembersTable.role, "mentor"),
      eq(staffMembersTable.status, "active"),
    ))
    .returning({
      bookingProvider: staffMembersTable.bookingProvider,
      calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
      googleCalendarBookingUrl: staffMembersTable.googleCalendarBookingUrl,
      googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
    });

  if (!updated) {
    res.status(403).json({ error: "Active mentor access is required." });
    return;
  }

  res.json(UpdateMentorBookingSettingsResponse.parse({
    bookingProvider: updated.bookingProvider,
    calendlyBookingUrl: updated.calendlyBookingUrl,
    googleCalendarBookingUrl: updated.googleCalendarBookingUrl,
    googleCalendarConnected: Boolean(updated.googleCalendarAccountEmail),
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
  const programIds = await activeProgramIdsFor(staff);
  if (!programIds.length) {
    res.status(404).json({ error: "Engagement is not assigned to this mentor." });
    return;
  }
  const [updated] = await db.update(supportTable).set(body.data)
    .where(and(
      eq(supportTable.id, params.data.id),
      eq(supportTable.mentorStaffId, staff.id),
      inArray(supportTable.businessId, db.select({ id: businessesTable.id }).from(businessesTable)
        .where(inArray(businessesTable.programId, programIds))),
    ))
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
    .where(and(
      eq(supportTable.id, updated.id),
      inArray(businessesTable.programId, programIds),
    )).limit(1);
  if (!record) {
    res.status(404).json({ error: "Engagement is not assigned to this mentor." });
    return;
  }
  res.json(UpdateAssignedMentoringResponse.parse(record));
});

export default router;
