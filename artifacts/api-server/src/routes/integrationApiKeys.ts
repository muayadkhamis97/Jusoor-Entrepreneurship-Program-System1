import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import {
  CreateIntegrationApiKeyBody,
  CreateIntegrationApiKeyResponse,
  ListIntegrationApiKeysResponse,
  RevokeIntegrationApiKeyResponse,
} from "@workspace/api-zod";
import {
  db,
  integrationApiKeysTable,
  programsTable,
  type IntegrationApiPermission,
  type IntegrationApiPermissionGroup,
} from "@workspace/db";
import { requireCoordinator, requireStaff, type StaffAccess } from "../middlewares/staffAccess";
import { displayIntegrationApiKeyPrefix, extractIntegrationApiKey } from "./integrationApiKeyFormat";
import { consumeDatabaseRateLimit } from "../lib/databaseRateLimit";

export type IntegrationApiKeyContext = {
  id: number;
  programId: number;
  createdByStaffId: number;
  permissions: IntegrationApiPermission[];
};

const resourcePermissionGroups: Record<string, IntegrationApiPermissionGroup> = {
  applications: "applications_businesses",
  businesses: "applications_businesses",
  sessions: "programs_sessions",
  "course-modules": "courses_attendance",
  attendance: "courses_attendance",
  "learning-progress": "courses_attendance",
  mentoring: "mentoring_grants",
  pitches: "mentoring_grants",
  "grant-receipts": "mentoring_grants",
};

export function integrationApiPermissionForRequest(method: string, path: string): IntegrationApiPermission | null {
  const action = method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD"
    ? "read"
    : method.toUpperCase() === "POST" || method.toUpperCase() === "PATCH"
      ? "write"
      : null;
  if (!action) return null;

  if (/^\/programs\/\d+\/?$/.test(path)) return `programs_sessions:${action}`;
  const resourceMatch = /^\/programs\/\d+\/resources\/([^/]+)(?:\/\d+)?\/?$/.exec(path);
  if (!resourceMatch) return null;
  const group = resourcePermissionGroups[resourceMatch[1]];
  return group ? `${group}:${action}` as IntegrationApiPermission : null;
}

export function integrationApiKeyAllowsRequest(
  permissions: readonly IntegrationApiPermission[],
  method: string,
  path: string,
): boolean {
  const requiredPermission = integrationApiPermissionForRequest(method, path);
  return requiredPermission === null || permissions.includes(requiredPermission);
}

export function hashIntegrationApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function createIntegrationApiKeySecret(): string {
  return `program_live_${randomBytes(32).toString("base64url")}`;
}

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

export const requireIntegrationApiKey: RequestHandler = async (req, res, next): Promise<void> => {
  const authorization = req.get("authorization") ?? "";
  const secret = extractIntegrationApiKey(authorization);
  if (!secret) {
    res.status(401).json({ error: "A valid integration API key is required." });
    return;
  }

  try {
    const keyHash = hashIntegrationApiKey(secret);
    const [key] = await db.select({
      id: integrationApiKeysTable.id,
      programId: integrationApiKeysTable.programId,
      createdByStaffId: integrationApiKeysTable.createdByStaffId,
      permissions: integrationApiKeysTable.permissions,
    }).from(integrationApiKeysTable)
      .where(and(
        eq(integrationApiKeysTable.keyHash, keyHash),
        isNull(integrationApiKeysTable.revokedAt),
      ))
      .limit(1);
    if (!key) {
      res.status(401).json({ error: "A valid integration API key is required." });
      return;
    }

    const now = Date.now();
    const rateLimit = await consumeDatabaseRateLimit(
      `integration-api-key:${key.id}`,
      RATE_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", rateLimit.retryAfterSeconds);
      res.status(429).json({ error: "API request limit reached. Try again shortly." });
      return;
    }

    await db.update(integrationApiKeysTable)
      .set({ lastUsedAt: new Date(now) })
      .where(and(
        eq(integrationApiKeysTable.id, key.id),
        isNull(integrationApiKeysTable.revokedAt),
      ));
    const permission = integrationApiPermissionForRequest(req.method, req.path);
    if (!integrationApiKeyAllowsRequest(key.permissions, req.method, req.path)) {
      res.status(403).json({ error: `This API key does not have ${permission?.split(":")[1]} access to this data.` });
      return;
    }
    res.locals.integrationApiKey = key satisfies IntegrationApiKeyContext;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Integration API key could not be verified");
    res.status(503).json({ error: "Integration API authentication is temporarily unavailable." });
  }
};

const router = Router();
router.use("/integrations/api-keys", requireStaff, requireCoordinator);

router.get("/integrations/api-keys", async (_req, res): Promise<void> => {
  const keys = await db.select({
    id: integrationApiKeysTable.id,
    label: integrationApiKeysTable.label,
    keyPrefix: integrationApiKeysTable.keyPrefix,
    programId: integrationApiKeysTable.programId,
    permissions: integrationApiKeysTable.permissions,
    programName: programsTable.name,
    createdAt: integrationApiKeysTable.createdAt,
    lastUsedAt: integrationApiKeysTable.lastUsedAt,
    revokedAt: integrationApiKeysTable.revokedAt,
  }).from(integrationApiKeysTable)
    .innerJoin(programsTable, eq(integrationApiKeysTable.programId, programsTable.id))
    .orderBy(desc(integrationApiKeysTable.createdAt));
  const displayKeys = keys.map(key => ({
    ...key,
    keyPrefix: displayIntegrationApiKeyPrefix(key.keyPrefix),
  }));
  res.json(ListIntegrationApiKeysResponse.parse({ keys: displayKeys }));
});

router.post("/integrations/api-keys", async (req, res): Promise<void> => {
  const parsed = CreateIntegrationApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const label = parsed.data.label.trim();
  if (!label) {
    res.status(400).json({ error: "Enter a name for this API key." });
    return;
  }
  const [program] = await db.select({ id: programsTable.id, name: programsTable.name })
    .from(programsTable)
    .where(eq(programsTable.id, parsed.data.programId))
    .limit(1);
  if (!program) {
    res.status(400).json({ error: "Choose an existing program." });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const secret = createIntegrationApiKeySecret();
  const [key] = await db.insert(integrationApiKeysTable).values({
    label,
    keyHash: hashIntegrationApiKey(secret),
    keyPrefix: secret.slice(0, 18),
    programId: program.id,
    permissions: parsed.data.permissions,
    createdByStaffId: staff.id,
  }).returning({
    id: integrationApiKeysTable.id,
    label: integrationApiKeysTable.label,
    keyPrefix: integrationApiKeysTable.keyPrefix,
    programId: integrationApiKeysTable.programId,
    permissions: integrationApiKeysTable.permissions,
    createdAt: integrationApiKeysTable.createdAt,
    lastUsedAt: integrationApiKeysTable.lastUsedAt,
    revokedAt: integrationApiKeysTable.revokedAt,
  });
  res.status(201).json(CreateIntegrationApiKeyResponse.parse({
    key: { ...key, programName: program.name },
    secret,
  }));
});

router.post("/integrations/api-keys/:id/revoke", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(404).json({ error: "API key not found." });
    return;
  }
  const [key] = await db.update(integrationApiKeysTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(integrationApiKeysTable.id, id),
      isNull(integrationApiKeysTable.revokedAt),
    ))
    .returning({ id: integrationApiKeysTable.id, revokedAt: integrationApiKeysTable.revokedAt });
  if (!key) {
    res.status(404).json({ error: "Active API key not found." });
    return;
  }
  res.json(RevokeIntegrationApiKeyResponse.parse(key));
});

export default router;
