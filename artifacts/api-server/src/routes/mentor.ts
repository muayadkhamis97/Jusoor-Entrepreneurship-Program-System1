import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  DisconnectGoogleCalendarResponse,
  GetMentorDashboardResponse,
  UpdateMentorBookingSettingsBody,
  UpdateMentorBookingSettingsResponse,
  UpdateAssignedMentoringBody,
  UpdateAssignedMentoringParams,
  UpdateAssignedMentoringResponse,
} from "@workspace/api-zod";
import { businessesTable, db, programsTable, staffMembersTable, supportTable } from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import { activeProgramIdsFor } from "../lib/programScope";
import { isGoogleCalendarBookingUrl } from "../lib/googleCalendarBookingUrl";

const router: IRouter = Router();

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
