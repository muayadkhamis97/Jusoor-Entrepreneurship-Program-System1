import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  ListApplicationsResponse,
  ReviewApplicationBody,
  ReviewApplicationParams,
  ReviewApplicationResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  db,
  programsTable,
} from "@workspace/db";
import { requireCoordinator } from "../middlewares/staffAccess";
import { getAdminInvitedApplicationIds } from "../lib/participantInvitations";

const router: IRouter = Router();

router.get("/applications", requireCoordinator, async (_req, res): Promise<void> => {
  const records = await db.select({
    application: applicationsTable,
    programName: programsTable.name,
  })
    .from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .orderBy(desc(applicationsTable.createdAt));
  const invitationIds = await getAdminInvitedApplicationIds(records.map(({ application }) => application.id));
  const applications = records.filter(({ application }) => !invitationIds.has(application.id))
    .map(({ application, programName }) => ({
    id: application.id,
    programId: application.programId,
    programName,
    founderName: application.founderName,
    email: application.email,
    phone: application.phone,
    businessName: application.businessName,
    industry: application.industry,
    website: application.website,
    summary: application.summary,
    supportNeeds: application.supportNeeds,
    status: application.status,
    reviewNotes: application.reviewNotes,
    businessId: application.businessId,
    createdAt: application.createdAt,
  }));
  res.json(ListApplicationsResponse.parse(applications));
});

router.patch("/applications/:id", requireCoordinator, async (req, res): Promise<void> => {
  const params = ReviewApplicationParams.safeParse(req.params);
  const body = ReviewApplicationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }

  if ((await getAdminInvitedApplicationIds([params.data.id])).has(params.data.id)) {
    res.status(404).json({ error: "Application not found." });
    return;
  }

  const staff = res.locals.staff as { id: number; role: string } | undefined;
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(applicationsTable)
      .where(and(
        eq(applicationsTable.id, params.data.id),
      ))
      .limit(1)
      .for("update");
    if (!current) return { kind: "missing" as const };

    const finalStatus = current.status === "accepted" || current.status === "declined";
    if (finalStatus && current.status !== body.data.status) {
      return { kind: "final" as const };
    }

    let businessId = current.businessId;
    if (!finalStatus && body.data.status === "accepted") {
      const [business] = await tx.insert(businessesTable).values({
        programId: current.programId,
        businessName: current.businessName,
        founderName: current.founderName,
        email: current.email,
        phone: current.phone,
        industry: current.industry,
        stage: "bootcamp",
        applicationDate: current.createdAt.toISOString().slice(0, 10),
        needs: current.supportNeeds,
        notes: current.summary,
      }).returning({ id: businessesTable.id });
      businessId = business.id;
    }

    const [application] = await tx.update(applicationsTable)
      .set({
        status: body.data.status,
        reviewNotes: body.data.reviewNotes?.trim() || null,
        businessId,
        reviewedByStaffId: staff?.id ?? null,
        reviewedAt: new Date(),
      })
      .where(and(eq(applicationsTable.id, current.id), eq(applicationsTable.status, current.status)))
      .returning();

    if (!application) return { kind: "conflict" as const };

    const [program] = await tx.select({ name: programsTable.name })
      .from(programsTable)
      .where(eq(programsTable.id, application.programId))
      .limit(1);

    return { kind: "success" as const, application, programName: program?.name ?? "" };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  if (result.kind === "final" || result.kind === "conflict") {
    res.status(409).json({ error: "A final decision has already been recorded or the application changed." });
    return;
  }

  const application = {
    id: result.application.id,
    programId: result.application.programId,
    programName: result.programName,
    founderName: result.application.founderName,
    email: result.application.email,
    phone: result.application.phone,
    businessName: result.application.businessName,
    industry: result.application.industry,
    website: result.application.website,
    summary: result.application.summary,
    supportNeeds: result.application.supportNeeds,
    status: result.application.status,
    reviewNotes: result.application.reviewNotes,
    businessId: result.application.businessId,
    createdAt: result.application.createdAt,
  };
  res.json(ReviewApplicationResponse.parse(application));
});

export default router;
