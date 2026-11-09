import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  CreateParticipantInvitationBody,
  CreateParticipantInvitationResponse,
  ListParticipantInvitationsResponse,
  ResendParticipantInvitationBody,
  ResendParticipantInvitationParams,
  ResendParticipantInvitationResponse,
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
import {
  getParticipantInvitationStatus,
  isParticipantInvitationExpired,
} from "../lib/participantInvitations";
import { sendParticipantInvitationEmail } from "../lib/participant-invitation-email";
import { platformEmailFailureDiagnostics } from "../lib/platform-email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function missingSchema(error: unknown, visited = new Set<object>()): boolean {
  if (!error || typeof error !== "object" || visited.has(error)) return false;
  visited.add(error);

  const candidate = error as { code?: unknown; cause?: unknown };
  if (candidate.code === "42P01" || candidate.code === "42703") return true;
  return missingSchema(candidate.cause, visited);
}

async function invitationSchemaReady(): Promise<boolean> {
  try {
    await db.select({
      applicationId: participantInvitationsTable.applicationId,
      expiresAt: participantInvitationsTable.expiresAt,
    })
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
    expiresAt: participantInvitationsTable.expiresAt,
  }).from(participantInvitationsTable)
    .innerJoin(applicationsTable, eq(applicationsTable.id, participantInvitationsTable.applicationId))
    .innerJoin(programsTable, eq(programsTable.id, applicationsTable.programId))
    .innerJoin(businessesTable, eq(businessesTable.id, applicationsTable.businessId))
    .orderBy(desc(participantInvitationsTable.createdAt), asc(applicationsTable.id));

  res.json(ListParticipantInvitationsResponse.parse(records.map(({ clerkUserId, ...record }) => ({
    ...record,
    status: getParticipantInvitationStatus(clerkUserId, record.expiresAt),
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
  const invitationCreatedAt = new Date();
  const expiresAt = new Date(invitationCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const created = await db.transaction(async (tx) => {
    const [application] = await tx.insert(applicationsTable).values({
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
      reviewedAt: invitationCreatedAt,
    }).onConflictDoNothing().returning({
      id: applicationsTable.id,
      email: applicationsTable.email,
      participantName: applicationsTable.founderName,
      programId: applicationsTable.programId,
      businessId: applicationsTable.businessId,
      createdAt: applicationsTable.createdAt,
    });

    if (application) {
      await tx.insert(participantBusinessMembershipsTable).values({
        applicationId: application.id,
        businessId: business.id,
        assignedByStaffId: current?.id ?? null,
      }).onConflictDoNothing();
      const [invitationRecord] = await tx.insert(participantInvitationsTable).values({
        applicationId: application.id,
        invitedByStaffId: current?.id ?? null,
        createdAt: invitationCreatedAt,
        expiresAt,
      }).returning({
        createdAt: participantInvitationsTable.createdAt,
        expiresAt: participantInvitationsTable.expiresAt,
      });
      return invitationRecord
        ? { kind: "created" as const, application, createdAt: invitationRecord.createdAt, expiresAt: invitationRecord.expiresAt }
        : null;
    }

    const [existingApplication] = await tx.select({
      id: applicationsTable.id,
      email: applicationsTable.email,
      participantName: applicationsTable.founderName,
      programId: applicationsTable.programId,
      businessId: applicationsTable.businessId,
      clerkUserId: applicationsTable.clerkUserId,
    }).from(applicationsTable)
      .where(and(
        eq(applicationsTable.programId, business.programId),
        eq(applicationsTable.email, email),
      ))
      .limit(1)
      .for("update");
    if (!existingApplication || existingApplication.businessId !== business.id || existingApplication.clerkUserId) {
      return null;
    }

    const [existingInvitation] = await tx.select({
      createdAt: participantInvitationsTable.createdAt,
      expiresAt: participantInvitationsTable.expiresAt,
    }).from(participantInvitationsTable)
      .where(eq(participantInvitationsTable.applicationId, existingApplication.id))
      .limit(1)
      .for("update");
    if (!existingInvitation) return null;

    const [existingMembership] = await tx.select({
      businessId: participantBusinessMembershipsTable.businessId,
    }).from(participantBusinessMembershipsTable)
      .where(eq(participantBusinessMembershipsTable.applicationId, existingApplication.id))
      .limit(1);
    if (existingMembership && existingMembership.businessId !== business.id) return null;
    if (!existingMembership) {
      await tx.insert(participantBusinessMembershipsTable).values({
        applicationId: existingApplication.id,
        businessId: business.id,
        assignedByStaffId: current?.id ?? null,
      }).onConflictDoNothing();
    }

    const renewed = isParticipantInvitationExpired(existingInvitation.expiresAt, invitationCreatedAt)
      ? (await tx.update(participantInvitationsTable)
        .set({
          invitedByStaffId: current?.id ?? null,
          createdAt: invitationCreatedAt,
          expiresAt,
        })
        .where(eq(participantInvitationsTable.applicationId, existingApplication.id))
        .returning({
          createdAt: participantInvitationsTable.createdAt,
          expiresAt: participantInvitationsTable.expiresAt,
        }))[0]
      : existingInvitation;
    if (!renewed) return null;
    return {
      kind: "existing" as const,
      application: existingApplication,
      createdAt: renewed.createdAt,
      expiresAt: renewed.expiresAt,
    };
  });
  if (!created) {
    res.status(409).json({ error: "This email already has an application or invitation for this program." });
    return;
  }

  const [program] = await db.select({ name: programsTable.name })
    .from(programsTable)
    .where(eq(programsTable.id, created.application.programId))
    .limit(1);
  try {
    await sendParticipantInvitationEmail({
      applicationId: created.application.id,
      email: created.application.email,
      participantName: created.application.participantName,
      programName: program?.name ?? "",
      businessName: business.businessName,
      expiresAt: created.expiresAt,
    });
  } catch (error) {
    (req.log ?? logger).error({
      applicationId: created.application.id,
      invitationAction: "create",
      emailFailure: platformEmailFailureDiagnostics(error),
    }, "Participant invitation email delivery failed");
    res.status(503).json({
      error: "Participant access was saved, but the invitation email could not be sent. Check the connected Gmail account before inviting again.",
    });
    return;
  }
  res.status(created.kind === "created" ? 201 : 200).json(CreateParticipantInvitationResponse.parse({
    id: created.application.id,
    email: created.application.email,
    participantName: created.application.participantName,
    programId: created.application.programId,
    businessId: business.id,
    createdAt: created.createdAt,
    programName: program?.name ?? "",
    businessName: business.businessName,
    status: "pending",
    expiresAt: created.expiresAt,
  }));
});

router.post("/staff/participant-invitations/:id/resend", requireCoordinator, async (req, res): Promise<void> => {
  const params = ResendParticipantInvitationParams.safeParse(req.params);
  const body = ResendParticipantInvitationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message });
    return;
  }
  if (!(await invitationSchemaReady())) {
    res.status(503).json({ error: "Participant invitations require the additive participant invitation migration." });
    return;
  }

  const current = res.locals.staff as { id: number } | undefined;
  const result = await db.transaction(async (tx) => {
    const [record] = await tx.select({
      id: applicationsTable.id,
      email: applicationsTable.email,
      participantName: applicationsTable.founderName,
      programId: applicationsTable.programId,
      programName: programsTable.name,
      programArchivedAt: programsTable.archivedAt,
      businessId: businessesTable.id,
      businessName: businessesTable.businessName,
      clerkUserId: applicationsTable.clerkUserId,
      createdAt: participantInvitationsTable.createdAt,
      expiresAt: participantInvitationsTable.expiresAt,
    }).from(participantInvitationsTable)
      .innerJoin(applicationsTable, eq(applicationsTable.id, participantInvitationsTable.applicationId))
      .innerJoin(programsTable, eq(programsTable.id, applicationsTable.programId))
      .innerJoin(businessesTable, eq(businessesTable.id, applicationsTable.businessId))
      .where(eq(participantInvitationsTable.applicationId, params.data.id))
      .limit(1)
      .for("update");

    if (!record) return { kind: "not-found" as const };
    if (record.clerkUserId) return { kind: "already-active" as const };
    if (record.programArchivedAt) return { kind: "archived" as const };

    const now = new Date();
    if (!isParticipantInvitationExpired(record.expiresAt, now)) {
      return { kind: "ready" as const, record };
    }

    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [renewed] = await tx.update(participantInvitationsTable)
      .set({
        invitedByStaffId: current?.id ?? null,
        createdAt: now,
        expiresAt,
      })
      .where(eq(participantInvitationsTable.applicationId, record.id))
      .returning({
        createdAt: participantInvitationsTable.createdAt,
        expiresAt: participantInvitationsTable.expiresAt,
      });
    if (!renewed) return { kind: "not-found" as const };

    return { kind: "ready" as const, record: { ...record, ...renewed } };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Participant invitation not found." });
    return;
  }
  if (result.kind === "already-active") {
    res.status(409).json({ error: "This participant already has an account." });
    return;
  }
  if (result.kind === "archived") {
    res.status(409).json({ error: "Invitations cannot be resent for an archived program." });
    return;
  }

  try {
    await sendParticipantInvitationEmail({
      applicationId: result.record.id,
      email: result.record.email,
      participantName: result.record.participantName,
      programName: result.record.programName,
      businessName: result.record.businessName,
      expiresAt: result.record.expiresAt,
      resendRequestId: body.data.requestId,
    });
  } catch (error) {
    (req.log ?? logger).error({
      applicationId: result.record.id,
      invitationAction: "resend",
      resendRequestId: body.data.requestId,
      emailFailure: platformEmailFailureDiagnostics(error),
    }, "Participant invitation resend could not be confirmed");
    res.status(503).json({
      error: "The resend could not be confirmed. Check the connected Gmail account before trying again.",
    });
    return;
  }

  res.json(ResendParticipantInvitationResponse.parse({
    id: result.record.id,
    email: result.record.email,
    participantName: result.record.participantName,
    programId: result.record.programId,
    programName: result.record.programName,
    businessId: result.record.businessId,
    businessName: result.record.businessName,
    status: "pending",
    createdAt: result.record.createdAt,
    expiresAt: result.record.expiresAt,
  }));
});

export default router;
