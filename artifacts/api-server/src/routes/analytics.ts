import { Router, type IRouter } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
} from "drizzle-orm";
import {
  CreateProgramImpactKpiBody,
  CreateProgramImpactKpiResponse,
  CreateProgramAnalyticsReportLayoutBody,
  CreateProgramAnalyticsReportLayoutResponse,
  DeleteProgramAnalyticsReportLayoutParams,
  ListProgramAnalyticsReportLayoutsQueryParams,
  ListProgramAnalyticsReportLayoutsResponse,
  UpdateProgramAnalyticsReportLayoutBody,
  UpdateProgramAnalyticsReportLayoutParams,
  UpdateProgramAnalyticsReportLayoutResponse,
  DeleteProgramImpactKpiParams,
  DeleteProgramImpactKpiResponse,
  GetProgramAnalyticsQueryParams,
  GetProgramAnalyticsResponse,
  GetProgramSessionInteractionAnalyticsQueryParams,
  GetProgramSessionInteractionAnalyticsResponse,
  GetSessionAttendanceRegisterParams,
  GetSessionAttendanceRegisterResponse,
  ImpactKpiDirection,
  ListProgramImpactKpisQueryParams,
  ListProgramImpactKpisResponse,
  QueueZoomAttendanceSyncParams,
  QueueZoomAttendanceSyncResponse,
  ResolveZoomAttendanceParticipantBody,
  ResolveZoomAttendanceParticipantParams,
  ResolveZoomAttendanceParticipantResponse,
  SaveProgramImpactKpiValuesBody,
  SaveProgramImpactKpiValuesParams,
  SaveProgramImpactKpiValuesResponse,
  SaveSessionAttendanceBody,
  SaveSessionAttendanceParams,
  SaveSessionAttendanceResponse,
  UpdateProgramImpactKpiBody,
  UpdateProgramImpactKpiParams,
  UpdateProgramImpactKpiResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  analyticsReportLayoutsTable,
  businessesTable,
  db,
  impactKpiValuesTable,
  impactKpisTable,
  pitchesTable,
  programsTable,
  sessionAttendanceTable,
  sessionInteractiveActivitiesTable,
  sessionInteractiveResponsesTable,
  sessionsTable,
  supportTable,
  trainingAssignmentsTable,
  trainingQuestionsTable,
  trainingSubmissionsTable,
  zoomAttendanceParticipantsTable,
} from "@workspace/db";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";
import { getAdminInvitedApplicationIds } from "../lib/participantInvitations";
import {
  getZoomAttendanceReport,
  queueZoomAttendanceSync,
  resolveZoomAttendanceParticipant,
} from "../lib/zoom-attendance";

const router: IRouter = Router();
router.use(requireCoordinator);

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function timestampStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function timestampEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

type SessionInteractionTrendSource = {
  sessionDate: string;
  status: string;
  responseCount: number;
  eligibleBusinesses: number;
};
type SessionInteractionTrendPoint = {
  periodStart: string;
  periodEnd: string;
  activityCount: number;
  responseCount: number | null;
  eligibleOpportunities: number | null;
  responseRate: number | null;
  responseCountChange: number | null;
  responseRateChange: number | null;
};

export function buildSessionInteractionResponseMetrics(
  status: string,
  responseCount: number,
  eligibleBusinesses: number,
  responseRateThreshold: number,
): { responseRate: number | null; needsFollowUp: boolean } {
  const hasRate = (status === "open" || status === "closed") && eligibleBusinesses > 0;
  const responseRate = hasRate
    ? Math.round(responseCount / eligibleBusinesses * 1000) / 10
    : null;
  return {
    responseRate,
    needsFollowUp: responseRate !== null && responseRate < responseRateThreshold,
  };
}

export function buildSessionInteractionTrend(
  from: string,
  to: string,
  period: "weekly" | "monthly",
  activities: SessionInteractionTrendSource[],
): SessionInteractionTrendPoint[] {
  const startOfPeriod = (date: Date) => {
    const start = new Date(date);
    if (period === "monthly") {
      start.setUTCDate(1);
    } else {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    }
    return start;
  };
  const nextPeriod = (date: Date) => {
    const next = new Date(date);
    if (period === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCDate(next.getUTCDate() + 7);
    return next;
  };
  const buckets = new Map<string, { activityCount: number; responseCount: number; eligibleOpportunities: number }>();
  for (let cursor = startOfPeriod(timestampStart(from)); dateOnly(cursor) <= to; cursor = nextPeriod(cursor)) {
    buckets.set(dateOnly(cursor), { activityCount: 0, responseCount: 0, eligibleOpportunities: 0 });
  }
  for (const activity of activities) {
    if (activity.status === "draft" || activity.eligibleBusinesses <= 0) continue;
    const key = dateOnly(startOfPeriod(timestampStart(activity.sessionDate)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.activityCount += 1;
    bucket.responseCount += activity.responseCount;
    bucket.eligibleOpportunities += activity.eligibleBusinesses;
  }
  const points = [...buckets.entries()].map(([key, bucket]) => {
    const start = timestampStart(key);
    const periodEnd = period === "monthly"
      ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
      : addDays(start, 6);
    const hasEligibleActivities = bucket.activityCount > 0;
    return {
      periodStart: key < from ? from : key,
      periodEnd: dateOnly(periodEnd) > to ? to : dateOnly(periodEnd),
      activityCount: bucket.activityCount,
      responseCount: hasEligibleActivities ? bucket.responseCount : null,
      eligibleOpportunities: hasEligibleActivities ? bucket.eligibleOpportunities : null,
      responseRate: hasEligibleActivities
        ? Math.round(bucket.responseCount / bucket.eligibleOpportunities * 1000) / 10
        : null,
      responseCountChange: null,
      responseRateChange: null,
    };
  });
  return points.map((point, index) => {
    const previous = points[index - 1];
    const comparable = point.activityCount > 0 && (previous?.activityCount ?? 0) > 0;
    return {
      ...point,
      responseCountChange: comparable ? point.responseCount! - previous.responseCount! : null,
      responseRateChange: comparable
        ? Math.round((point.responseRate! - previous.responseRate!) * 10) / 10
        : null,
    };
  });
}

async function getAttendanceRegister(sessionId: number) {
  return getZoomAttendanceReport(sessionId);
}

async function getImpactKpis(programId: number) {
  const kpis = await db.select().from(impactKpisTable)
    .where(eq(impactKpisTable.programId, programId))
    .orderBy(asc(impactKpisTable.name));
  if (kpis.length === 0) return [];

  const values = await db.select({
    kpiId: impactKpiValuesTable.kpiId,
    businessId: impactKpiValuesTable.businessId,
    businessName: businessesTable.businessName,
    value: impactKpiValuesTable.value,
    periodEnd: impactKpiValuesTable.periodEnd,
    notes: impactKpiValuesTable.notes,
    recordedAt: impactKpiValuesTable.recordedAt,
  }).from(impactKpiValuesTable)
    .innerJoin(businessesTable, eq(impactKpiValuesTable.businessId, businessesTable.id))
    .where(inArray(impactKpiValuesTable.kpiId, kpis.map((kpi) => kpi.id)))
    .orderBy(asc(impactKpiValuesTable.periodEnd), asc(impactKpiValuesTable.recordedAt));
  const valuesByKpi = new Map<number, typeof values>();
  for (const value of values) {
    const current = valuesByKpi.get(value.kpiId) ?? [];
    current.push(value);
    valuesByKpi.set(value.kpiId, current);
  }

  return kpis.map((kpi) => ({
    ...kpi,
    values: (valuesByKpi.get(kpi.id) ?? []).map(({ kpiId: _kpiId, ...value }) => value),
  }));
}

router.get("/analytics", async (req, res): Promise<void> => {
  const parsed = GetProgramAnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const today = dateOnly(new Date());
  const from = parsed.data.from ?? dateOnly(addDays(timestampStart(today), -89));
  const to = parsed.data.to ?? today;
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    res.status(400).json({ error: "Choose a valid date range." });
    return;
  }

  const programs = await db.select({ id: programsTable.id, name: programsTable.name })
    .from(programsTable).orderBy(asc(programsTable.name));
  if (parsed.data.programId !== undefined && !programs.some(({ id }) => id === parsed.data.programId)) {
    res.status(404).json({ error: "Program not found." });
    return;
  }

  const programFilter = parsed.data.programId === undefined
    ? undefined
    : eq(businessesTable.programId, parsed.data.programId);
  const applicationProgramFilter = parsed.data.programId === undefined
    ? undefined
    : eq(applicationsTable.programId, parsed.data.programId);
  const sessionProgramFilter = parsed.data.programId === undefined
    ? undefined
    : eq(sessionsTable.programId, parsed.data.programId);
  const businessRows = await db.select({
    id: businessesTable.id,
    businessName: businessesTable.businessName,
    stage: businessesTable.stage,
  }).from(businessesTable).where(programFilter).orderBy(asc(businessesTable.businessName));
  const businessIds = businessRows.map(({ id }) => id);

  const [applications, sessions, assignments, questions, pitches] = await Promise.all([
    db.select({ id: applicationsTable.id, status: applicationsTable.status }).from(applicationsTable).where(and(
      applicationProgramFilter,
      gte(applicationsTable.createdAt, timestampStart(from)),
      lte(applicationsTable.createdAt, timestampEnd(to)),
    )),
    db.select({
      id: sessionsTable.id,
      title: sessionsTable.title,
      scheduledDate: sessionsTable.scheduledDate,
      status: sessionsTable.status,
    }).from(sessionsTable).where(and(
      sessionProgramFilter,
      gte(sessionsTable.scheduledDate, from),
      lte(sessionsTable.scheduledDate, to),
    )).orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime)),
    parsed.data.programId === undefined
      ? db.select({
        id: trainingAssignmentsTable.id,
        programId: trainingAssignmentsTable.programId,
      }).from(trainingAssignmentsTable)
      : db.select({
        id: trainingAssignmentsTable.id,
        programId: trainingAssignmentsTable.programId,
      }).from(trainingAssignmentsTable)
        .where(eq(trainingAssignmentsTable.programId, parsed.data.programId)),
    parsed.data.programId === undefined
      ? db.select({
        businessId: trainingQuestionsTable.businessId,
        reply: trainingQuestionsTable.reply,
        createdAt: trainingQuestionsTable.createdAt,
      }).from(trainingQuestionsTable).where(and(
        gte(trainingQuestionsTable.createdAt, timestampStart(from)),
        lte(trainingQuestionsTable.createdAt, timestampEnd(to)),
      ))
      : db.select({
        businessId: trainingQuestionsTable.businessId,
        reply: trainingQuestionsTable.reply,
        createdAt: trainingQuestionsTable.createdAt,
      }).from(trainingQuestionsTable).where(and(
        eq(trainingQuestionsTable.programId, parsed.data.programId),
        gte(trainingQuestionsTable.createdAt, timestampStart(from)),
        lte(trainingQuestionsTable.createdAt, timestampEnd(to)),
      )),
    parsed.data.programId === undefined
      ? db.select({
        grantDecision: pitchesTable.grantDecision,
        grantAmount: pitchesTable.grantAmount,
        eventDate: pitchesTable.eventDate,
      }).from(pitchesTable)
        .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
        .where(and(
          gte(pitchesTable.eventDate, from),
          lte(pitchesTable.eventDate, to),
        ))
      : db.select({
        grantDecision: pitchesTable.grantDecision,
        grantAmount: pitchesTable.grantAmount,
        eventDate: pitchesTable.eventDate,
      }).from(pitchesTable)
        .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
        .where(and(
          eq(businessesTable.programId, parsed.data.programId),
          gte(pitchesTable.eventDate, from),
          lte(pitchesTable.eventDate, to),
        )),
  ]);
  const invitationIds = await getAdminInvitedApplicationIds(applications.map(({ id }) => id));
  const reportedApplications = applications.filter(({ id }) => !invitationIds.has(id));

  const sessionIds = sessions.map(({ id }) => id);
  const assignmentIds = assignments.map(({ id }) => id);
  const [attendanceRows, submissionRows, supportRows] = await Promise.all([
    sessionIds.length
      ? db.select({
        sessionId: sessionAttendanceTable.sessionId,
        businessId: sessionAttendanceTable.businessId,
        status: sessionAttendanceTable.status,
        markedAt: sessionAttendanceTable.markedAt,
        scheduledDate: sessionsTable.scheduledDate,
      }).from(sessionAttendanceTable)
        .innerJoin(sessionsTable, eq(sessionAttendanceTable.sessionId, sessionsTable.id))
        .where(inArray(sessionAttendanceTable.sessionId, sessionIds))
      : Promise.resolve([]),
    assignmentIds.length
      ? db.select({
        businessId: trainingSubmissionsTable.businessId,
        assignmentId: trainingSubmissionsTable.assignmentId,
        submittedAt: trainingSubmissionsTable.submittedAt,
      }).from(trainingSubmissionsTable)
        .innerJoin(trainingAssignmentsTable, eq(trainingSubmissionsTable.assignmentId, trainingAssignmentsTable.id))
        .where(and(
          inArray(trainingSubmissionsTable.assignmentId, assignmentIds),
          gte(trainingSubmissionsTable.submittedAt, timestampStart(from)),
          lte(trainingSubmissionsTable.submittedAt, timestampEnd(to)),
        ))
      : Promise.resolve([]),
    businessIds.length
      ? db.select({
        businessId: supportTable.businessId,
        status: supportTable.status,
        createdAt: supportTable.createdAt,
      }).from(supportTable)
        .where(and(
          inArray(supportTable.businessId, businessIds),
          gte(supportTable.createdAt, timestampStart(from)),
          lte(supportTable.createdAt, timestampEnd(to)),
        ))
      : Promise.resolve([]),
  ]);

  const stageCountsMap = new Map<string, number>();
  for (const business of businessRows) {
    stageCountsMap.set(business.stage, (stageCountsMap.get(business.stage) ?? 0) + 1);
  }
  const attendanceCounts = { present: 0, absent: 0, excused: 0 };
  const attendanceBySession = new Map<number, { marks: number; present: number }>();
  const attendanceTrendMap = new Map<string, { present: number; absent: number; excused: number }>();
  const engagementMap = new Map<number, {
    sessionsAttended: number;
    sessionsMarked: number;
    assignmentsSubmitted: number;
    questionsAsked: number;
    supportEngagements: number;
    activityDates: Date[];
  }>();
  const ensureEngagement = (businessId: number) => {
    const current = engagementMap.get(businessId) ?? {
      sessionsAttended: 0,
      sessionsMarked: 0,
      assignmentsSubmitted: 0,
      questionsAsked: 0,
      supportEngagements: 0,
      activityDates: [],
    };
    engagementMap.set(businessId, current);
    return current;
  };
  for (const row of attendanceRows) {
    if (row.status === "present" || row.status === "absent" || row.status === "excused") {
      attendanceCounts[row.status] += 1;
    }
    const sessionCount = attendanceBySession.get(row.sessionId) ?? { marks: 0, present: 0 };
    sessionCount.marks += 1;
    if (row.status === "present") sessionCount.present += 1;
    attendanceBySession.set(row.sessionId, sessionCount);
    const month = row.scheduledDate.slice(0, 7);
    const trend = attendanceTrendMap.get(month) ?? { present: 0, absent: 0, excused: 0 };
    if (row.status === "present" || row.status === "absent" || row.status === "excused") {
      trend[row.status] += 1;
      attendanceTrendMap.set(month, trend);
    }
    const engagement = ensureEngagement(row.businessId);
    engagement.sessionsMarked += 1;
    if (row.status === "present") engagement.sessionsAttended += 1;
    engagement.activityDates.push(row.markedAt);
  }
  for (const row of submissionRows) {
    const engagement = ensureEngagement(row.businessId);
    engagement.assignmentsSubmitted += 1;
    engagement.activityDates.push(row.submittedAt);
  }
  for (const row of questions) {
    const engagement = ensureEngagement(row.businessId);
    engagement.questionsAsked += 1;
    engagement.activityDates.push(row.createdAt);
  }
  for (const row of supportRows) {
    const engagement = ensureEngagement(row.businessId);
    engagement.supportEngagements += 1;
    engagement.activityDates.push(row.createdAt);
  }

  const awardedPitches = pitches.filter(({ grantDecision }) => grantDecision === "awarded");
  const assignmentSubmissions = submissionRows.length;
  const possibleSubmissions = assignments.length * businessRows.length;
  const markedCount = attendanceCounts.present + attendanceCounts.absent + attendanceCounts.excused;
  const stageCounts = [...stageCountsMap.entries()].map(([stage, count]) => ({ stage, count }));
  const firstMonth = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  const finalMonth = to.slice(0, 7);
  const attendancePeriods: string[] = [];
  for (const cursor = firstMonth; dateOnly(cursor).slice(0, 7) <= finalMonth; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    attendancePeriods.push(dateOnly(cursor).slice(0, 7));
  }
  const attendanceTrend = attendancePeriods.map((period) => {
    const values = attendanceTrendMap.get(period);
    return values
      ? { period, ...values }
      : { period, present: null, absent: null, excused: null };
  });
  const sessionCountsById = attendanceBySession;
  const engagement = businessRows.map((business) => {
    const metrics = engagementMap.get(business.id);
    const latestActivity = metrics?.activityDates.reduce<Date | null>(
      (latest, candidate) => !latest || candidate > latest ? candidate : latest,
      null,
    ) ?? null;
    return {
      businessId: business.id,
      businessName: business.businessName,
      stage: business.stage,
      sessionsAttended: metrics?.sessionsAttended ?? 0,
      sessionsMarked: metrics?.sessionsMarked ?? 0,
      attendanceRate: metrics && metrics.sessionsMarked > 0
        ? Math.round(metrics.sessionsAttended / metrics.sessionsMarked * 1000) / 10
        : null,
      assignmentsSubmitted: metrics?.assignmentsSubmitted ?? 0,
      assignmentsAvailable: assignments.length,
      questionsAsked: metrics?.questionsAsked ?? 0,
      supportEngagements: metrics?.supportEngagements ?? 0,
      lastActivityAt: latestActivity,
    };
  }).sort((left, right) =>
    (right.lastActivityAt?.getTime() ?? 0) - (left.lastActivityAt?.getTime() ?? 0),
  );
  const parsedOutput = {
    programs,
    selectedProgramId: parsed.data.programId ?? null,
    from,
    to,
    summary: {
      applications: reportedApplications.length,
      acceptedApplications: reportedApplications.filter(({ status }) => status === "accepted").length,
      businesses: businessRows.length,
      activeBusinesses: businessRows.filter(({ stage }) =>
        ["incubator", "pitch", "demo_day", "grant_awarded"].includes(stage),
      ).length,
      sessionsInRange: sessions.length,
      sessionsWithAttendance: attendanceBySession.size,
      attendanceMarks: markedCount,
      ...attendanceCounts,
      attendanceRate: markedCount > 0
        ? Math.round(attendanceCounts.present / markedCount * 1000) / 10
        : null,
      assignments: assignments.length,
      submissions: assignmentSubmissions,
      assignmentCompletionRate: possibleSubmissions > 0
        ? Math.round(Math.min(assignmentSubmissions / possibleSubmissions, 1) * 1000) / 10
        : null,
      questionsAsked: questions.length,
      unansweredQuestions: questions.filter(({ reply }) => reply === null).length,
      completedSupport: supportRows.filter(({ status }) => status === "completed").length,
      grantsAwarded: awardedPitches.length,
      grantAmount: awardedPitches.reduce((total, { grantAmount }) => total + Number(grantAmount ?? 0), 0),
    },
    stageCounts,
    attendanceTrend,
    engagement,
    sessions: sessions.map((session) => {
      const counts = sessionCountsById.get(session.id) ?? { marks: 0, present: 0 };
      return {
        id: session.id,
        title: session.title,
        scheduledDate: session.scheduledDate,
        status: session.status,
        attendanceMarks: counts.marks,
        present: counts.present,
      };
    }),
  };
  res.json(GetProgramAnalyticsResponse.parse(parsedOutput));
});

router.get("/analytics/session-interactions", async (req, res): Promise<void> => {
  const parsed = GetProgramSessionInteractionAnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const today = dateOnly(new Date());
  const from = parsed.data.from ?? dateOnly(addDays(timestampStart(today), -89));
  const to = parsed.data.to ?? today;
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    res.status(400).json({ error: "Choose a valid date range." });
    return;
  }

  if (parsed.data.programId !== undefined) {
    const [program] = await db.select({ id: programsTable.id })
      .from(programsTable)
      .where(eq(programsTable.id, parsed.data.programId))
      .limit(1);
    if (!program) {
      res.status(404).json({ error: "Program not found." });
      return;
    }
  }

  const sessionFilters = [
    gte(sessionsTable.scheduledDate, from),
    lte(sessionsTable.scheduledDate, to),
    ...(parsed.data.programId === undefined
      ? []
      : [eq(sessionsTable.programId, parsed.data.programId)]),
  ];
  const sessions = await db.select({
    id: sessionsTable.id,
    programId: programsTable.id,
    programName: programsTable.name,
    title: sessionsTable.title,
    scheduledDate: sessionsTable.scheduledDate,
  }).from(sessionsTable)
    .innerJoin(programsTable, eq(sessionsTable.programId, programsTable.id))
    .where(and(...sessionFilters))
    .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.title));

  const sessionIds = sessions.map(({ id }) => id);
  const activities = sessionIds.length
    ? await db.select({
      id: sessionInteractiveActivitiesTable.id,
      sessionId: sessionInteractiveActivitiesTable.sessionId,
      type: sessionInteractiveActivitiesTable.type,
      title: sessionInteractiveActivitiesTable.title,
      status: sessionInteractiveActivitiesTable.status,
    }).from(sessionInteractiveActivitiesTable)
      .where(inArray(sessionInteractiveActivitiesTable.sessionId, sessionIds))
      .orderBy(asc(sessionInteractiveActivitiesTable.createdAt))
    : [];
  const filteredActivities = activities.filter((activity) =>
    (activity.type === "poll" || activity.type === "survey")
    && (parsed.data.activityType === undefined || parsed.data.activityType === "all" || activity.type === parsed.data.activityType),
  );
  const activityIds = filteredActivities.map(({ id }) => id);
  const [acceptedBusinesses, responseRows] = await Promise.all([
    sessionIds.length
      ? db.select({
        programId: applicationsTable.programId,
        businessId: applicationsTable.businessId,
      }).from(applicationsTable)
        .where(and(
          eq(applicationsTable.status, "accepted"),
          inArray(applicationsTable.programId, [...new Set(sessions.map(({ programId }) => programId))]),
        ))
      : Promise.resolve([]),
    activityIds.length
      ? db.select({ activityId: sessionInteractiveResponsesTable.activityId })
        .from(sessionInteractiveResponsesTable)
        .where(inArray(sessionInteractiveResponsesTable.activityId, activityIds))
      : Promise.resolve([]),
  ]);

  const eligibleByProgram = new Map<number, Set<number>>();
  for (const enrollment of acceptedBusinesses) {
    if (enrollment.businessId === null) continue;
    const eligible = eligibleByProgram.get(enrollment.programId) ?? new Set<number>();
    eligible.add(enrollment.businessId);
    eligibleByProgram.set(enrollment.programId, eligible);
  }
  const responseCountByActivity = new Map<number, number>();
  for (const response of responseRows) {
    responseCountByActivity.set(
      response.activityId,
      (responseCountByActivity.get(response.activityId) ?? 0) + 1,
    );
  }
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const outputActivities = filteredActivities.flatMap((activity) => {
    const session = sessionById.get(activity.sessionId);
    if (!session) return [];
    const eligibleBusinesses = eligibleByProgram.get(session.programId)?.size ?? 0;
    const responseCount = responseCountByActivity.get(activity.id) ?? 0;
    const responseMetrics = buildSessionInteractionResponseMetrics(
      activity.status,
      responseCount,
      eligibleBusinesses,
      parsed.data.responseRateThreshold,
    );
    return [{
      programId: session.programId,
      programName: session.programName,
      sessionId: session.id,
      sessionTitle: session.title,
      sessionDate: session.scheduledDate,
      activityId: activity.id,
      activityTitle: activity.title,
      type: activity.type,
      status: activity.status,
      responseCount,
      eligibleBusinesses,
      ...responseMetrics,
    }];
  });
  const trend = buildSessionInteractionTrend(
    from,
    to,
    parsed.data.period ?? "weekly",
    outputActivities.map((activity) => ({
      sessionDate: activity.sessionDate,
      status: activity.status,
      responseCount: activity.responseCount,
      eligibleBusinesses: activity.eligibleBusinesses,
    })),
  );

  res.json(GetProgramSessionInteractionAnalyticsResponse.parse({
    from,
    to,
    activities: outputActivities,
    trend,
  }));
});

router.get("/analytics/attendance/:sessionId", async (req, res): Promise<void> => {
  const params = GetSessionAttendanceRegisterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const register = await getAttendanceRegister(params.data.sessionId);
  if (!register) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  res.json(GetSessionAttendanceRegisterResponse.parse(register));
});

router.post("/analytics/attendance/:sessionId", async (req, res): Promise<void> => {
  const params = QueueZoomAttendanceSyncParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [session] = await db.select({
    id: sessionsTable.id,
    zoomMeetingId: sessionsTable.zoomMeetingId,
  }).from(sessionsTable).where(eq(sessionsTable.id, params.data.sessionId)).limit(1);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (!session.zoomMeetingId) {
    res.status(400).json({ error: "This session has no Zoom meeting." });
    return;
  }
  try {
    const sync = await queueZoomAttendanceSync(params.data.sessionId, true);
    res.json(QueueZoomAttendanceSyncResponse.parse(sync));
  } catch (error) {
    req.log.warn({ sessionId: params.data.sessionId }, "Could not queue Zoom attendance sync");
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not queue Zoom attendance sync." });
  }
});

router.patch("/analytics/attendance-participants/:participantId", async (req, res): Promise<void> => {
  const params = ResolveZoomAttendanceParticipantParams.safeParse(req.params);
  const body = ResolveZoomAttendanceParticipantBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const { businessId, ignore } = body.data;
  if ((ignore && businessId !== null) || (!ignore && businessId === null)) {
    res.status(400).json({ error: "Choose a business to match or explicitly ignore this attendee." });
    return;
  }
  const [participant] = await db.select({
    id: zoomAttendanceParticipantsTable.id,
    sessionId: zoomAttendanceParticipantsTable.sessionId,
  }).from(zoomAttendanceParticipantsTable)
    .where(eq(zoomAttendanceParticipantsTable.id, params.data.participantId))
    .limit(1);
  if (!participant) {
    res.status(404).json({ error: "Zoom attendee not found." });
    return;
  }
  const [session] = await db.select({
    id: sessionsTable.id,
    programId: sessionsTable.programId,
  }).from(sessionsTable).where(eq(sessionsTable.id, participant.sessionId)).limit(1);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (businessId !== null) {
    const [business] = await db.select({ id: businessesTable.id }).from(businessesTable)
      .where(and(
        eq(businessesTable.id, businessId),
        eq(businessesTable.programId, session.programId ?? -1),
      )).limit(1);
    if (!business) {
      res.status(400).json({ error: "Choose a business from this session's cohort." });
      return;
    }
  }
  const staff = res.locals.staff as StaffAccess;
  await resolveZoomAttendanceParticipant(params.data.participantId, { businessId, ignore }, staff.id);
  const register = await getAttendanceRegister(participant.sessionId);
  res.json(ResolveZoomAttendanceParticipantResponse.parse(register));
});

router.put("/analytics/attendance/:sessionId", async (req, res): Promise<void> => {
  const params = SaveSessionAttendanceParams.safeParse(req.params);
  const body = SaveSessionAttendanceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const register = await getAttendanceRegister(params.data.sessionId);
  if (!register) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (register.session.programId === null) {
    res.status(400).json({ error: "Assign this session to a program before recording attendance." });
    return;
  }
  const rosterIds = new Set(register.roster.map(({ businessId }) => businessId));
  const submittedIds = new Set<number>();
  for (const record of body.data.records) {
    if (!rosterIds.has(record.businessId) || submittedIds.has(record.businessId)) {
      res.status(400).json({ error: "Attendance records must contain each program business at most once." });
      return;
    }
    submittedIds.add(record.businessId);
  }
  const staff = res.locals.staff as StaffAccess;
  await db.transaction(async (transaction) => {
    for (const record of body.data.records) {
      if (record.status === null) {
        await transaction.delete(sessionAttendanceTable).where(and(
          eq(sessionAttendanceTable.sessionId, params.data.sessionId),
          eq(sessionAttendanceTable.businessId, record.businessId),
        ));
      } else {
        await transaction.insert(sessionAttendanceTable).values({
          sessionId: params.data.sessionId,
          businessId: record.businessId,
          status: record.status,
          notes: record.notes,
          recordedByStaffId: staff.id,
          source: "manual",
          attendedSeconds: null,
          firstJoinedAt: null,
          lastLeftAt: null,
        }).onConflictDoUpdate({
          target: [sessionAttendanceTable.sessionId, sessionAttendanceTable.businessId],
          set: {
            status: record.status,
            notes: record.notes,
            recordedByStaffId: staff.id,
            source: "manual",
            attendedSeconds: null,
            firstJoinedAt: null,
            lastLeftAt: null,
            markedAt: new Date(),
          },
        });
      }
    }
  });
  const updated = await getAttendanceRegister(params.data.sessionId);
  res.json(SaveSessionAttendanceResponse.parse(updated));
});

router.get("/analytics/report-layouts", async (req, res): Promise<void> => {
  const query = ListProgramAnalyticsReportLayoutsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(eq(programsTable.id, query.data.programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  const layouts = await db.select().from(analyticsReportLayoutsTable)
    .where(eq(analyticsReportLayoutsTable.programId, query.data.programId))
    .orderBy(asc(analyticsReportLayoutsTable.name));
  res.json(ListProgramAnalyticsReportLayoutsResponse.parse(layouts));
});

router.post("/analytics/report-layouts", async (req, res): Promise<void> => {
  const body = CreateProgramAnalyticsReportLayoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(eq(programsTable.id, body.data.programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  const name = body.data.name.trim();
  const title = body.data.title.trim();
  if (!name || !title) {
    res.status(400).json({ error: "A report layout name and title are required." });
    return;
  }
  const [duplicate] = await db.select({ id: analyticsReportLayoutsTable.id })
    .from(analyticsReportLayoutsTable).where(and(
      eq(analyticsReportLayoutsTable.programId, body.data.programId),
      eq(analyticsReportLayoutsTable.name, name),
    )).limit(1);
  if (duplicate) {
    res.status(409).json({ error: "A report layout with this name already exists for the program." });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  try {
    const [layout] = await db.insert(analyticsReportLayoutsTable).values({
      ...body.data,
      name,
      title,
      createdByStaffId: staff.id,
    }).returning();
    res.status(201).json(CreateProgramAnalyticsReportLayoutResponse.parse(layout));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A report layout with this name already exists for the program." });
      return;
    }
    throw error;
  }
});

router.patch("/analytics/programs/:programId/report-layouts/:id", async (req, res): Promise<void> => {
  const params = UpdateProgramAnalyticsReportLayoutParams.safeParse(req.params);
  const body = UpdateProgramAnalyticsReportLayoutBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [current] = await db.select().from(analyticsReportLayoutsTable)
    .where(and(
      eq(analyticsReportLayoutsTable.id, params.data.id),
      eq(analyticsReportLayoutsTable.programId, params.data.programId),
    )).limit(1);
  if (!current) {
    res.status(404).json({ error: "Report layout not found for this program." });
    return;
  }
  const name = body.data.name.trim();
  const title = body.data.title.trim();
  if (!name || !title) {
    res.status(400).json({ error: "A report layout name and title are required." });
    return;
  }
  const [duplicate] = await db.select({ id: analyticsReportLayoutsTable.id })
    .from(analyticsReportLayoutsTable).where(and(
      eq(analyticsReportLayoutsTable.programId, params.data.programId),
      eq(analyticsReportLayoutsTable.name, name),
    )).limit(1);
  if (duplicate && duplicate.id !== current.id) {
    res.status(409).json({ error: "A report layout with this name already exists for the program." });
    return;
  }
  try {
    const [layout] = await db.update(analyticsReportLayoutsTable).set({
      name,
      title,
      sections: body.data.sections,
    }).where(and(
      eq(analyticsReportLayoutsTable.id, params.data.id),
      eq(analyticsReportLayoutsTable.programId, params.data.programId),
    )).returning();
    res.json(UpdateProgramAnalyticsReportLayoutResponse.parse(layout));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A report layout with this name already exists for the program." });
      return;
    }
    throw error;
  }
});

router.delete("/analytics/programs/:programId/report-layouts/:id", async (req, res): Promise<void> => {
  const params = DeleteProgramAnalyticsReportLayoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(analyticsReportLayoutsTable).where(and(
    eq(analyticsReportLayoutsTable.id, params.data.id),
    eq(analyticsReportLayoutsTable.programId, params.data.programId),
  )).returning({ id: analyticsReportLayoutsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Report layout not found for this program." });
    return;
  }
  res.status(204).end();
});

router.get("/analytics/kpis", async (req, res): Promise<void> => {
  const parsed = ListProgramImpactKpisQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(eq(programsTable.id, parsed.data.programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  res.json(ListProgramImpactKpisResponse.parse(await getImpactKpis(parsed.data.programId)));
});

router.post("/analytics/kpis", async (req, res): Promise<void> => {
  const body = CreateProgramImpactKpiBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(eq(programsTable.id, body.data.programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  const [existing] = await db.select({ id: impactKpisTable.id }).from(impactKpisTable).where(and(
    eq(impactKpisTable.programId, body.data.programId),
    eq(impactKpisTable.name, body.data.name.trim()),
  )).limit(1);
  if (existing) {
    res.status(409).json({ error: "An indicator with this name already exists in the program." });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  const [kpi] = await db.insert(impactKpisTable).values({
    ...body.data,
    name: body.data.name.trim(),
    description: body.data.description ?? null,
    targetValue: body.data.targetValue ?? null,
    direction: body.data.direction as typeof ImpactKpiDirection[keyof typeof ImpactKpiDirection],
    createdByStaffId: staff.id,
  }).returning();
  const result = (await getImpactKpis(kpi.programId)).find(({ id }) => id === kpi.id);
  res.status(201).json(CreateProgramImpactKpiResponse.parse(result));
});

router.patch("/analytics/kpis/:id", async (req, res): Promise<void> => {
  const params = UpdateProgramImpactKpiParams.safeParse(req.params);
  const body = UpdateProgramImpactKpiBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [current] = await db.select().from(impactKpisTable)
    .where(eq(impactKpisTable.id, params.data.id)).limit(1);
  if (!current) {
    res.status(404).json({ error: "Impact indicator not found." });
    return;
  }
  const nextName = body.data.name?.trim() ?? current.name;
  const [duplicate] = await db.select({ id: impactKpisTable.id }).from(impactKpisTable).where(and(
    eq(impactKpisTable.programId, current.programId),
    eq(impactKpisTable.name, nextName),
  )).limit(1);
  if (duplicate && duplicate.id !== current.id) {
    res.status(409).json({ error: "An indicator with this name already exists in the program." });
    return;
  }
  await db.update(impactKpisTable).set({
    ...body.data,
    ...(body.data.name !== undefined ? { name: nextName } : {}),
  }).where(eq(impactKpisTable.id, params.data.id));
  const result = (await getImpactKpis(current.programId)).find(({ id }) => id === current.id);
  res.json(UpdateProgramImpactKpiResponse.parse(result));
});

router.delete("/analytics/kpis/:id", async (req, res): Promise<void> => {
  const params = DeleteProgramImpactKpiParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db.delete(impactKpisTable)
    .where(eq(impactKpisTable.id, params.data.id))
    .returning({ id: impactKpisTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Impact indicator not found." });
    return;
  }
  res.status(204).end();
});

router.put("/analytics/kpis/:id/values", async (req, res): Promise<void> => {
  const params = SaveProgramImpactKpiValuesParams.safeParse(req.params);
  const body = SaveProgramImpactKpiValuesBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  const [kpi] = await db.select().from(impactKpisTable)
    .where(eq(impactKpisTable.id, params.data.id)).limit(1);
  if (!kpi) {
    res.status(404).json({ error: "Impact indicator not found." });
    return;
  }
  const keys = new Set<string>();
  for (const value of body.data.values) {
    if (!isCalendarDate(value.periodEnd)) {
      res.status(400).json({ error: "Outcome dates must be valid calendar dates." });
      return;
    }
    const key = `${value.businessId}:${value.periodEnd}`;
    if (keys.has(key)) {
      res.status(400).json({ error: "Submit each business and period only once." });
      return;
    }
    keys.add(key);
  }
  const businessIds = [...new Set(body.data.values.map(({ businessId }) => businessId))];
  const businesses = businessIds.length
    ? await db.select({ id: businessesTable.id }).from(businessesTable).where(and(
      eq(businessesTable.programId, kpi.programId),
      inArray(businessesTable.id, businessIds),
    ))
    : [];
  if (businesses.length !== businessIds.length) {
    res.status(404).json({ error: "Each business must belong to the indicator's program." });
    return;
  }
  const staff = res.locals.staff as StaffAccess;
  await db.transaction(async (transaction) => {
    for (const value of body.data.values) {
      await transaction.insert(impactKpiValuesTable).values({
        kpiId: kpi.id,
        businessId: value.businessId,
        value: value.value,
        periodEnd: value.periodEnd,
        notes: value.notes,
        recordedByStaffId: staff.id,
      }).onConflictDoUpdate({
        target: [
          impactKpiValuesTable.kpiId,
          impactKpiValuesTable.businessId,
          impactKpiValuesTable.periodEnd,
        ],
        set: {
          value: value.value,
          notes: value.notes,
          recordedByStaffId: staff.id,
          recordedAt: new Date(),
        },
      });
    }
  });
  const result = (await getImpactKpis(kpi.programId)).find(({ id }) => id === kpi.id);
  res.json(SaveProgramImpactKpiValuesResponse.parse(result));
});

export default router;
