import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gte, or, isNull } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";
import {
  ListApplicationProgramsResponse,
  SubmitApplicationBody,
  SubmitApplicationResponse,
} from "@workspace/api-zod";
import { applicationsTable, db, programsTable } from "@workspace/db";
import { consumeDatabaseRateLimit } from "../lib/databaseRateLimit";
import { lockGoogleSheetsProgram, queueGoogleSheetsEvent } from "../lib/googleSheetsSync";

const router: IRouter = Router();
const APPLICATION_IP_LIMIT = 20;
const APPLICATION_IP_WINDOW_MS = 10 * 60_000;
const APPLICATION_EMAIL_LIMIT = 5;
const APPLICATION_EMAIL_WINDOW_MS = 60 * 60_000;
const TOO_MANY_APPLICATIONS_ERROR = "Too many applications from this connection. Please wait a few minutes and try again.";

async function checkApplicationRateLimit(
  req: Request,
  res: Response,
  key: string,
  maximum: number,
  periodMs: number,
): Promise<boolean> {
  let result;
  try {
    result = await consumeDatabaseRateLimit(key, maximum, periodMs);
  } catch (error) {
    req.log.error({ err: error }, "Public application rate limit could not be checked");
    res.status(503).json({ error: "Application submissions are temporarily unavailable. Please try again shortly." });
    return false;
  }
  if (!result.allowed) {
    res.setHeader("Retry-After", result.retryAfterSeconds);
    res.status(429).json({ error: TOO_MANY_APPLICATIONS_ERROR });
    return false;
  }
  return true;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/public/application-programs", async (req, res): Promise<void> => {
  const programs = await db.select({
    id: programsTable.id,
    name: programsTable.name,
    format: programsTable.format,
    description: programsTable.description,
    applicationDeadline: programsTable.applicationDeadline,
  })
    .from(programsTable)
    .where(and(
      eq(programsTable.status, "outreach"),
      isNull(programsTable.archivedAt),
      or(isNull(programsTable.applicationDeadline), gte(programsTable.applicationDeadline, todayUtc())),
    ))
    .orderBy(asc(programsTable.applicationDeadline), asc(programsTable.name));
  res.json(ListApplicationProgramsResponse.parse(programs));
});

router.post("/applications", async (req, res): Promise<void> => {
  const source = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const trim = (value: unknown): unknown => typeof value === "string" ? value.trim() : value;
  const email = trim(source.email);
  if (!await checkApplicationRateLimit(
    req, res, `public-application:ip:${req.ip}`, APPLICATION_IP_LIMIT, APPLICATION_IP_WINDOW_MS,
  )) return;
  if (typeof email === "string" && email.length > 0 && !await checkApplicationRateLimit(
    req,
    res,
    `public-application:email:${email.toLowerCase()}`,
    APPLICATION_EMAIL_LIMIT,
    APPLICATION_EMAIL_WINDOW_MS,
  )) return;

  if (typeof source.contactNote === "string" && source.contactNote.trim().length > 0) {
    req.log.info("Public application honeypot field was filled");
    res.status(201).json(SubmitApplicationResponse.parse({
      id: 0,
      status: "submitted",
      createdAt: new Date(),
    }));
    return;
  }

  const optionalText = (key: string): unknown => {
    const value = trim(source[key]);
    return value === "" ? null : value;
  };
  const parsed = SubmitApplicationBody.safeParse({
    ...source,
    founderName: trim(source.founderName),
    email: typeof email === "string" ? email.toLowerCase() : email,
    phone: optionalText("phone"),
    businessName: trim(source.businessName),
    industry: optionalText("industry"),
    website: optionalText("website"),
    summary: trim(source.summary),
    supportNeeds: trim(source.supportNeeds),
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;

  const [program] = await db.select({
    id: programsTable.id,
    status: programsTable.status,
    applicationDeadline: programsTable.applicationDeadline,
    archivedAt: programsTable.archivedAt,
  }).from(programsTable)
    .where(eq(programsTable.id, input.programId))
    .limit(1);

  if (
    !program ||
    program.archivedAt !== null ||
    program.status !== "outreach" ||
    (program.applicationDeadline !== null && program.applicationDeadline < todayUtc())
  ) {
    res.status(400).json({ error: "Applications are not open for this program." });
    return;
  }

  const { userId } = getAuth(req);
  let clerkUserId: string | null = null;
  if (userId) {
    try {
      const user = await clerkClient.users.getUser(userId);
      const verifiedPrimaryEmail = user.emailAddresses.find(
        (entry) => entry.id === user.primaryEmailAddressId && entry.verification?.status === "verified",
      );
      const verifiedEmail = verifiedPrimaryEmail?.emailAddress.trim().toLowerCase();
      if (verifiedEmail && verifiedEmail !== input.email) {
        res.status(400).json({ error: "Use your verified primary email when applying while signed in." });
        return;
      }
      if (verifiedEmail === input.email) clerkUserId = userId;
    } catch (error) {
      req.log.error({ err: error }, "Could not verify signed-in applicant email");
      res.status(503).json({ error: "Your signed-in email could not be verified right now." });
      return;
    }
  }

  const application = await db.transaction(async (tx) => {
    await lockGoogleSheetsProgram(tx, input.programId);
    const [created] = await tx.insert(applicationsTable)
      .values({ ...input, clerkUserId })
      .onConflictDoNothing()
      .returning({
        id: applicationsTable.id,
        programId: applicationsTable.programId,
        status: applicationsTable.status,
        createdAt: applicationsTable.createdAt,
      });
    if (created) {
      await queueGoogleSheetsEvent(tx, {
        programId: created.programId,
        sourceType: "application",
        sourceId: created.id,
      });
    }
    return created;
  });

  if (!application) {
    res.status(409).json({ error: "This email already has an application for this program." });
    return;
  }

  res.status(201).json(SubmitApplicationResponse.parse(application));
});

export default router;
