import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  StartCalendlyConnectionBody,
  StartCalendlyConnectionResponse,
} from "@workspace/api-zod";
import { db, staffMembersTable } from "@workspace/db";
import { requireStaff } from "../middlewares/staffAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();
const cookieName = "jusoor_calendly_oauth";
const callbackPath = "/api/mentor/calendly/callback";
const stateLifetimeMs = 10 * 60 * 1000;

type OAuthState = {
  staffId: number;
  state: string;
  codeVerifier: string;
  origin: string;
  redirectUri: string;
  expiresAt: number;
};

function encryptionKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function sealState(value: OAuthState): string {
  const key = encryptionKey();
  if (!key) throw new Error("SESSION_SECRET is not configured.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function openState(value: string | undefined): OAuthState | null {
  const key = encryptionKey();
  if (!key || !value) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Partial<OAuthState>;
    if (
      typeof parsed.staffId !== "number" ||
      typeof parsed.state !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.origin !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) return null;
    return parsed as OAuthState;
  } catch {
    return null;
  }
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
  const key = encryptionKey();
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
  const payload: OAuthState = {
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
  authorizationUrl.searchParams.set("scope", "users:read");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  res.cookie(cookieName, sealState(payload), {
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
  const payload = openState(cookieValue(req.get("cookie"), cookieName));
  if (!payload || !state || payload.state !== state || payload.expiresAt < Date.now()) {
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
      resource?: { scheduling_url?: unknown };
    };
    const bookingUrl = profile.resource?.scheduling_url;
    if (typeof bookingUrl !== "string") {
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

    const [updatedMentor] = await db.update(staffMembersTable)
      .set({ calendlyBookingUrl: parsedBookingUrl.toString() })
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

    // Access tokens are used only for this profile lookup and are never persisted.
    finish("connected");
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Calendly OAuth callback failed",
    );
    finish("error");
  }
});

export default router;
