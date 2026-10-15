import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetEmailSenderStatusResponse as EmailSenderStatusSchema,
  StartGmailSenderConnectionBody,
  StartGmailSenderConnectionResponse,
} from "@workspace/api-zod";
import { db, emailSenderConnectionsTable, staffMembersTable } from "@workspace/db";
import { requireStaff, type StaffAccess } from "../middlewares/staffAccess";
import { requireRole } from "../middlewares/requireRole";
import {
  isGmailOAuthStateValid,
  openGmailOAuthState,
  openGmailRefreshToken,
  sealGmailOAuthState,
  sealGmailRefreshToken,
  type GmailOAuthState,
} from "../lib/gmailOAuthState";

const router: IRouter = Router();
const cookieName = "gmail_email_sender_oauth";
const callbackPath = "/api/email-sender/google/callback";
const stateLifetimeMs = 10 * 60 * 1000;

function validReturnPath(value: string): boolean {
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\?#\r\n]/.test(value) &&
    value.endsWith("/api-integrations") &&
    value.split("/").every((part) => part !== "." && part !== "..");
}

type GoogleTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

function isMissingSenderTable(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "42P01" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("email_sender_connections"),
  );
}

function configured(): boolean {
  return Boolean(
    process.env.GOOGLE_GMAIL_CLIENT_ID &&
    process.env.GOOGLE_GMAIL_CLIENT_SECRET &&
    process.env.SESSION_SECRET,
  );
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

function cookieValue(header: string | undefined): string | undefined {
  const part = header?.split(";").map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieName}=`));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(cookieName.length + 1));
  } catch {
    return undefined;
  }
}

function clearStateCookie(res: Response, secure: boolean): void {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: callbackPath,
  });
}

function finishCallback(
  res: Response,
  origin: string,
  returnPath: string,
  result: "connected" | "cancelled" | "error",
): void {
  const destination = new URL(returnPath, origin);
  destination.searchParams.set("gmailSender", result);
  res.redirect(302, destination.toString());
}

router.get(
  "/status",
  requireStaff,
  requireRole("coordinator"),
  async (req, res): Promise<void> => {
    const origin = allowedOrigin(req);
    res.setHeader("Cache-Control", "no-store");
    try {
      const [connection] = await db.select({
        accountEmail: emailSenderConnectionsTable.accountEmail,
        connectedAt: emailSenderConnectionsTable.connectedAt,
      }).from(emailSenderConnectionsTable)
        .where(eq(emailSenderConnectionsTable.provider, "gmail"))
        .limit(1);
      res.json(EmailSenderStatusSchema.parse({
        clientConfigured: configured(),
        storageReady: true,
        connected: Boolean(connection),
        accountEmail: connection?.accountEmail ?? null,
        connectedAt: connection?.connectedAt ?? null,
        callbackUrl: origin ? `${origin}${callbackPath}` : null,
      }));
    } catch (error) {
      if (!isMissingSenderTable(error)) throw error;
      req.log.warn("Email sender migration is not applied.");
      res.json(EmailSenderStatusSchema.parse({
        clientConfigured: configured(),
        storageReady: false,
        connected: false,
        accountEmail: null,
        connectedAt: null,
        callbackUrl: origin ? `${origin}${callbackPath}` : null,
      }));
    }
  },
);

router.post(
  "/google/connect",
  requireStaff,
  requireRole("coordinator"),
  async (req, res): Promise<void> => {
    const body = StartGmailSenderConnectionBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Invalid Gmail sender connection request." });
      return;
    }
    if (!validReturnPath(body.data.returnPath)) {
      res.status(400).json({ error: "Invalid integration page return path." });
      return;
    }
    const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
    const origin = allowedOrigin(req);
    if (!clientId || !process.env.GOOGLE_GMAIL_CLIENT_SECRET || !process.env.SESSION_SECRET) {
      res.status(503).json({ error: "Google OAuth credentials are not configured." });
      return;
    }
    if (!origin) {
      res.status(400).json({ error: "This app address is not approved for Google authorization." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    try {
      await db.select({ id: emailSenderConnectionsTable.id }).from(emailSenderConnectionsTable).limit(1);
    } catch (error) {
      if (isMissingSenderTable(error)) {
        res.status(503).json({ error: "Email sender storage migration is not applied." });
        return;
      }
      throw error;
    }

    const staff = res.locals.staff as StaffAccess;
    const redirectUri = `${origin}${callbackPath}`;
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const state = randomBytes(32).toString("base64url");
    const payload: GmailOAuthState = {
      staffId: staff.id,
      state,
      codeVerifier,
      origin,
      redirectUri,
      returnPath: body.data.returnPath,
      expiresAt: Date.now() + stateLifetimeMs,
    };
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", "openid email https://www.googleapis.com/auth/gmail.send");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("prompt", "consent select_account");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");

    res.cookie(cookieName, sealGmailOAuthState(payload), {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "lax",
      maxAge: stateLifetimeMs,
      path: callbackPath,
    });
    res.json(StartGmailSenderConnectionResponse.parse({
      authorizationUrl: authorizationUrl.toString(),
    }));
  },
);

router.get("/google/callback", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const suppliedState = typeof req.query.state === "string" ? req.query.state : undefined;
  const payload = openGmailOAuthState(cookieValue(req.get("cookie")));
  if (
    !isGmailOAuthStateValid(payload, suppliedState) ||
    !payload ||
    payload.redirectUri !== `${payload.origin}${callbackPath}` ||
    !validReturnPath(payload.returnPath)
  ) {
    const forwardedProto = (req.get("x-forwarded-proto") ?? "").split(",")[0].trim();
    clearStateCookie(res, req.secure || forwardedProto === "https");
    res.status(400).send("Google authorization expired or could not be verified. Return to the app and try again.");
    return;
  }
  clearStateCookie(res, payload.origin.startsWith("https:"));
  if (typeof req.query.error === "string") {
    finishCallback(res, payload.origin, payload.returnPath, "cancelled");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) {
    finishCallback(res, payload.origin, payload.returnPath, "error");
    return;
  }

  try {
    const [staff] = await db.select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.id, payload.staffId),
        eq(staffMembersTable.role, "coordinator"),
        eq(staffMembersTable.status, "active"),
      ))
      .limit(1);
    if (!staff) {
      finishCallback(res, payload.origin, payload.returnPath, "error");
      return;
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: payload.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: payload.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokenData = await tokenResponse.json().catch(() => ({})) as GoogleTokenResponse;
    if (!tokenResponse.ok || typeof tokenData.access_token !== "string" || !tokenData.access_token) {
      req.log.warn({ statusCode: tokenResponse.status }, "Gmail sender token exchange failed");
      finishCallback(res, payload.origin, payload.returnPath, "error");
      return;
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const profile = await profileResponse.json().catch(() => ({})) as {
      sub?: unknown;
      email?: unknown;
      email_verified?: unknown;
    };
    if (
      !profileResponse.ok ||
      typeof profile.sub !== "string" ||
      !profile.sub ||
      typeof profile.email !== "string" ||
      !profile.email.trim() ||
      !/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(profile.email.trim()) ||
      profile.email_verified !== true
    ) {
      req.log.warn({ statusCode: profileResponse.status }, "Gmail sender account verification failed");
      finishCallback(res, payload.origin, payload.returnPath, "error");
      return;
    }

    const accountEmail = profile.email.trim().toLowerCase();
    let encryptedRefreshToken: string;
    if (typeof tokenData.refresh_token === "string" && tokenData.refresh_token) {
      encryptedRefreshToken = sealGmailRefreshToken(tokenData.refresh_token);
    } else {
      const [existing] = await db.select({
        accountEmail: emailSenderConnectionsTable.accountEmail,
        encryptedRefreshToken: emailSenderConnectionsTable.encryptedRefreshToken,
      }).from(emailSenderConnectionsTable)
        .where(eq(emailSenderConnectionsTable.provider, "gmail"))
        .limit(1);
      if (!existing || existing.accountEmail !== accountEmail || !openGmailRefreshToken(existing.encryptedRefreshToken)) {
        finishCallback(res, payload.origin, payload.returnPath, "error");
        return;
      }
      encryptedRefreshToken = existing.encryptedRefreshToken;
    }

    const now = new Date();
    await db.insert(emailSenderConnectionsTable).values({
      provider: "gmail",
      accountEmail,
      encryptedRefreshToken,
      connectedByStaffId: staff.id,
      connectedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: emailSenderConnectionsTable.provider,
      set: {
        accountEmail,
        encryptedRefreshToken,
        connectedByStaffId: staff.id,
        connectedAt: now,
        updatedAt: now,
      },
    });
    finishCallback(res, payload.origin, payload.returnPath, "connected");
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Gmail sender authorization callback failed",
    );
    finishCallback(res, payload.origin, payload.returnPath, "error");
  }
});

router.delete(
  "/google",
  requireStaff,
  requireRole("coordinator"),
  async (req, res): Promise<void> => {
    if (!allowedOrigin(req)) {
      res.status(400).json({ error: "This app address is not approved for this request." });
      return;
    }
    const [connection] = await db.select({
      encryptedRefreshToken: emailSenderConnectionsTable.encryptedRefreshToken,
    }).from(emailSenderConnectionsTable)
      .where(eq(emailSenderConnectionsTable.provider, "gmail"))
      .limit(1);
    if (connection) {
      const refreshToken = openGmailRefreshToken(connection.encryptedRefreshToken);
      if (refreshToken) {
        try {
          const revocationResponse = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: refreshToken }),
            signal: AbortSignal.timeout(5000),
          });
          if (!revocationResponse.ok) {
            req.log.warn(
              { statusCode: revocationResponse.status },
              "Google did not confirm token revocation; local sender credentials will still be removed",
            );
          }
        } catch (error) {
          req.log.warn(
            { errorName: error instanceof Error ? error.name : "UnknownError" },
            "Google token revocation was unavailable; local sender credentials will still be removed",
          );
        }
      }
      await db.delete(emailSenderConnectionsTable)
        .where(eq(emailSenderConnectionsTable.provider, "gmail"));
    }
    res.sendStatus(204);
  },
);

export default router;
