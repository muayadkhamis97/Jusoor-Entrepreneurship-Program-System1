import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  CreateParticipantInvitationBody,
  CreateParticipantInvitationResponse,
  ListParticipantInvitationsResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  db,
  participantBusinessMembershipsTable,
  participantInvitationsTable,
  programsTable,
} from "@workspace/db";
import { requireCoordinator } from "../middlewares/staffAccess";

const router: IRouter = Router();
const INVITATION_SOURCE = "admin_invitation";

function missingSchema(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error.code === "42P01" || error.code === "42703"),
  );
}

async function invitationSchemaReady(): Promise<boolean> {
  try {
    await db.select({ applicationId: participantInvitationsTable.applicationId })
      .from(participantInvitationsTable).limit(1);
    return true;
  } catch (error) {
    if (missingSchema(error)) return false;
    throw error;
  }
}

router.get("/staff/participant-invitations", requireCoordinator, async (_req, res): Promise<void> => {
  if (!(await invitationSchemaReady())) {
    res.status(503).json({ error: "Participant invitations require the additive participant invitation migration." });
    return;
  }

  const records = await db.select({
    id: applicationsTable.id,
    email: applicationsTable.email,
    participantName: applicationsTable.founderName,
    programId: applicationsTable.programId,
    programName: programsTable.name,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    clerkUserId: applicationsTable.clerkUserId,
    createdAt: participantInvitationsTable.createdAt,
  }).from(participantInvitationsTable)
    .innerJoin(applicationsTable, eq(applicationsTable.id, participantInvitationsTable.applicationId))
    .innerJoin(programsTable, eq(programsTable.id, applicationsTable.programId))
    .innerJoin(businessesTable, eq(businessesTable.id, applicationsTable.businessId))
    .orderBy(desc(applicationsTable.createdAt), asc(applicationsTable.id));

  res.json(ListParticipantInvitationsResponse.parse(records.map(({ clerkUserId, ...record }) => ({
    ...record,
    status: clerkUserId ? "active" : "pending",
  }))));
});

router.post("/staff/participant-invitations", requireCoordinator, async (req, res): Promise<void> => {
  const body = CreateParticipantInvitationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!(await invitationSchemaReady())) {
    res.status(503).json({ error: "Participant invitations require the additive participant invitation migration." });
    return;
  }
  try {
    await db.select({ id: participantBusinessMembershipsTable.id })
      .from(participantBusinessMembershipsTable).limit(1);
  } catch (error) {
    if (!missingSchema(error)) throw error;
    res.status(503).json({ error: "Participant business-team assignments require the assignment migration." });
    return;
  }

  const email = body.data.email.trim().toLowerCase();
  const [business] = await db.select({
    id: businessesTable.id,
    programId: businessesTable.programId,
    businessName: businessesTable.businessName,
    industry: businessesTable.industry,
  }).from(businessesTable)
    .innerJoin(programsTable, eq(programsTable.id, businessesTable.programId))
    .where(and(eq(businessesTable.id, body.data.businessId), isNull(programsTable.archivedAt)))
    .limit(1);
  if (!business) {
    res.status(404).json({ error: "Choose a business in an active program." });
    return;
  }

  const participantName = body.data.displayName?.trim() || email.split("@")[0] || email;
  const current = res.locals.staff as { id: number } | undefined;
  const created = await db.transaction(async (tx) => {
    const [invitation] = await tx.insert(applicationsTable).values({
      programId: business.programId,
      founderName: participantName,
      email,
      phone: null,
      businessName: business.businessName,
      industry: business.industry,
      website: null,
      summary: "",
      supportNeeds: "",
      status: "accepted",
      businessId: business.id,
      reviewedByStaffId: current?.id ?? null,
      reviewedAt: new Date(),
    }).onConflictDoNothing().returning({
      id: applicationsTable.id,
      email: applicationsTable.email,
      participantName: applicationsTable.founderName,
      programId: applicationsTable.programId,
      businessId: applicationsTable.businessId,
      createdAt: applicationsTable.createdAt,
    });

    if (!invitation || invitation.businessId === null) return null;

    await tx.insert(participantBusinessMembershipsTable).values({
      applicationId: invitation.id,
      businessId: invitation.businessId,
      assignedByStaffId: current?.id ?? null,
    }).onConflictDoNothing();
    const [invitationRecord] = await tx.insert(participantInvitationsTable).values({
      applicationId: invitation.id,
      invitedByStaffId: current?.id ?? null,
    }).returning({ createdAt: participantInvitationsTable.createdAt });
    return invitationRecord ? { ...invitation, createdAt: invitationRecord.createdAt } : null;
  });
  if (!created) {
    res.status(409).json({ error: "This email already has an application or invitation for this program." });
    return;
  }

  const [program] = await db.select({ name: programsTable.name })
    .from(programsTable)
    .where(eq(programsTable.id, created.programId))
    .limit(1);
  res.status(201).json(CreateParticipantInvitationResponse.parse({
    ...created,
    programName: program?.name ?? "",
    businessName: business.businessName,
    status: "pending",
  }));
});

export default router;
