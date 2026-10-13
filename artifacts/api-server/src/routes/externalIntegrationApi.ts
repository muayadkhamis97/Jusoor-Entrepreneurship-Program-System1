import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Router } from "express";
import {
  CreateBusinessBody,
  CreateCourseModuleBody,
  CreateExternalProgramResourceBody,
  CreateGrantReceiptBody,
  CreatePitchBody,
  CreateSessionBody,
  CreateSupportBody,
  ListExternalProgramResourcesResponse,
  ReviewApplicationBody,
  SubmitApplicationBody,
  UpdateBusinessBody,
  UpdateCourseModuleBody,
  UpdateExternalProgramBody,
  UpdatePitchBody,
  UpdateSessionBody,
  UpdateSupportBody,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  courseCertificatesTable,
  courseModuleProgressTable,
  courseModulesTable,
  db,
  grantReceiptsTable,
  programsTable,
  sessionAttendanceTable,
  sessionsTable,
  staffMembersTable,
  supportTable,
  pitchesTable,
} from "@workspace/db";
import { totalGrantReceived } from "../lib/grant-ledger";
import { requireIntegrationApiKey, type IntegrationApiKeyContext } from "./integrationApiKeys";

const router = Router();
router.use(requireIntegrationApiKey);

type RecordBody = Record<string, unknown>;

function apiKey(res: { locals: Record<string, unknown> }): IntegrationApiKeyContext {
  return res.locals.integrationApiKey as IntegrationApiKeyContext;
}

function bodyObject(value: unknown): RecordBody | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordBody
    : null;
}

function pathId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function checkProgramScope(programId: number, key: IntegrationApiKeyContext, res: { status: (code: number) => { json: (body: unknown) => unknown } }): boolean {
  if (programId !== key.programId) {
    res.status(403).json({ error: "This API key is limited to another program." });
    return false;
  }
  return true;
}

function responseItem(res: { status: (code: number) => { json: (body: unknown) => unknown } }, code: number, item: unknown): void {
  res.status(code).json({ item });
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateOnly(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function normalizeDateValue(value: unknown): string | null | undefined {
  const normalized = dateOnly(value);
  return normalized === null || normalized === undefined ? normalized : String(normalized);
}

function isProgramBodyMismatch(body: RecordBody, programId: number): boolean {
  return body.programId !== undefined && body.programId !== null &&
    Number(body.programId) !== programId;
}

function invalidPayload(res: { status: (code: number) => { json: (body: unknown) => unknown } }, message = "Invalid resource payload."): void {
  res.status(400).json({ error: message });
}

async function getCourseModule(moduleId: number, programId: number) {
  const [module] = await db.select({
    id: courseModulesTable.id,
    programId: courseModulesTable.programId,
    title: courseModulesTable.title,
    description: courseModulesTable.description,
    position: courseModulesTable.position,
    releaseAt: courseModulesTable.releaseAt,
    dueAt: courseModulesTable.dueAt,
    isRequired: courseModulesTable.isRequired,
    isPublished: courseModulesTable.isPublished,
    createdAt: courseModulesTable.createdAt,
    updatedAt: courseModulesTable.updatedAt,
  }).from(courseModulesTable)
    .where(and(eq(courseModulesTable.id, moduleId), eq(courseModulesTable.programId, programId)))
    .limit(1);
  return module ?? null;
}

async function upsertAttendance(
  programId: number,
  sessionId: number,
  records: unknown,
  key: IntegrationApiKeyContext,
) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 500) {
    return { error: "Provide between 1 and 500 attendance records." } as const;
  }
  const [session] = await db.select({ id: sessionsTable.id }).from(sessionsTable)
    .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.programId, programId)))
    .limit(1);
  if (!session) return { error: "Session not found in this program.", status: 404 } as const;

  const clean: Array<{
    businessId: number;
    status: "present" | "absent" | "excused";
    notes: string | null;
    attendedSeconds: number | null;
  }> = [];
  for (const value of records) {
    const row = bodyObject(value);
    const businessId = row ? pathId(String(row.businessId ?? "")) : null;
    if (!row || !businessId || !["present", "absent", "excused"].includes(row.status as string)) {
      return { error: "Each record needs a valid businessId and attendance status." } as const;
    }
    if (row.notes !== undefined && row.notes !== null && typeof row.notes !== "string") {
      return { error: "Attendance notes must be text or null." } as const;
    }
    const seconds = row.attendedSeconds;
    if (seconds !== undefined && seconds !== null &&
      (!Number.isSafeInteger(seconds) || Number(seconds) < 0 || Number(seconds) > 86_400)) {
      return { error: "attendedSeconds must be an integer from 0 to 86400." } as const;
    }
    clean.push({
      businessId,
      status: row.status as "present" | "absent" | "excused",
      notes: typeof row.notes === "string" ? row.notes.trim() || null : null,
      attendedSeconds: typeof seconds === "number" ? seconds : null,
    });
  }

  const businessIds = [...new Set(clean.map((row) => row.businessId))];
  const businesses = await db.select({ id: businessesTable.id }).from(businessesTable)
    .where(and(
      eq(businessesTable.programId, programId),
      inArray(businessesTable.id, businessIds),
    ));
  if (businesses.length !== businessIds.length) {
    return { error: "One or more businesses are outside this program.", status: 403 } as const;
  }

  const updated = [];
  for (const row of clean) {
    const [record] = await db.insert(sessionAttendanceTable).values({
      sessionId,
      businessId: row.businessId,
      status: row.status,
      notes: row.notes,
      attendedSeconds: row.attendedSeconds,
      source: "manual",
      recordedByStaffId: key.createdByStaffId,
      markedAt: new Date(),
    }).onConflictDoUpdate({
      target: [sessionAttendanceTable.sessionId, sessionAttendanceTable.businessId],
      set: {
        status: row.status,
        notes: row.notes,
        attendedSeconds: row.attendedSeconds,
        source: "manual",
        recordedByStaffId: key.createdByStaffId,
        markedAt: new Date(),
      },
    }).returning();
    updated.push(record);
  }
  return { records: updated } as const;
}

router.get("/programs/:programId", async (req, res): Promise<void> => {
  const programId = pathId(req.params.programId);
  const key = apiKey(res);
  if (!programId) {
    res.status(400).json({ error: "Invalid program ID." });
    return;
  }
  if (!checkProgramScope(programId, key, res)) return;
  const [program] = await db.select().from(programsTable)
    .where(eq(programsTable.id, programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  res.json(program);
});

router.patch("/programs/:programId", async (req, res): Promise<void> => {
  const programId = pathId(req.params.programId);
  const key = apiKey(res);
  if (!programId) {
    res.status(400).json({ error: "Invalid program ID." });
    return;
  }
  if (!checkProgramScope(programId, key, res)) return;
  const parsed = UpdateExternalProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [program] = await db.update(programsTable)
    .set({
      ...parsed.data,
      startDate: normalizeDateValue(parsed.data.startDate),
      endDate: normalizeDateValue(parsed.data.endDate),
      applicationDeadline: normalizeDateValue(parsed.data.applicationDeadline),
    })
    .where(eq(programsTable.id, programId))
    .returning();
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  res.json(program);
});

router.get("/programs/:programId/resources/:resource", async (req, res): Promise<void> => {
  const programId = pathId(req.params.programId);
  const key = apiKey(res);
  if (!programId) {
    res.status(400).json({ error: "Invalid program ID." });
    return;
  }
  if (!checkProgramScope(programId, key, res)) return;

  let items: unknown[] = [];
  switch (req.params.resource) {
    case "applications": {
      const records = await db.select({
        application: applicationsTable,
        programName: programsTable.name,
      }).from(applicationsTable)
        .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
        .where(eq(applicationsTable.programId, programId))
        .orderBy(desc(applicationsTable.createdAt));
      items = records.map(({ application, programName }) => ({ ...application, programName }));
      break;
    }
    case "businesses":
      items = await db.select().from(businessesTable)
        .where(eq(businessesTable.programId, programId))
        .orderBy(asc(businessesTable.businessName));
      break;
    case "sessions":
      items = await db.select().from(sessionsTable)
        .where(eq(sessionsTable.programId, programId))
        .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.startTime));
      break;
    case "course-modules": {
      const modules = await db.select().from(courseModulesTable)
        .where(eq(courseModulesTable.programId, programId))
        .orderBy(asc(courseModulesTable.position), asc(courseModulesTable.id));
      items = modules.map(({
        id, programId: moduleProgramId, title, description, position, releaseAt,
        dueAt, isRequired, isPublished, createdAt, updatedAt,
      }) => ({
        id,
        programId: moduleProgramId,
        title,
        description,
        position,
        releaseAt,
        dueAt,
        isRequired,
        isPublished,
        createdAt,
        updatedAt,
      }));
      break;
    }
    case "attendance":
      items = await db.select({
        id: sessionAttendanceTable.id,
        sessionId: sessionAttendanceTable.sessionId,
        businessId: sessionAttendanceTable.businessId,
        businessName: businessesTable.businessName,
        status: sessionAttendanceTable.status,
        notes: sessionAttendanceTable.notes,
        source: sessionAttendanceTable.source,
        attendedSeconds: sessionAttendanceTable.attendedSeconds,
        firstJoinedAt: sessionAttendanceTable.firstJoinedAt,
        lastLeftAt: sessionAttendanceTable.lastLeftAt,
        markedAt: sessionAttendanceTable.markedAt,
      }).from(sessionAttendanceTable)
        .innerJoin(sessionsTable, eq(sessionAttendanceTable.sessionId, sessionsTable.id))
        .innerJoin(businessesTable, eq(sessionAttendanceTable.businessId, businessesTable.id))
        .where(and(
          eq(sessionsTable.programId, programId),
          eq(businessesTable.programId, programId),
        ))
        .orderBy(desc(sessionAttendanceTable.markedAt));
      break;
    case "learning-progress":
      items = await db.select({
        id: courseModuleProgressTable.id,
        applicationId: courseModuleProgressTable.applicationId,
        moduleId: courseModuleProgressTable.moduleId,
        founderName: applicationsTable.founderName,
        businessName: applicationsTable.businessName,
        moduleTitle: courseModulesTable.title,
        completedAt: courseModuleProgressTable.completedAt,
        lastActivityAt: courseModuleProgressTable.lastActivityAt,
      }).from(courseModuleProgressTable)
        .innerJoin(applicationsTable, eq(courseModuleProgressTable.applicationId, applicationsTable.id))
        .innerJoin(courseModulesTable, eq(courseModuleProgressTable.moduleId, courseModulesTable.id))
        .where(and(
          eq(applicationsTable.programId, programId),
          eq(courseModulesTable.programId, programId),
        ))
        .orderBy(asc(applicationsTable.businessName), asc(courseModulesTable.position));
      break;
    case "mentoring":
      items = await db.select({
        id: supportTable.id,
        businessId: supportTable.businessId,
        businessName: businessesTable.businessName,
        type: supportTable.type,
        provider: supportTable.provider,
        mentorStaffId: supportTable.mentorStaffId,
        topic: supportTable.topic,
        scheduledDate: supportTable.scheduledDate,
        status: supportTable.status,
        notes: supportTable.notes,
        createdAt: supportTable.createdAt,
      }).from(supportTable)
        .innerJoin(businessesTable, eq(supportTable.businessId, businessesTable.id))
        .where(eq(businessesTable.programId, programId))
        .orderBy(desc(supportTable.createdAt));
      break;
    case "pitches":
      items = await db.select({
        id: pitchesTable.id,
        businessId: pitchesTable.businessId,
        businessName: businessesTable.businessName,
        eventType: pitchesTable.eventType,
        eventDate: pitchesTable.eventDate,
        judges: pitchesTable.judges,
        score: pitchesTable.score,
        grantDecision: pitchesTable.grantDecision,
        grantAmount: pitchesTable.grantAmount,
        feedback: pitchesTable.feedback,
        createdAt: pitchesTable.createdAt,
      }).from(pitchesTable)
        .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
        .where(eq(businessesTable.programId, programId))
        .orderBy(desc(pitchesTable.eventDate));
      break;
    case "grant-receipts":
      items = await db.select({
        id: grantReceiptsTable.id,
        pitchId: grantReceiptsTable.pitchId,
        businessId: businessesTable.id,
        businessName: businessesTable.businessName,
        kind: grantReceiptsTable.kind,
        amount: grantReceiptsTable.amount,
        receivedOn: grantReceiptsTable.receivedOn,
        reference: grantReceiptsTable.reference,
        notes: grantReceiptsTable.notes,
        createdAt: grantReceiptsTable.createdAt,
      }).from(grantReceiptsTable)
        .innerJoin(pitchesTable, eq(grantReceiptsTable.pitchId, pitchesTable.id))
        .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
        .where(eq(businessesTable.programId, programId))
        .orderBy(asc(grantReceiptsTable.receivedOn), asc(grantReceiptsTable.createdAt));
      break;
    default:
      res.status(404).json({ error: "Resource not found." });
      return;
  }
  res.json(ListExternalProgramResourcesResponse.parse({ items }));
});

router.post("/programs/:programId/resources/:resource", async (req, res): Promise<void> => {
  const programId = pathId(req.params.programId);
  const key = apiKey(res);
  if (!programId) {
    res.status(400).json({ error: "Invalid program ID." });
    return;
  }
  if (!checkProgramScope(programId, key, res)) return;
  const generic = CreateExternalProgramResourceBody.safeParse(req.body);
  if (!generic.success) {
    invalidPayload(res, generic.error.message);
    return;
  }
  const payload = generic.data;
  if (isProgramBodyMismatch(payload, programId)) {
    res.status(403).json({ error: "The program ID is determined by the API key." });
    return;
  }

  switch (req.params.resource) {
    case "applications": {
      const parsed = SubmitApplicationBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (!checkProgramScope(parsed.data.programId, key, res)) return;
      try {
        const [created] = await db.insert(applicationsTable).values({
          ...parsed.data,
          programId,
          status: "submitted",
        }).returning();
        const [program] = await db.select({ name: programsTable.name }).from(programsTable)
          .where(eq(programsTable.id, programId)).limit(1);
        responseItem(res, 201, { ...created, programName: program?.name ?? "" });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
          res.status(409).json({ error: "An application already exists for this program and email." });
          return;
        }
        throw error;
      }
      return;
    }
    case "businesses": {
      const parsed = CreateBusinessBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (!checkProgramScope(parsed.data.programId, key, res)) return;
      const [created] = await db.insert(businessesTable).values({
        ...parsed.data,
        applicationDate: normalizeDateValue(parsed.data.applicationDate),
        programId,
      }).returning();
      responseItem(res, 201, created);
      return;
    }
    case "sessions": {
      const parsed = CreateSessionBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (parsed.data.programId !== undefined && parsed.data.programId !== null &&
        !checkProgramScope(parsed.data.programId, key, res)) return;
      const [created] = await db.insert(sessionsTable).values({
        ...parsed.data,
        programId,
        trainerStaffId: null,
        zoomMeetingId: null,
      }).returning();
      responseItem(res, 201, created);
      return;
    }
    case "course-modules": {
      const parsed = CreateCourseModuleBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (!checkProgramScope(parsed.data.programId, key, res)) return;
      const [created] = await db.insert(courseModulesTable).values({
        ...parsed.data,
        programId,
        createdByStaffId: key.createdByStaffId,
      }).returning();
      responseItem(res, 201, await getCourseModule(created.id, programId));
      return;
    }
    case "attendance": {
      const sessionId = pathId(String(payload.sessionId ?? ""));
      if (!sessionId) {
        invalidPayload(res, "Attendance payload requires a valid sessionId and records array.");
        return;
      }
      const saved = await upsertAttendance(programId, sessionId, payload.records, key);
      if ("error" in saved) {
        res.status(saved.status ?? 400).json({ error: saved.error });
        return;
      }
      responseItem(res, 200, { records: saved.records });
      return;
    }
    case "learning-progress": {
      const applicationId = pathId(String(payload.applicationId ?? ""));
      const moduleId = pathId(String(payload.moduleId ?? ""));
      if (!applicationId || !moduleId || typeof payload.completed !== "boolean") {
        invalidPayload(res, "Provide applicationId, moduleId, and a boolean completed value.");
        return;
      }
      const result = await db.transaction(async (tx) => {
        const [application] = await tx.select().from(applicationsTable)
          .where(and(
            eq(applicationsTable.id, applicationId),
            eq(applicationsTable.programId, programId),
            eq(applicationsTable.status, "accepted"),
          ))
          .for("update")
          .limit(1);
        if (!application) return { error: "An accepted application in this program is required.", status: 403 } as const;
        if (!application.clerkUserId) {
          return { error: "The application has no linked participant account.", status: 409 } as const;
        }
        const [module] = await tx.select().from(courseModulesTable)
          .where(and(eq(courseModulesTable.id, moduleId), eq(courseModulesTable.programId, programId)))
          .limit(1);
        if (!module) return { error: "Course module not found in this program.", status: 404 } as const;
        const now = new Date();
        if (!module.isPublished || (module.releaseAt && module.releaseAt > now)) {
          return { error: "Progress cannot be recorded before the module is released.", status: 409 } as const;
        }
        const [certificate] = await tx.select({ id: courseCertificatesTable.id }).from(courseCertificatesTable)
          .where(eq(courseCertificatesTable.applicationId, applicationId))
          .limit(1);
        if (certificate) {
          return { error: "Learning progress is locked after certificate issuance.", status: 409 } as const;
        }
        const completedAt = payload.completed ? now : null;
        const [progress] = await tx.insert(courseModuleProgressTable).values({
          applicationId,
          moduleId,
          participantClerkUserId: application.clerkUserId,
          completedAt,
          lastActivityAt: now,
        }).onConflictDoUpdate({
          target: [courseModuleProgressTable.applicationId, courseModuleProgressTable.moduleId],
          set: { completedAt, lastActivityAt: now, participantClerkUserId: application.clerkUserId },
        }).returning({
          id: courseModuleProgressTable.id,
          applicationId: courseModuleProgressTable.applicationId,
          moduleId: courseModuleProgressTable.moduleId,
          completedAt: courseModuleProgressTable.completedAt,
          lastActivityAt: courseModuleProgressTable.lastActivityAt,
        });
        return { progress } as const;
      });
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      responseItem(res, 200, result.progress);
      return;
    }
    case "mentoring": {
      const parsed = CreateSupportBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      const [business] = await db.select({ id: businessesTable.id }).from(businessesTable)
        .where(and(eq(businessesTable.id, parsed.data.businessId), eq(businessesTable.programId, programId)))
        .limit(1);
      if (!business) {
        res.status(403).json({ error: "Business must belong to this program." });
        return;
      }
      if (parsed.data.mentorStaffId) {
        const [mentor] = await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
          .where(and(eq(staffMembersTable.id, parsed.data.mentorStaffId), eq(staffMembersTable.role, "mentor")))
          .limit(1);
        if (!mentor) {
          invalidPayload(res, "Select an existing mentor account.");
          return;
        }
      }
      const [created] = await db.insert(supportTable).values(parsed.data).returning();
      responseItem(res, 201, created);
      return;
    }
    case "pitches": {
      const parsed = CreatePitchBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      const [business] = await db.select({ id: businessesTable.id }).from(businessesTable)
        .where(and(eq(businessesTable.id, parsed.data.businessId), eq(businessesTable.programId, programId)))
        .limit(1);
      if (!business) {
        res.status(403).json({ error: "Business must belong to this program." });
        return;
      }
      const [created] = await db.insert(pitchesTable).values(parsed.data).returning();
      responseItem(res, 201, created);
      return;
    }
    case "grant-receipts": {
      const pitchId = pathId(String(payload.pitchId ?? ""));
      const parsed = CreateGrantReceiptBody.safeParse({
        kind: payload.kind,
        amount: payload.amount,
        receivedOn: payload.receivedOn,
        reference: payload.reference,
        notes: payload.notes,
      });
      if (!pitchId || !parsed.success) {
        invalidPayload(res, parsed.success ? "Provide a valid pitchId." : parsed.error.message);
        return;
      }
      const result = await createGrantReceipt(programId, pitchId, parsed.data, key);
      if ("error" in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      responseItem(res, 201, result.record);
      return;
    }
    default:
      res.status(404).json({ error: "Resource not found." });
  }
});

async function createGrantReceipt(
  programId: number,
  pitchId: number,
  body: { kind: "received" | "reversal"; amount: number; receivedOn: string; reference?: string | null; notes?: string | null },
  key: IntegrationApiKeyContext,
) {
  if (!validDate(body.receivedOn)) {
    return { error: "Choose a valid receipt date.", status: 400 } as const;
  }
  const amountCents = Math.round(body.amount * 100);
  if (Math.abs(body.amount * 100 - amountCents) > 0.00001 || amountCents <= 0) {
    return { error: "Enter an amount with no more than two decimal places.", status: 400 } as const;
  }
  if (body.kind === "reversal" && !body.notes?.trim()) {
    return { error: "Add a note explaining this correction.", status: 400 } as const;
  }

  const result = await db.transaction(async (tx) => {
    const [award] = await tx.select({
      id: pitchesTable.id,
      amount: pitchesTable.grantAmount,
    }).from(pitchesTable)
      .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
      .where(and(
        eq(pitchesTable.id, pitchId),
        eq(pitchesTable.grantDecision, "awarded"),
        eq(businessesTable.programId, programId),
      ))
      .for("update")
      .limit(1);
    if (!award) return { kind: "not_found" as const };
    if (award.amount === null || award.amount <= 0) return { kind: "amount_needed" as const };

    const existing = await tx.select({
      kind: grantReceiptsTable.kind,
      amount: grantReceiptsTable.amount,
    }).from(grantReceiptsTable).where(eq(grantReceiptsTable.pitchId, pitchId));
    const totalReceived = totalGrantReceived(existing);
    if (body.kind === "reversal" && amountCents > Math.round(totalReceived * 100)) {
      return { kind: "reversal_too_large" as const };
    }
    const [record] = await tx.insert(grantReceiptsTable).values({
      pitchId,
      kind: body.kind,
      amount: body.amount,
      receivedOn: body.receivedOn,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      recordedByStaffId: key.createdByStaffId,
    }).returning();
    return { kind: "created" as const, record };
  });
  if (result.kind === "not_found") return { error: "Awarded pitch not found in this program.", status: 404 } as const;
  if (result.kind === "amount_needed") return { error: "Set a positive grant amount before recording receipts.", status: 409 } as const;
  if (result.kind === "reversal_too_large") return { error: "A reversal cannot exceed the total received amount.", status: 409 } as const;
  return { record: result.record } as const;
}

router.patch("/programs/:programId/resources/:resource/:recordId", async (req, res): Promise<void> => {
  const programId = pathId(req.params.programId);
  const recordId = pathId(req.params.recordId);
  const key = apiKey(res);
  if (!programId || !recordId) {
    res.status(400).json({ error: "Invalid program or record ID." });
    return;
  }
  if (!checkProgramScope(programId, key, res)) return;
  const generic = CreateExternalProgramResourceBody.safeParse(req.body);
  if (!generic.success) {
    invalidPayload(res, generic.error.message);
    return;
  }
  const payload = generic.data;
  if (isProgramBodyMismatch(payload, programId)) {
    res.status(403).json({ error: "The program ID is determined by the API key." });
    return;
  }

  switch (req.params.resource) {
    case "applications": {
      const parsed = ReviewApplicationBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      const result = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(applicationsTable)
          .where(and(eq(applicationsTable.id, recordId), eq(applicationsTable.programId, programId)))
          .limit(1).for("update");
        if (!current) return { kind: "missing" as const };
        const finalStatus = current.status === "accepted" || current.status === "declined";
        if (finalStatus && current.status !== parsed.data.status) return { kind: "final" as const };

        let businessId = current.businessId;
        if (parsed.data.status === "accepted" && !businessId) {
          const [existingBusiness] = await tx.select({ id: businessesTable.id }).from(businessesTable)
            .where(and(
              eq(businessesTable.programId, programId),
              eq(businessesTable.email, current.email),
            )).limit(1);
          if (existingBusiness) {
            businessId = existingBusiness.id;
          } else {
            const [business] = await tx.insert(businessesTable).values({
              programId,
              businessName: current.businessName,
              founderName: current.founderName,
              email: current.email,
              phone: current.phone,
              industry: current.industry,
              needs: current.supportNeeds,
              stage: "application",
              applicationDate: current.createdAt.toISOString().slice(0, 10),
            }).returning({ id: businessesTable.id });
            businessId = business.id;
          }
        }
        const [application] = await tx.update(applicationsTable).set({
          status: parsed.data.status,
          reviewNotes: parsed.data.reviewNotes?.trim() || null,
          businessId,
          reviewedByStaffId: key.createdByStaffId,
          reviewedAt: new Date(),
        }).where(eq(applicationsTable.id, current.id)).returning();
        return { kind: "updated" as const, application };
      });
      if (result.kind === "missing") {
        res.status(404).json({ error: "Application not found in this program." });
        return;
      }
      if (result.kind === "final") {
        res.status(409).json({ error: "A final application decision cannot be changed." });
        return;
      }
      responseItem(res, 200, result.application);
      return;
    }
    case "businesses": {
      const parsed = UpdateBusinessBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (parsed.data.programId !== undefined && parsed.data.programId !== programId) {
        res.status(403).json({ error: "The program ID is determined by the API key." });
        return;
      }
      const [record] = await db.update(businessesTable)
        .set({
          ...parsed.data,
          applicationDate: normalizeDateValue(parsed.data.applicationDate),
        })
        .where(and(eq(businessesTable.id, recordId), eq(businessesTable.programId, programId)))
        .returning();
      if (!record) {
        res.status(404).json({ error: "Business not found in this program." });
        return;
      }
      responseItem(res, 200, record);
      return;
    }
    case "sessions": {
      const parsed = UpdateSessionBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (parsed.data.programId !== undefined && parsed.data.programId !== null &&
        parsed.data.programId !== programId) {
        res.status(403).json({ error: "The program ID is determined by the API key." });
        return;
      }
      const [record] = await db.update(sessionsTable)
        .set({ ...parsed.data, programId })
        .where(and(eq(sessionsTable.id, recordId), eq(sessionsTable.programId, programId)))
        .returning();
      if (!record) {
        res.status(404).json({ error: "Session not found in this program." });
        return;
      }
      responseItem(res, 200, record);
      return;
    }
    case "course-modules": {
      const parsed = UpdateCourseModuleBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      const [record] = await db.update(courseModulesTable).set(parsed.data)
        .where(and(eq(courseModulesTable.id, recordId), eq(courseModulesTable.programId, programId)))
        .returning();
      if (!record) {
        res.status(404).json({ error: "Course module not found in this program." });
        return;
      }
      responseItem(res, 200, await getCourseModule(record.id, programId));
      return;
    }
    case "attendance": {
      const parsed = bodyObject(payload);
      if (!parsed) {
        invalidPayload(res);
        return;
      }
      const current = await db.select({
        id: sessionAttendanceTable.id,
      }).from(sessionAttendanceTable)
        .innerJoin(sessionsTable, eq(sessionAttendanceTable.sessionId, sessionsTable.id))
        .innerJoin(businessesTable, eq(sessionAttendanceTable.businessId, businessesTable.id))
        .where(and(
          eq(sessionAttendanceTable.id, recordId),
          eq(sessionsTable.programId, programId),
          eq(businessesTable.programId, programId),
        )).limit(1);
      if (!current.length) {
        res.status(404).json({ error: "Attendance record not found in this program." });
        return;
      }
      if (parsed.status !== undefined && !["present", "absent", "excused"].includes(parsed.status as string)) {
        invalidPayload(res, "status must be present, absent, or excused.");
        return;
      }
      if (parsed.notes !== undefined && parsed.notes !== null && typeof parsed.notes !== "string") {
        invalidPayload(res, "notes must be text or null.");
        return;
      }
      if (parsed.attendedSeconds !== undefined && parsed.attendedSeconds !== null &&
        (!Number.isSafeInteger(parsed.attendedSeconds) || Number(parsed.attendedSeconds) < 0 || Number(parsed.attendedSeconds) > 86_400)) {
        invalidPayload(res, "attendedSeconds must be an integer from 0 to 86400.");
        return;
      }
      const update: Partial<typeof sessionAttendanceTable.$inferInsert> = {
        ...(typeof parsed.status === "string" ? { status: parsed.status } : {}),
        ...(parsed.notes === null || typeof parsed.notes === "string" ? { notes: parsed.notes } : {}),
        ...(parsed.attendedSeconds === null || typeof parsed.attendedSeconds === "number" ? { attendedSeconds: parsed.attendedSeconds } : {}),
        source: "manual",
        recordedByStaffId: key.createdByStaffId,
        markedAt: new Date(),
      };
      const [record] = await db.update(sessionAttendanceTable).set(update)
        .where(and(eq(sessionAttendanceTable.id, recordId), inArray(
          sessionAttendanceTable.id,
          db.select({ id: sessionAttendanceTable.id }).from(sessionAttendanceTable)
            .innerJoin(sessionsTable, eq(sessionAttendanceTable.sessionId, sessionsTable.id))
            .innerJoin(businessesTable, eq(sessionAttendanceTable.businessId, businessesTable.id))
            .where(and(
              eq(sessionsTable.programId, programId),
              eq(businessesTable.programId, programId),
            )),
        ))).returning();
      responseItem(res, 200, record);
      return;
    }
    case "learning-progress": {
      const completed = payload.completed;
      if (typeof completed !== "boolean") {
        invalidPayload(res, "completed must be a boolean.");
        return;
      }
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx.select({
          applicationId: courseModuleProgressTable.applicationId,
          moduleId: courseModuleProgressTable.moduleId,
        }).from(courseModuleProgressTable)
          .where(eq(courseModuleProgressTable.id, recordId))
          .limit(1);
        if (!existing) return { error: "Learning progress not found in this program.", status: 404 } as const;
        const [application] = await tx.select().from(applicationsTable)
          .where(and(
            eq(applicationsTable.id, existing.applicationId),
            eq(applicationsTable.programId, programId),
            eq(applicationsTable.status, "accepted"),
          ))
          .for("update")
          .limit(1);
        if (!application) return { error: "Learning progress not found in this program.", status: 404 } as const;
        const [module] = await tx.select().from(courseModulesTable)
          .where(and(
            eq(courseModulesTable.id, existing.moduleId),
            eq(courseModulesTable.programId, programId),
          ))
          .limit(1);
        if (!module) return { error: "Learning progress not found in this program.", status: 404 } as const;
        if (!module.isPublished || (module.releaseAt && module.releaseAt > new Date())) {
          return { error: "Progress cannot be updated before the module is released.", status: 409 } as const;
        }
        const [certificate] = await tx.select({ id: courseCertificatesTable.id }).from(courseCertificatesTable)
          .where(eq(courseCertificatesTable.applicationId, application.id))
          .limit(1);
        if (certificate) {
          return { error: "Learning progress is locked after certificate issuance.", status: 409 } as const;
        }
        const now = new Date();
        const [record] = await tx.update(courseModuleProgressTable).set({
          completedAt: completed ? now : null,
          lastActivityAt: now,
        }).where(eq(courseModuleProgressTable.id, recordId)).returning({
          id: courseModuleProgressTable.id,
          applicationId: courseModuleProgressTable.applicationId,
          moduleId: courseModuleProgressTable.moduleId,
          completedAt: courseModuleProgressTable.completedAt,
          lastActivityAt: courseModuleProgressTable.lastActivityAt,
        });
        return { record } as const;
      });
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      responseItem(res, 200, result.record);
      return;
    }
    case "mentoring": {
      const parsed = UpdateSupportBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (parsed.data.businessId !== undefined) {
        const [business] = await db.select({ id: businessesTable.id }).from(businessesTable)
          .where(and(
            eq(businessesTable.id, parsed.data.businessId),
            eq(businessesTable.programId, programId),
          )).limit(1);
        if (!business) {
          res.status(403).json({ error: "Business must belong to this program." });
          return;
        }
      }
      if (parsed.data.mentorStaffId) {
        const [mentor] = await db.select({ id: staffMembersTable.id }).from(staffMembersTable)
          .where(and(eq(staffMembersTable.id, parsed.data.mentorStaffId), eq(staffMembersTable.role, "mentor")))
          .limit(1);
        if (!mentor) {
          invalidPayload(res, "Select an existing mentor account.");
          return;
        }
      }
      const [record] = await db.update(supportTable)
        .set({
          ...parsed.data,
          scheduledDate: normalizeDateValue(parsed.data.scheduledDate),
        })
        .where(and(eq(supportTable.id, recordId), inArray(
          supportTable.businessId,
          db.select({ id: businessesTable.id }).from(businessesTable)
            .where(eq(businessesTable.programId, programId)),
        )))
        .returning();
      if (!record) {
        res.status(404).json({ error: "Support engagement not found in this program." });
        return;
      }
      responseItem(res, 200, record);
      return;
    }
    case "pitches": {
      const parsed = UpdatePitchBody.safeParse(payload);
      if (!parsed.success) {
        invalidPayload(res, parsed.error.message);
        return;
      }
      if (parsed.data.businessId !== undefined) {
        const [business] = await db.select({ id: businessesTable.id }).from(businessesTable)
          .where(and(
            eq(businessesTable.id, parsed.data.businessId),
            eq(businessesTable.programId, programId),
          )).limit(1);
        if (!business) {
          res.status(403).json({ error: "Business must belong to this program." });
          return;
        }
      }
      const [record] = await db.update(pitchesTable).set(parsed.data)
        .where(and(
          eq(pitchesTable.id, recordId),
          inArray(pitchesTable.businessId, db.select({ id: businessesTable.id }).from(businessesTable)
            .where(eq(businessesTable.programId, programId))),
        )).returning();
      if (!record) {
        res.status(404).json({ error: "Pitch not found in this program." });
        return;
      }
      responseItem(res, 200, record);
      return;
    }
    case "grant-receipts":
      res.status(400).json({ error: "Grant receipt entries are append-only. Add a reversal to correct one." });
      return;
    default:
      res.status(404).json({ error: "Resource not found." });
  }
});

export default router;
