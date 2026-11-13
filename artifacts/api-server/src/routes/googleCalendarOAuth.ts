import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  StartGoogleCalendarConnectionBody,
  StartGoogleCalendarConnectionResponse,
} from "@workspace/api-zod";
import { db, staffMembersTable } from "@workspace/db";
import { requireStaff } from "../middlewares/staffAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { requireRole } from "../middlewares/requireRole";
import {
  isGoogleCalendarOAuthStateValid,
  openGoogleCalendarOAuthState,
  sealGoogleCalendarOAuthState,
  type GoogleCalendarOAuthState,
} from "../lib/googleCalendarOAuthState";
import {
  encryptGoogleCalendarToken,
  googleCalendarPrivacy,
  syncGoogleCalendarMentor,
} from "../lib/googleCalendarSync";
import {
  fetchWithTimeout,
  googleCalendarProfileTimeoutMs,
  googleCalendarTokenTimeoutMs,
} from "../lib/outbound-http";

const router: IRouter = Router();
const cookieName = "jusoor_google_calendar_oauth";
const callbackPath = "/api/mentor/google-calendar/callback";
const stateLifetimeMs = 10 * 60 * 1000;

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

function approvedOrigin(candidate: string): string | null {
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
  if (process.env.NODE_ENV === "production" && parsed.port) return null;
  return parsed.origin;
}

function allowedOrigin(req: Request): string | null {
  const rawOrigin = req.get("origin");
  const forwardedProto = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  const candidate = rawOrigin ?? `${forwardedProto}://${req.get("host") ?? ""}`;
  return approvedOrigin(candidate);
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
  const body = StartGoogleCalendarConnectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid Google Calendar connection request." });
    return;
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = process.env.SESSION_SECRET;
  const key = secret ? createHash("sha256").update(secret).digest() : null;
  const origin = allowedOrigin(req);
  if (!clientId || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET || !key) {
    res.status(503).json({ error: "Google Calendar OAuth is not configured." });
    return;
  }
  if (!origin) {
    res.status(400).json({ error: "This app address is not approved for Google authorization." });
    return;
  }

  const staff = res.locals.staff as StaffAccess;
  const redirectUri = `${origin}${callbackPath}`;
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const payload: GoogleCalendarOAuthState = {
    staffId: staff.id,
    state,
    codeVerifier,
    origin,
    redirectUri,
    expiresAt: Date.now() + stateLifetimeMs,
  };
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", `openid email ${googleCalendarPrivacy.scope}`);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("prompt", "select_account consent");
  authorizationUrl.searchParams.set("access_type", "offline");

  res.cookie(cookieName, sealGoogleCalendarOAuthState(payload), {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    maxAge: stateLifetimeMs,
    path: callbackPath,
  });
  res.json(StartGoogleCalendarConnectionResponse.parse({
    authorizationUrl: authorizationUrl.toString(),
  }));
});

router.get("/callback", async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const payload = openGoogleCalendarOAuthState(cookieValue(req.get("cookie"), cookieName));
  if (!isGoogleCalendarOAuthStateValid(payload, state)) {
    clearStateCookie(res, req.secure);
    res.status(400).send("Google authorization expired or could not be verified. Return to the program and try again.");
    return;
  }

  const origin = approvedOrigin(payload.origin);
  if (
    !origin ||
    origin !== payload.origin ||
    payload.redirectUri !== `${origin}${callbackPath}`
  ) {
    clearStateCookie(res, req.secure);
    res.status(400).send("Google authorization expired or could not be verified. Return to the program and try again.");
    return;
  }

  clearStateCookie(res, origin.startsWith("https:"));
  const finish = (result: "connected" | "cancelled" | "error") => {
    const query = new URLSearchParams({ googleCalendar: result });
    res.redirect(302, `/mentor?${query.toString()}`);
  };

  if (typeof req.query.error === "string") {
    finish("cancelled");
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) {
    finish("error");
    return;
  }

  try {
    const [mentor] = await db.select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.id, payload.staffId),
        eq(staffMembersTable.role, "mentor"),
        eq(staffMembersTable.status, "active"),
      )).limit(1);
    if (!mentor) {
      finish("error");
      return;
    }

    const tokenResponse = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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
    }, googleCalendarTokenTimeoutMs);
    const tokenData = await tokenResponse.json().catch(() => ({})) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    if (
      !tokenResponse.ok ||
      typeof tokenData.access_token !== "string" ||
      !tokenData.access_token ||
      typeof tokenData.refresh_token !== "string" ||
      !tokenData.refresh_token ||
      typeof tokenData.expires_in !== "number" ||
      !Number.isFinite(tokenData.expires_in)
    ) {
      req.log.warn({ statusCode: tokenResponse.status }, "Google Calendar token exchange failed");
      finish("error");
      return;
    }

    const profileResponse = await fetchWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    }, googleCalendarProfileTimeoutMs);
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
      profile.email_verified !== true
    ) {
      req.log.warn({ statusCode: profileResponse.status }, "Google Calendar account verification failed");
      finish("error");
      return;
    }

    const [updatedMentor] = await db.update(staffMembersTable)
      .set({
        bookingProvider: "google_calendar",
        googleCalendarAccountEmail: profile.email.trim().toLowerCase(),
        googleCalendarRefreshTokenEncrypted: encryptGoogleCalendarToken(tokenData.refresh_token),
        googleCalendarAccessTokenEncrypted: encryptGoogleCalendarToken(tokenData.access_token),
        googleCalendarAccessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        googleCalendarSyncToken: null,
        googleCalendarSyncLastSuccessAt: null,
        googleCalendarSyncLastFailureAt: null,
        googleCalendarSyncConsecutiveFailures: 0,
        googleCalendarSyncNeedsReauthorization: false,
        googleCalendarSyncLastSkippedAt: null,
        googleCalendarSyncSkipCount: 0,
        googleCalendarBookingUrl: sql`case
          when lower(coalesce(${staffMembersTable.googleCalendarAccountEmail}, '')) <> ${profile.email.trim().toLowerCase()}
          then null
          else ${staffMembersTable.googleCalendarBookingUrl}
        end`,
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

    try {
      await syncGoogleCalendarMentor(payload.staffId);
    } catch (error) {
      req.log.warn(
        { mentorStaffId: payload.staffId, errorName: error instanceof Error ? error.name : "UnknownError" },
        "Google Calendar booking sync did not complete during connection",
      );
    }
    finish("connected");
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Google Calendar OAuth callback failed",
    );
    finish("error");
  }
});

export default router;
