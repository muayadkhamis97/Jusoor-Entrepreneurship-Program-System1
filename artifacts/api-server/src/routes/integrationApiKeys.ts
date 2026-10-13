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
} from "@workspace/db";
import { requireCoordinator, requireStaff, type StaffAccess } from "../middlewares/staffAccess";

export type IntegrationApiKeyContext = {
  id: number;
  programId: number;
  createdByStaffId: number;
};

export function hashIntegrationApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function createIntegrationApiKeySecret(): string {
  return `jusoor_live_${randomBytes(32).toString("base64url")}`;
}

const rateWindows = new Map<number, { startedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

export const requireIntegrationApiKey: RequestHandler = async (req, res, next): Promise<void> => {
  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer (jusoor_live_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) {
    res.status(401).json({ error: "A valid Jusoor integration API key is required." });
    return;
  }

  try {
    const keyHash = hashIntegrationApiKey(match[1]);
    const [key] = await db.select({
      id: integrationApiKeysTable.id,
      programId: integrationApiKeysTable.programId,
      createdByStaffId: integrationApiKeysTable.createdByStaffId,
    }).from(integrationApiKeysTable)
      .where(and(
        eq(integrationApiKeysTable.keyHash, keyHash),
        isNull(integrationApiKeysTable.revokedAt),
      ))
      .limit(1);
    if (!key) {
      res.status(401).json({ error: "A valid Jusoor integration API key is required." });
      return;
    }

    const now = Date.now();
    const window = rateWindows.get(key.id);
    if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
      rateWindows.set(key.id, { startedAt: now, count: 1 });
    } else if (window.count >= RATE_LIMIT) {
      res.setHeader("Retry-After", Math.ceil((RATE_WINDOW_MS - (now - window.startedAt)) / 1000));
      res.status(429).json({ error: "API request limit reached. Try again shortly." });
      return;
    } else {
      window.count += 1;
    }
    if (rateWindows.size > 10_000) {
      for (const [id, item] of rateWindows) {
        if (now - item.startedAt >= RATE_WINDOW_MS) rateWindows.delete(id);
      }
    }

    await db.update(integrationApiKeysTable)
      .set({ lastUsedAt: new Date(now) })
      .where(and(
        eq(integrationApiKeysTable.id, key.id),
        isNull(integrationApiKeysTable.revokedAt),
      ));
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
    programName: programsTable.name,
    createdAt: integrationApiKeysTable.createdAt,
    lastUsedAt: integrationApiKeysTable.lastUsedAt,
    revokedAt: integrationApiKeysTable.revokedAt,
  }).from(integrationApiKeysTable)
    .innerJoin(programsTable, eq(integrationApiKeysTable.programId, programsTable.id))
    .orderBy(desc(integrationApiKeysTable.createdAt));
  res.json(ListIntegrationApiKeysResponse.parse({ keys }));
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
    createdByStaffId: staff.id,
  }).returning({
    id: integrationApiKeysTable.id,
    label: integrationApiKeysTable.label,
    keyPrefix: integrationApiKeysTable.keyPrefix,
    programId: integrationApiKeysTable.programId,
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
  rateWindows.delete(key.id);
  res.json(RevokeIntegrationApiKeyResponse.parse(key));
});

export default router;
