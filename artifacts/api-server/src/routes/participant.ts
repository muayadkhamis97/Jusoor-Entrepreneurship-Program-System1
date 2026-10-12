import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { GetParticipantDashboardResponse } from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  db,
  programsTable,
  sessionsTable,
  supportTable,
} from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }

  const rows = await db.select({
    application: applicationsTable,
    program: programsTable,
    business: businessesTable,
  })
    .from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .leftJoin(businessesTable, eq(applicationsTable.businessId, businessesTable.id))
    .where(eq(applicationsTable.clerkUserId, participant.userId))
    .orderBy(desc(applicationsTable.createdAt));

  const eligible = rows.filter(({ application, business }) => application.status === "accepted" && business);
  const programIds = [...new Set(eligible.map(({ application }) => application.programId))];
  const businessIds = eligible.flatMap(({ business }) => business ? [business.id] : []);

  const sessions = programIds.length
    ? await db.select({
      id: sessionsTable.id,
      programId: sessionsTable.programId,
      title: sessionsTable.title,
      type: sessionsTable.type,
      scheduledDate: sessionsTable.scheduledDate,
      startTime: sessionsTable.startTime,
      facilitator: sessionsTable.facilitator,
      deliveryMode: sessionsTable.deliveryMode,
      location: sessionsTable.location,
      zoomUrl: sessionsTable.zoomUrl,
      recordingUrl: sessionsTable.recordingUrl,
      status: sessionsTable.status,
    })
      .from(sessionsTable)
      .where(and(inArray(sessionsTable.programId, programIds), ne(sessionsTable.status, "cancelled")))
      .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime))
    : [];

  const support = businessIds.length
    ? await db.select({
      id: supportTable.id,
      businessId: supportTable.businessId,
      type: supportTable.type,
      provider: supportTable.provider,
      topic: supportTable.topic,
      scheduledDate: supportTable.scheduledDate,
      status: supportTable.status,
    })
      .from(supportTable)
      .where(inArray(supportTable.businessId, businessIds))
      .orderBy(asc(supportTable.scheduledDate), asc(supportTable.id))
    : [];

  const result = rows.map(({ application, program, business }) => ({
    applicationId: application.id,
    applicationStatus: application.status,
    submittedAt: application.createdAt,
    program: {
      id: program.id,
      name: program.name,
      format: program.format,
      description: program.description,
      startDate: program.startDate,
      endDate: program.endDate,
    },
    business: business ? {
      id: business.id,
      businessName: business.businessName,
      industry: business.industry,
      stage: business.stage,
    } : null,
    sessions: application.status === "accepted" && business
      ? sessions.filter((session) => session.programId === application.programId).map(({ programId: _programId, ...session }) => session)
      : [],
    support: application.status === "accepted" && business
      ? support.filter((item) => item.businessId === business.id).map(({ businessId: _businessId, ...item }) => item)
      : [],
  }));

  res.json(GetParticipantDashboardResponse.parse({ applications: result }));
});

export default router;
