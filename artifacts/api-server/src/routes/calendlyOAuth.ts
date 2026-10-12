import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  StartCalendlyConnectionBody,
  StartCalendlyConnectionResponse,
} from "@workspace/api-zod";
import {
  businessesTable,
  calendlyMeetingsTable,
  db,
  staffMembersTable,
  supportTable,
} from "@workspace/db";
import { requireStaff } from "../middlewares/staffAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { requireRole } from "../middlewares/requireRole";
import {
  isCalendlyOAuthStateValid,
  openCalendlyOAuthState,
  sealCalendlyOAuthState,
  type CalendlyOAuthState,
} from "../lib/calendlyOAuthState";

const router: IRouter = Router();
const cookieName = "jusoor_calendly_oauth";
const callbackPath = "/api/mentor/calendly/callback";
const stateLifetimeMs = 10 * 60 * 1000;
const webhookTimestampToleranceMs = 3 * 60 * 1000;

function encryptionKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function sealSecret(value: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("SESSION_SECRET is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function openSecret(value: string | null | undefined): string | null {
  const key = encryptionKey();
  if (!key || !value) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  const part = header?.split(";").map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function allowedOrigin(req: Request): string | null {
  const rawOrigin = req.get("origin");
  const forwardedProto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  const candidate = rawOrigin ?? `${forwardedProto}://${req.get("host") ?? ""}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) return null;

  const registeredHosts = [
    process.env.REPLIT_DEV_DOMAIN ?? "",
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  ].map((entry) => entry.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0].toLowerCase())
    .filter((entry): entry is string => Boolean(entry));
  const hostname = parsed.hostname.toLowerCase();
  const loopbackInDevelopment = process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (!registeredHosts.includes(hostname) && !loopbackInDevelopment) return null;
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return null;
  return parsed.origin;
}

async function createWebhookSubscription(
  accessToken: string,
  webhookUrl: string,
  userUri: string,
  organizationUri: string,
  signingKey: string,
): Promise<{ uri: string; status: number } | null> {
  const response = await fetch("https://api.calendly.com/webhook_subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: organizationUri,
      scope: "user",
      user: userUri,
      signing_key: signingKey,
    }),
  });
  if (!response.ok) return { uri: "", status: response.status };
  const result = await response.json() as { resource?: { uri?: unknown } };
  return typeof result.resource?.uri === "string"
    ? { uri: result.resource.uri, status: response.status }
    : { uri: "", status: response.status };
}

function clearStateCookie(res: Response, secure: boolean): void {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: callbackPath,
  });
}

router.post("/connect", requireStaff, requireRole("mentor"), (req, res): void => {
  const body = StartCalendlyConnectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid Calendly connection request." });
    return;
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const key = secret ? createHash("sha256").update(secret).digest() : null;
  const origin = allowedOrigin(req);
  if (!clientId || !process.env.CALENDLY_CLIENT_SECRET || !key) {
    res.status(503).json({ error: "Calendly OAuth is not configured." });
    return;
  }
  if (!origin) {
    res.status(400).json({ error: "This app address is not approved for Calendly authorization." });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const redirectUri = `${origin}${callbackPath}`;
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const payload: CalendlyOAuthState = {
    staffId: staff.id,
    state,
    codeVerifier,
    origin,
    redirectUri,
    expiresAt: Date.now() + stateLifetimeMs,
  };

  const authorizationUrl = new URL("https://auth.calendly.com/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", "users:read scheduled_events:read webhooks:write");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  res.cookie(cookieName, sealCalendlyOAuthState(payload), {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    maxAge: stateLifetimeMs,
    path: callbackPath,
  });
  res.json(StartCalendlyConnectionResponse.parse({
    authorizationUrl: authorizationUrl.toString(),
  }));
});

router.get("/callback", async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const payload = openCalendlyOAuthState(cookieValue(req.get("cookie"), cookieName));
  if (!isCalendlyOAuthStateValid(payload, state)) {
    clearStateCookie(res, req.secure);
    res.status(400).send("Calendly authorization expired or could not be verified. Return to Jusoor and try again.");
    return;
  }

  clearStateCookie(res, payload.origin.startsWith("https:"));
  const finish = (result: "connected" | "cancelled" | "error") => {
    const destination = new URL("/mentor", payload.origin);
    destination.searchParams.set("calendly", result);
    res.redirect(302, destination.toString());
  };

  if (typeof req.query.error === "string") {
    finish("cancelled");
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) {
    finish("error");
    return;
  }

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: payload.redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: payload.codeVerifier,
    });
    const tokenResponse = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: tokenBody,
    });
    if (!tokenResponse.ok) {
      req.log.warn({ statusCode: tokenResponse.status }, "Calendly token exchange failed");
      finish("error");
      return;
    }
    const tokenData = await tokenResponse.json() as { access_token?: unknown };
    if (typeof tokenData.access_token !== "string" || tokenData.access_token.length === 0) {
      finish("error");
      return;
    }

    const profileResponse = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    if (!profileResponse.ok) {
      req.log.warn({ statusCode: profileResponse.status }, "Calendly profile lookup failed");
      finish("error");
      return;
    }
    const profile = await profileResponse.json() as {
      resource?: {
        scheduling_url?: unknown;
        uri?: unknown;
        current_organization?: unknown;
      };
    };
    const bookingUrl = profile.resource?.scheduling_url;
    const calendlyUserUri = profile.resource?.uri;
    const organizationUri = profile.resource?.current_organization;
    if (
      typeof bookingUrl !== "string" ||
      typeof calendlyUserUri !== "string" ||
      typeof organizationUri !== "string"
    ) {
      finish("error");
      return;
    }
    const parsedBookingUrl = new URL(bookingUrl);
    if (
      parsedBookingUrl.protocol !== "https:" ||
      parsedBookingUrl.username ||
      parsedBookingUrl.password ||
      !(parsedBookingUrl.hostname === "calendly.com" || parsedBookingUrl.hostname.endsWith(".calendly.com"))
    ) {
      finish("error");
      return;
    }

    if (
      !calendlyUserUri.startsWith("https://api.calendly.com/users/") ||
      !organizationUri.startsWith("https://api.calendly.com/organizations/")
    ) {
      finish("error");
      return;
    }

    const [mentor] = await db.select({
      id: staffMembersTable.id,
      webhookTokenEncrypted: staffMembersTable.calendlyWebhookTokenEncrypted,
      webhookSecretEncrypted: staffMembersTable.calendlyWebhookSecretEncrypted,
      webhookSubscriptionUri: staffMembersTable.calendlyWebhookSubscriptionUri,
    }).from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.id, payload.staffId),
        eq(staffMembersTable.role, "mentor"),
        eq(staffMembersTable.status, "active"),
      )).limit(1);
    if (!mentor) {
      finish("error");
      return;
    }

    const webhookToken = openSecret(mentor.webhookTokenEncrypted) ?? randomBytes(32).toString("base64url");
    const signingKey = openSecret(mentor.webhookSecretEncrypted) ?? randomBytes(32).toString("base64url");
    const webhookUrl = `${payload.origin}/api/mentor/calendly/webhook/${webhookToken}`;
    const subscription = await createWebhookSubscription(
      tokenData.access_token,
      webhookUrl,
      calendlyUserUri,
      organizationUri,
      signingKey,
    );
    if (!subscription?.uri) {
      req.log.warn({ statusCode: subscription?.status ?? 0 }, "Calendly webhook subscription failed");
      finish("error");
      return;
    }

    if (mentor.webhookSubscriptionUri) {
      try {
        const previousUri = new URL(mentor.webhookSubscriptionUri);
        if (
          previousUri.protocol === "https:" &&
          previousUri.hostname === "api.calendly.com" &&
          previousUri.pathname.startsWith("/webhook_subscriptions/")
        ) {
          const deletion = await fetch(previousUri, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
          });
          if (!deletion.ok && deletion.status !== 404) {
            req.log.warn({ statusCode: deletion.status }, "Previous Calendly webhook cleanup failed");
          }
        }
      } catch {
        req.log.warn("Previous Calendly webhook cleanup failed");
      }
    }

    const [updatedMentor] = await db.update(staffMembersTable)
      .set({
        calendlyBookingUrl: parsedBookingUrl.toString(),
        calendlyWebhookTokenHash: createHash("sha256").update(webhookToken).digest("hex"),
        calendlyWebhookTokenEncrypted: sealSecret(webhookToken),
        calendlyWebhookSecretEncrypted: sealSecret(signingKey),
        calendlyWebhookSubscriptionUri: subscription.uri,
      })
      .where(and(
        eq(staffMembersTable.id, payload.staffId),
        eq(staffMembersTable.role, "mentor"),
        eq(staffMembersTable.status, "active"),
      ))
      .returning({ id: staffMembersTable.id });
    if (!updatedMentor) {
      finish("error");
      return;
    }

    // The OAuth access token is used only to register the webhook and is never persisted.
    finish("connected");
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Calendly OAuth callback failed",
    );
    finish("error");
  }
});

router.post("/webhook/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!token || !rawBody || token.length > 256) {
    res.status(401).json({ error: "Invalid Calendly webhook." });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [mentor] = await db.select({
    id: staffMembersTable.id,
    webhookSecretEncrypted: staffMembersTable.calendlyWebhookSecretEncrypted,
  }).from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.calendlyWebhookTokenHash, tokenHash),
      eq(staffMembersTable.role, "mentor"),
      eq(staffMembersTable.status, "active"),
    )).limit(1);
  const signingKey = openSecret(mentor?.webhookSecretEncrypted);
  const signatureHeader = req.get("Calendly-Webhook-Signature");
  const timestampMatch = signatureHeader?.match(/(?:^|,)t=(\d+)(?:,|$)/);
  const signatureMatch = signatureHeader?.match(/(?:^|,)v1=([a-f\d]{64})(?:,|$)/i);
  const timestamp = timestampMatch?.[1];
  const suppliedSignature = signatureMatch?.[1];
  const timestampMs = timestamp ? Number(timestamp) * 1000 : Number.NaN;
  if (
    !mentor ||
    !signingKey ||
    !timestamp ||
    !suppliedSignature ||
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > webhookTimestampToleranceMs
  ) {
    res.status(401).json({ error: "Invalid Calendly webhook signature." });
    return;
  }

  const expectedSignature = createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody.toString("utf8")}`, "utf8")
    .digest();
  const receivedSignature = Buffer.from(suppliedSignature, "hex");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    res.status(401).json({ error: "Invalid Calendly webhook signature." });
    return;
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    res.status(400).json({ error: "Invalid Calendly webhook payload." });
    return;
  }
  if (!isRecord(envelope) || !isRecord(envelope.payload)) {
    res.status(400).json({ error: "Invalid Calendly webhook payload." });
    return;
  }
  if (envelope.event !== "invitee.created" && envelope.event !== "invitee.canceled") {
    res.sendStatus(200);
    return;
  }

  const data = envelope.payload;
  const scheduledEvent = data.scheduled_event;
  const createdAt = typeof envelope.created_at === "string" ? new Date(envelope.created_at) : null;
  const startsAt = isRecord(scheduledEvent) && typeof scheduledEvent.start_time === "string"
    ? new Date(scheduledEvent.start_time)
    : null;
  const endsAt = isRecord(scheduledEvent) && typeof scheduledEvent.end_time === "string"
    ? new Date(scheduledEvent.end_time)
    : null;
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const inviteeUri = typeof data.uri === "string" ? data.uri : "";
  const scheduledEventUri = isRecord(scheduledEvent) && typeof scheduledEvent.uri === "string"
    ? scheduledEvent.uri
    : "";
  if (
    !createdAt ||
    !Number.isFinite(createdAt.getTime()) ||
    !startsAt ||
    !Number.isFinite(startsAt.getTime()) ||
    !endsAt ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt ||
    !email ||
    email.length > 320 ||
    !inviteeUri.startsWith("https://calendly.com/scheduled_events/") ||
    !scheduledEventUri.startsWith("https://api.calendly.com/scheduled_events/")
  ) {
    res.status(400).json({ error: "Invalid Calendly meeting details." });
    return;
  }

  const matchedBusinesses = await db.selectDistinct({ id: businessesTable.id })
    .from(businessesTable)
    .innerJoin(supportTable, and(
      eq(supportTable.businessId, businessesTable.id),
      eq(supportTable.mentorStaffId, mentor.id),
      eq(supportTable.type, "mentor"),
    ))
    .where(sql`lower(${businessesTable.email}) = ${email}`);
  if (matchedBusinesses.length !== 1) {
    req.log.warn(
      { mentorStaffId: mentor.id, matchingAssignedBusinesses: matchedBusinesses.length },
      "Calendly meeting could not be matched to one assigned founder",
    );
    res.sendStatus(200);
    return;
  }

  const canceled = envelope.event === "invitee.canceled" || data.status === "canceled";
  const rescheduled = canceled && (
    data.rescheduled === true ||
    (typeof data.new_invitee === "string" && data.new_invitee.length > 0)
  );
  const status = canceled ? (rescheduled ? "rescheduled" : "cancelled") : "confirmed";
  const [savedMeeting] = await db.insert(calendlyMeetingsTable).values({
    businessId: matchedBusinesses[0]!.id,
    mentorStaffId: mentor.id,
    inviteeUri,
    scheduledEventUri,
    eventName: isRecord(scheduledEvent) && typeof scheduledEvent.name === "string" && scheduledEvent.name.trim()
      ? scheduledEvent.name.trim().slice(0, 300)
      : "Mentoring session",
    startsAt,
    endsAt,
    timezone: typeof data.timezone === "string" && data.timezone.length <= 100 ? data.timezone : null,
    status,
    lastEventAt: createdAt,
  }).onConflictDoUpdate({
    target: calendlyMeetingsTable.inviteeUri,
    set: {
      businessId: matchedBusinesses[0]!.id,
      mentorStaffId: mentor.id,
      scheduledEventUri,
      eventName: isRecord(scheduledEvent) && typeof scheduledEvent.name === "string" && scheduledEvent.name.trim()
        ? scheduledEvent.name.trim().slice(0, 300)
        : "Mentoring session",
      startsAt,
      endsAt,
      timezone: typeof data.timezone === "string" && data.timezone.length <= 100 ? data.timezone : null,
      status,
      lastEventAt: createdAt,
      updatedAt: new Date(),
    },
    setWhere: lt(calendlyMeetingsTable.lastEventAt, createdAt),
  }).returning({ id: calendlyMeetingsTable.id });

  const oldInvitee = typeof data.old_invitee === "string" ? data.old_invitee : null;
  if (oldInvitee && status === "confirmed") {
    await db.update(calendlyMeetingsTable)
      .set({ status: "rescheduled", lastEventAt: createdAt, updatedAt: new Date() })
      .where(and(
        eq(calendlyMeetingsTable.inviteeUri, oldInvitee),
        eq(calendlyMeetingsTable.mentorStaffId, mentor.id),
        lt(calendlyMeetingsTable.lastEventAt, createdAt),
      ));
  }

  req.log.info(
    { mentorStaffId: mentor.id, meetingId: savedMeeting?.id ?? null, event: envelope.event },
    "Calendly meeting update received",
  );
  res.sendStatus(200);
});

export default router;
