import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, inArray, sum } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import {
  businessesTable,
  db,
  pitchesTable,
  programsTable,
  sessionsTable,
  supportTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
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
    db.select({ value: count() }).from(programsTable),
    db.select({ value: count() }).from(businessesTable).where(eq(businessesTable.stage, "application")),
    db.select({ value: count() }).from(businessesTable)
      .where(inArray(businessesTable.stage, ["incubator", "pitch", "demo_day", "grant_awarded"])),
    db.select({ value: count() }).from(supportTable).where(inArray(supportTable.status, ["requested", "matched", "scheduled"])),
    db.select({ value: count() }).from(pitchesTable).where(eq(pitchesTable.grantDecision, "awarded")),
    db.select({ value: sum(pitchesTable.grantAmount) }).from(pitchesTable).where(eq(pitchesTable.grantDecision, "awarded")),
    db.select({ stage: businessesTable.stage, value: count() }).from(businessesTable).groupBy(businessesTable.stage),
    db.select().from(sessionsTable)
      .where(and(eq(sessionsTable.status, "scheduled"), gte(sessionsTable.scheduledDate, new Date().toISOString().slice(0, 10))))
      .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime))
      .limit(5),
    db.select().from(businessesTable).orderBy(desc(businessesTable.createdAt)).limit(5),
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
