import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  LaunchParticipantCoursePackageParams,
  LaunchParticipantCoursePackageResponse,
  SaveParticipantScormProgressBody,
  SaveParticipantScormProgressParams,
  SaveParticipantScormProgressResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  courseMaterialsTable,
  courseModulesTable,
  coursePackageProgressTable,
  db,
  xapiLaunchTokensTable,
} from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import { isCourseModuleReleased } from "../lib/courseAccess";
import { getCoursePackageResource } from "../lib/coursePackageStorage";

export const participantCoursePackageRouter: IRouter = Router();

const coursePackageRoles = new Set(["participant"]);
const xapiEndpoint = "/api/xapi/";

async function findAccessiblePackage(materialId: number, participant: ParticipantAccess) {
  const [row] = await db.select({
    material: courseMaterialsTable,
    module: courseModulesTable,
  })
    .from(courseMaterialsTable)
    .innerJoin(courseModulesTable, eq(courseMaterialsTable.moduleId, courseModulesTable.id))
    .where(eq(courseMaterialsTable.id, materialId))
    .limit(1);
  if (!row || !["scorm", "xapi"].includes(row.material.kind) ||
    !row.material.objectPath || !row.material.packageLaunchPath ||
    !row.material.allowedRoles.some((role) => coursePackageRoles.has(role)) ||
    !isCourseModuleReleased(row.module.isPublished, row.module.releaseAt)) {
    return null;
  }
  const [application] = await db.select({
    id: applicationsTable.id,
    businessId: applicationsTable.businessId,
  }).from(applicationsTable).where(and(
    eq(applicationsTable.clerkUserId, participant.userId),
    eq(applicationsTable.programId, row.module.programId),
    eq(applicationsTable.status, "accepted"),
  )).limit(1);
  if (!application) return null;
  return { ...row, application };
}

function participantProgress(progress: typeof coursePackageProgressTable.$inferSelect) {
  return {
    state: progress.state,
    completionStatus: progress.completionStatus,
    successStatus: progress.successStatus,
    scoreRaw: progress.scoreRaw,
    scoreScaled: progress.scoreScaled,
    location: progress.location,
    suspendData: progress.suspendData,
    updatedAt: progress.updatedAt,
  };
}

function stableRegistrationId(materialId: number, userId: string): string {
  const bytes = createHash("sha256").update(`jusoor-xapi:${materialId}:${userId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function xapiActorName(userId: string): string {
  return `participant-${createHash("sha256").update(userId).digest("hex").slice(0, 24)}`;
}

participantCoursePackageRouter.get("/materials/:id/package-launch", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const params = LaunchParticipantCoursePackageParams.safeParse(req.params);
  if (!participant || !params.success) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const row = await findAccessiblePackage(params.data.id, participant);
  if (!row) {
    res.status(404).json({ error: "Released course package not found." });
    return;
  }
  try {
    await getCoursePackageResource(row.material.objectPath!, row.material.packageLaunchPath!);
    const [savedProgress] = row.material.packageFormat?.startsWith("scorm")
      ? await db.select().from(coursePackageProgressTable).where(and(
        eq(coursePackageProgressTable.materialId, row.material.id),
        eq(coursePackageProgressTable.participantClerkUserId, participant.userId),
      )).limit(1)
      : [];

    let xapi = null;
    if (row.material.kind === "xapi") {
      const credentialId = randomUUID();
      const password = randomBytes(32).toString("base64url");
      const registration = stableRegistrationId(row.material.id, participant.userId);
      const expiresAt = new Date(Date.now() + 90 * 60 * 1000);
      await db.insert(xapiLaunchTokensTable).values({
        id: credentialId,
        tokenHash: createHash("sha256").update(password).digest("hex"),
        materialId: row.material.id,
        participantClerkUserId: participant.userId,
        businessId: row.application.businessId,
        applicationId: row.application.id,
        registrationId: registration,
        expiresAt,
      });
      const actor = {
        account: {
          homePage: "urn:jusoor:entrepreneurship-program",
          name: xapiActorName(participant.userId),
        },
      };
      xapi = {
        endpoint: xapiEndpoint,
        authorization: `Basic ${Buffer.from(`${credentialId}:${password}`).toString("base64")}`,
        actor,
        registration,
        activityId: row.material.packageActivityId!,
      };
    }

    res.json(LaunchParticipantCoursePackageResponse.parse({
      materialId: row.material.id,
      format: row.material.packageFormat,
      launchPath: row.material.packageLaunchPath,
      language: row.material.language,
      progress: savedProgress ? participantProgress(savedProgress) : null,
      xapi,
    }));
  } catch (error) {
    req.log.error({ err: error, materialId: row.material.id }, "Could not prepare course package launch");
    res.status(404).json({ error: "Course package could not be opened." });
  }
});

participantCoursePackageRouter.get("/materials/:id/package/*filePath", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const params = req.params as typeof req.params & { filePath?: string | string[] };
  const parsed = LaunchParticipantCoursePackageParams.safeParse(req.params);
  const rawPath = params.filePath;
  const filePath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  if (!participant || !parsed.success || !filePath || filePath.startsWith(".jusoor-")) {
    res.status(404).end();
    return;
  }
  const row = await findAccessiblePackage(parsed.data.id, participant);
  if (!row) {
    res.status(404).end();
    return;
  }
  try {
    const resource = await getCoursePackageResource(row.material.objectPath!, filePath);
    res.setHeader("Content-Type", resource.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    res.setHeader("Referrer-Policy", "no-referrer");
    await pipeline(createReadStream(resource.filePath), res);
  } catch (error) {
    req.log.warn({ err: error, materialId: parsed.data.id }, "Course package resource was not found");
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  }
});

async function saveScormProgress(req: Request, res: Response, standardCommitResponse: boolean): Promise<void> {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const params = SaveParticipantScormProgressParams.safeParse(req.params);
  const body = SaveParticipantScormProgressBody.safeParse(req.body);
  if (!participant || !params.success || !body.success) {
    res.status(400).json({ error: "Provide valid SCORM progress for a released course package." });
    return;
  }
  const row = await findAccessiblePackage(params.data.id, participant);
  if (!row || !row.material.packageFormat?.startsWith("scorm")) {
    res.status(404).json({ error: "Released SCORM package not found." });
    return;
  }
  const [progress] = await db.insert(coursePackageProgressTable).values({
    materialId: row.material.id,
    participantClerkUserId: participant.userId,
    businessId: row.application.businessId,
    applicationId: row.application.id,
    state: body.data.state,
    completionStatus: body.data.completionStatus,
    successStatus: body.data.successStatus,
    scoreRaw: body.data.scoreRaw,
    scoreScaled: body.data.scoreScaled,
    location: body.data.location,
    suspendData: body.data.suspendData,
  }).onConflictDoUpdate({
    target: [coursePackageProgressTable.materialId, coursePackageProgressTable.participantClerkUserId],
    set: {
      businessId: row.application.businessId,
      applicationId: row.application.id,
      state: body.data.state,
      completionStatus: body.data.completionStatus,
      successStatus: body.data.successStatus,
      scoreRaw: body.data.scoreRaw,
      scoreScaled: body.data.scoreScaled,
      location: body.data.location,
      suspendData: body.data.suspendData,
      updatedAt: new Date(),
    },
  }).returning();
  if (standardCommitResponse) {
    res.json({ result: true, errorCode: 0 });
  } else {
    res.json(SaveParticipantScormProgressResponse.parse(participantProgress(progress)));
  }
}

participantCoursePackageRouter.put("/materials/:id/scorm-progress", async (req, res): Promise<void> => {
  await saveScormProgress(req, res, false);
});

participantCoursePackageRouter.post("/materials/:id/scorm-progress", async (req, res): Promise<void> => {
  await saveScormProgress(req, res, true);
});
