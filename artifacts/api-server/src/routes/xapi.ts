import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  applicationsTable,
  courseMaterialsTable,
  courseModulesTable,
  db,
  xapiDocumentsTable,
  xapiLaunchTokensTable,
  xapiStatementsTable,
} from "@workspace/db";
import { isCourseModuleReleased } from "../lib/courseAccess";

const router: IRouter = Router();
const xapiVersion = "1.0.3";
const actorHomePage = "urn:jusoor:entrepreneurship-program";

interface XapiLaunchContext {
  tokenId: string;
  materialId: number;
  participantClerkUserId: string;
  businessId: number | null;
  applicationId: number;
  registrationId: string;
  activityId: string;
  actor: Record<string, unknown>;
}

function setXapiVersion(res: Response): void {
  res.setHeader("X-Experience-API-Version", xapiVersion);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseLaunchActor(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const account = value.account;
  if (!isRecord(account) || account.homePage !== actorHomePage ||
    typeof account.name !== "string" || !/^participant-[0-9a-f]{24}$/.test(account.name)) return null;
  return value;
}

function actorMatchesLaunch(value: unknown, launch: XapiLaunchContext): boolean {
  const actor = parseLaunchActor(value);
  return !!actor && canonicalJson(actor) === canonicalJson(launch.actor);
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return null;
  return value.toLowerCase();
}

async function authorizeLaunch(req: Request, res: Response): Promise<XapiLaunchContext | null> {
  setXapiVersion(res);
  if (req.get("X-Experience-API-Version") !== xapiVersion) {
    res.status(400).json({ error: `Send X-Experience-API-Version: ${xapiVersion}.` });
    return null;
  }
  const authorization = req.get("Authorization") ?? "";
  const match = authorization.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Jusoor xAPI LRS"');
    res.status(401).json({ error: "A valid package launch credential is required." });
    return null;
  }
  let decoded = "";
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    res.status(401).json({ error: "A valid package launch credential is required." });
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 1) {
    res.status(401).json({ error: "A valid package launch credential is required." });
    return null;
  }
  const id = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const [stored] = await db.select().from(xapiLaunchTokensTable)
    .where(eq(xapiLaunchTokensTable.id, id)).limit(1);
  if (!stored || stored.revoked || stored.expiresAt.getTime() <= Date.now()) {
    res.status(401).json({ error: "The package launch credential is invalid or expired." });
    return null;
  }
  const presentedHash = createHash("sha256").update(password).digest();
  const storedHash = Buffer.from(stored.tokenHash, "hex");
  if (presentedHash.length !== storedHash.length || !timingSafeEqual(presentedHash, storedHash)) {
    res.status(401).json({ error: "The package launch credential is invalid or expired." });
    return null;
  }
  const [material] = await db.select({
    material: courseMaterialsTable,
    module: courseModulesTable,
  }).from(courseMaterialsTable)
    .innerJoin(courseModulesTable, eq(courseMaterialsTable.moduleId, courseModulesTable.id))
    .where(eq(courseMaterialsTable.id, stored.materialId))
    .limit(1);
  if (!material || material.material.kind !== "xapi" || !material.material.allowedRoles.includes("participant") ||
    !isCourseModuleReleased(material.module.isPublished, material.module.releaseAt)) {
    res.status(401).json({ error: "The package is no longer available." });
    return null;
  }
  const [application] = await db.select({ businessId: applicationsTable.businessId })
    .from(applicationsTable).where(and(
      eq(applicationsTable.clerkUserId, stored.participantClerkUserId),
      eq(applicationsTable.programId, material.module.programId),
      eq(applicationsTable.id, stored.applicationId),
      eq(applicationsTable.status, "accepted"),
    )).limit(1);
  if (!application) {
    res.status(401).json({ error: "The package is no longer available." });
    return null;
  }
  return {
    tokenId: stored.id,
    materialId: stored.materialId,
    participantClerkUserId: stored.participantClerkUserId,
    businessId: stored.businessId,
    applicationId: stored.applicationId,
    registrationId: stored.registrationId,
    activityId: material.material.packageActivityId ?? `urn:jusoor:course-material:${stored.materialId}`,
    actor: {
      account: {
        homePage: actorHomePage,
        name: `participant-${createHash("sha256").update(stored.participantClerkUserId).digest("hex").slice(0, 24)}`,
      },
    },
  };
}

function statementInput(value: unknown, launch: XapiLaunchContext): Record<string, unknown> | null {
  if (!isRecord(value) || !actorMatchesLaunch(value.actor, launch) ||
    !isRecord(value.verb) || typeof value.verb.id !== "string" ||
    !isRecord(value.object)) return null;
  if (value.id !== undefined && !parseUuid(value.id)) return null;
  if (value.timestamp !== undefined &&
    (typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp)))) return null;
  if (value.context !== undefined && value.context !== null && !isRecord(value.context)) return null;
  const incomingContext = isRecord(value.context) ? value.context : {};
  if (incomingContext.registration !== undefined &&
    incomingContext.registration !== launch.registrationId) return null;
  return {
    ...value,
    id: parseUuid(value.id) ?? randomUUID(),
    context: { ...incomingContext, registration: launch.registrationId },
    timestamp: value.timestamp ?? new Date().toISOString(),
    stored: new Date().toISOString(),
    version: typeof value.version === "string" ? value.version : xapiVersion,
  };
}

function queryString(req: Request, key: string): string | null {
  const value = req.query[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function canonicalActorKey(value: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

router.get("/about", (_req, res) => {
  res.setHeader("X-Experience-API-Version", xapiVersion);
  res.json({ version: [xapiVersion] });
});

router.get("/statements", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  const statementId = queryString(req, "statementId");
  const registration = queryString(req, "registration");
  const sinceRaw = queryString(req, "since");
  const untilRaw = queryString(req, "until");
  const limitRaw = queryString(req, "limit");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const until = untilRaw ? new Date(untilRaw) : null;
  const limit = limitRaw ? Number(limitRaw) : 100;
  if ((statementId && !parseUuid(statementId)) ||
    (registration && registration !== launch.registrationId) ||
    (since && !Number.isFinite(since.getTime())) ||
    (until && !Number.isFinite(until.getTime())) ||
    !Number.isInteger(limit) || limit < 1 || limit > 500) {
    res.status(400).json({ error: "Invalid xAPI statement query." });
    return;
  }
  const filters = [
    eq(xapiStatementsTable.materialId, launch.materialId),
    eq(xapiStatementsTable.participantClerkUserId, launch.participantClerkUserId),
  ];
  if (statementId) filters.push(eq(xapiStatementsTable.statementId, statementId));
  if (registration) filters.push(eq(xapiStatementsTable.registrationId, registration));
  if (since) filters.push(gte(xapiStatementsTable.storedAt, since));
  if (until) filters.push(lte(xapiStatementsTable.storedAt, until));
  const rows = await db.select().from(xapiStatementsTable)
    .where(and(...filters)).orderBy(asc(xapiStatementsTable.storedAt)).limit(limit);
  if (statementId) {
    if (!rows[0]) {
      res.status(404).json({ error: "Statement not found." });
      return;
    }
    res.json(rows[0].statement);
    return;
  }
  res.json({ statements: rows.map((row) => row.statement), more: "" });
});

router.post("/statements", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  const inputs = Array.isArray(req.body) ? req.body : [req.body];
  if (!inputs.length || inputs.length > 500) {
    res.status(400).json({ error: "Submit between 1 and 500 statements." });
    return;
  }
  const statements = inputs.map((input) => statementInput(input, launch));
  if (statements.some((statement) => !statement)) {
    res.status(400).json({ error: "Statement actor, verb, object, or registration is invalid." });
    return;
  }
  const storedIds: string[] = [];
  for (const statement of statements as Record<string, unknown>[]) {
    const id = statement.id as string;
    const existing = await db.select().from(xapiStatementsTable)
      .where(eq(xapiStatementsTable.statementId, id)).limit(1);
    if (existing[0]) {
      if (canonicalJson(existing[0].statement) !== canonicalJson(statement)) {
        res.status(409).json({ error: "A different statement already uses this statement ID." });
        return;
      }
      storedIds.push(id);
      continue;
    }
    const [inserted] = await db.insert(xapiStatementsTable).values({
      statementId: id,
      materialId: launch.materialId,
      participantClerkUserId: launch.participantClerkUserId,
      businessId: launch.businessId,
      registrationId: launch.registrationId,
      statement,
    }).onConflictDoNothing().returning({ statementId: xapiStatementsTable.statementId });
    if (!inserted) {
      const [raced] = await db.select().from(xapiStatementsTable)
        .where(eq(xapiStatementsTable.statementId, id)).limit(1);
      if (!raced || canonicalJson(raced.statement) !== canonicalJson(statement)) {
        res.status(409).json({ error: "A different statement already uses this statement ID." });
        return;
      }
    }
    storedIds.push(id);
  }
  res.json(storedIds);
});

router.put("/statements", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  const requestedId = parseUuid(queryString(req, "statementId"));
  const statement = statementInput(req.body, launch);
  if (!requestedId || !statement || statement.id !== requestedId) {
    res.status(400).json({ error: "The statement ID must match the statementId query parameter." });
    return;
  }
  const [inserted] = await db.insert(xapiStatementsTable).values({
    statementId: requestedId,
    materialId: launch.materialId,
    participantClerkUserId: launch.participantClerkUserId,
    businessId: launch.businessId,
    registrationId: launch.registrationId,
    statement,
  }).onConflictDoNothing().returning({ statementId: xapiStatementsTable.statementId });
  if (!inserted) {
    const [existing] = await db.select().from(xapiStatementsTable)
      .where(eq(xapiStatementsTable.statementId, requestedId)).limit(1);
    if (!existing || canonicalJson(existing.statement) !== canonicalJson(statement)) {
      res.status(409).json({ error: "A different statement already uses this statement ID." });
      return;
    }
  }
  res.status(204).end();
});

async function parseStateRequest(
  req: Request,
  res: Response,
  launch: XapiLaunchContext,
) {
  const activityId = queryString(req, "activityId");
  const agentRaw = queryString(req, "agent");
  const registration = queryString(req, "registration");
  let agent: Record<string, unknown> | null = null;
  try {
    agent = agentRaw ? parseLaunchActor(JSON.parse(agentRaw)) : null;
  } catch {
    agent = null;
  }
  if (!activityId || !agent || !actorMatchesLaunch(agent, launch) ||
    (registration && registration !== launch.registrationId)) {
    res.status(400).json({ error: "Provide the activityId, launch actor, and current registration." });
    return null;
  }
  return {
    activityId,
    registrationId: launch.registrationId,
    agentKey: canonicalActorKey(agent),
    stateId: queryString(req, "stateId"),
  };
}

router.get("/activities/state", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  const stateKey = await parseStateRequest(req, res, launch);
  if (!stateKey) return;
  const filters = [
    eq(xapiDocumentsTable.materialId, launch.materialId),
    eq(xapiDocumentsTable.participantClerkUserId, launch.participantClerkUserId),
    eq(xapiDocumentsTable.registrationId, stateKey.registrationId),
    eq(xapiDocumentsTable.documentType, "state"),
    eq(xapiDocumentsTable.activityId, stateKey.activityId),
    eq(xapiDocumentsTable.agentKey, stateKey.agentKey),
  ];
  if (stateKey.stateId) filters.push(eq(xapiDocumentsTable.documentId, stateKey.stateId));
  const rows = await db.select().from(xapiDocumentsTable).where(and(...filters));
  if (stateKey.stateId) {
    if (!rows[0]) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", rows[0].contentType);
    res.json(rows[0].document);
    return;
  }
  res.json(rows.map((row) => row.documentId));
});

async function saveState(req: Request, res: Response, launch: XapiLaunchContext): Promise<void> {
  const stateKey = await parseStateRequest(req, res, launch);
  if (!stateKey) return;
  if (!stateKey.stateId || !isRecord(req.body)) {
    res.status(400).json({ error: "A stateId and JSON state document are required." });
    return;
  }
  const [saved] = await db.insert(xapiDocumentsTable).values({
    materialId: launch.materialId,
    participantClerkUserId: launch.participantClerkUserId,
    businessId: launch.businessId,
    registrationId: stateKey.registrationId,
    documentType: "state",
    activityId: stateKey.activityId,
    agentKey: stateKey.agentKey,
    documentId: stateKey.stateId,
    contentType: req.get("Content-Type")?.split(";")[0] || "application/json",
    document: req.body,
  }).onConflictDoUpdate({
    target: [
      xapiDocumentsTable.materialId,
      xapiDocumentsTable.participantClerkUserId,
      xapiDocumentsTable.registrationId,
      xapiDocumentsTable.documentType,
      xapiDocumentsTable.activityId,
      xapiDocumentsTable.agentKey,
      xapiDocumentsTable.documentId,
    ],
    set: {
      contentType: req.get("Content-Type")?.split(";")[0] || "application/json",
      document: req.body,
      updatedAt: new Date(),
    },
  }).returning({ id: xapiDocumentsTable.id });
  if (!saved) {
    res.status(500).json({ error: "State could not be saved." });
    return;
  }
  res.status(204).end();
}

router.put("/activities/state", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  await saveState(req, res, launch);
});

router.post("/activities/state", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  await saveState(req, res, launch);
});

router.delete("/activities/state", async (req, res): Promise<void> => {
  const launch = await authorizeLaunch(req, res);
  if (!launch) return;
  const stateKey = await parseStateRequest(req, res, launch);
  if (!stateKey) return;
  const filters = [
    eq(xapiDocumentsTable.materialId, launch.materialId),
    eq(xapiDocumentsTable.participantClerkUserId, launch.participantClerkUserId),
    eq(xapiDocumentsTable.registrationId, stateKey.registrationId),
    eq(xapiDocumentsTable.documentType, "state"),
    eq(xapiDocumentsTable.activityId, stateKey.activityId),
    eq(xapiDocumentsTable.agentKey, stateKey.agentKey),
  ];
  if (stateKey.stateId) filters.push(eq(xapiDocumentsTable.documentId, stateKey.stateId));
  await db.delete(xapiDocumentsTable).where(and(...filters));
  res.status(204).end();
});

export default router;
