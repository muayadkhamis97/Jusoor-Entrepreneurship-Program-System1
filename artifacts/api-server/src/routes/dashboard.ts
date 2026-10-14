import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sum } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  businessesTable,
  db,
  pitchesTable,
  programsTable,
  sessionsTable,
  supportTable,
} from "@workspace/db";
import { activeProgramIdsFor } from "../lib/programScope";
import type { StaffAccess } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programIds = await activeProgramIdsFor(staff);
  const businesses = programIds.length
    ? await db.select({ id: businessesTable.id }).from(businessesTable)
      .where(inArray(businessesTable.programId, programIds))
    : [];
  const businessIds = businesses.map(({ id }) => id);
  const sessionScope = staff.role === "coordinator"
    ? (programIds.length
      ? or(isNull(sessionsTable.programId), inArray(sessionsTable.programId, programIds))!
      : isNull(sessionsTable.programId))
    : (programIds.length ? inArray(sessionsTable.programId, programIds) : eq(sessionsTable.programId, -1));
  const businessScope = programIds.length
    ? inArray(businessesTable.programId, programIds)
    : eq(businessesTable.programId, -1);
  const supportScope = businessIds.length
    ? inArray(supportTable.businessId, businessIds)
    : eq(supportTable.businessId, -1);
  const pitchScope = businessIds.length
    ? inArray(pitchesTable.businessId, businessIds)
    : eq(pitchesTable.businessId, -1);
  const [
    [programTotal],
    [applicationTotal],
    [incubatorTotal],
    [supportTotal],
    [grantTotal],
    [grantSum],
    stages,
    upcomingSessions,
    recentBusinesses,
  ] = await Promise.all([
    db.select({ value: count() }).from(programsTable).where(inArray(programsTable.id, programIds)),
    db.select({ value: count() }).from(businessesTable)
      .where(and(businessScope, eq(businessesTable.stage, "application"))),
    db.select({ value: count() }).from(businessesTable)
      .where(and(businessScope, inArray(businessesTable.stage, ["incubator", "pitch", "demo_day", "grant_awarded"]))),
    db.select({ value: count() }).from(supportTable)
      .where(and(supportScope, inArray(supportTable.status, ["requested", "matched", "scheduled"]))),
    db.select({ value: count() }).from(pitchesTable)
      .where(and(pitchScope, eq(pitchesTable.grantDecision, "awarded"))),
    db.select({ value: sum(pitchesTable.grantAmount) }).from(pitchesTable)
      .where(and(pitchScope, eq(pitchesTable.grantDecision, "awarded"))),
    db.select({ stage: businessesTable.stage, value: count() }).from(businessesTable)
      .where(businessScope).groupBy(businessesTable.stage),
    db.select().from(sessionsTable)
      .where(and(sessionScope, eq(sessionsTable.status, "scheduled"), gte(sessionsTable.scheduledDate, new Date().toISOString().slice(0, 10))))
      .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime))
      .limit(5),
    db.select().from(businessesTable).where(businessScope).orderBy(desc(businessesTable.createdAt)).limit(5),
  ]);

  const dashboard = {
    programs: programTotal.value,
    applications: applicationTotal.value,
    incubatorBusinesses: incubatorTotal.value,
    supportInProgress: supportTotal.value,
    grantsAwarded: grantTotal.value,
    totalGrantAmount: Number(grantSum.value ?? 0),
    stageCounts: stages.map(({ stage, value }) => ({ stage, count: value })),
    upcomingSessions,
    recentBusinesses,
  };
  res.json(GetDashboardResponse.parse(dashboard));
});

export default router;
