import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreateOrUpdateZoomMeetingParams,
  CreateOrUpdateZoomMeetingResponse,
  DisconnectZoomBody,
  GetZoomStatusResponse,
  StartZoomConnectionBody,
  StartZoomConnectionResponse,
  SyncZoomRecordingParams,
  SyncZoomRecordingResponse,
} from "@workspace/api-zod";
import {
  db,
  sessionsTable,
  staffMembersTable,
  zoomConnectionsTable,
} from "@workspace/db";
import { requireStaff } from "../middlewares/staffAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { requireRole } from "../middlewares/requireRole";
import {
  createOrUpdateZoomMeeting,
  getZoomConnection,
  hasZoomOAuthConfiguration,
  removeZoomConnection,
  saveZoomConnection,
  syncZoomRecording,
  ZoomIntegrationError,
} from "../lib/zoom";

const router: IRouter = Router();
const cookieName = "jusoor_zoom_oauth";
const callbackPath = "/api/zoom/callback";
const stateLifetimeMs = 10 * 60 * 1000;

type OAuthState = {
  staffId: number;
  state: string;
  codeVerifier: string;
  origin: string;
  redirectUri: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

function stateEncryptionKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  return secret
    ? createHash("sha256")
        .update("jusoor.zoom.oauth-state.v1\0")
        .update(secret)
        .digest()
    : null;
}

function sealState(value: OAuthState): string {
  const key = stateEncryptionKey();
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
  const key = stateEncryptionKey();
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
    ) {
      return null;
    }
    return parsed as OAuthState;
  } catch {
    return null;
  }
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  const part = header
    ?.split(";")
    .map((entry) => entry.trim())
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
  const forwardedProto = (req.get("x-forwarded-proto") ?? req.protocol)
    .split(",")[0]
    .trim();
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
  ) {
    return null;
  }
  const registeredHosts = [
    process.env.REPLIT_DEV_DOMAIN ?? "",
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  ]
    .map((entry) =>
      entry
        .trim()
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        ?.split(":")[0]
        .toLowerCase(),
    )
    .filter((entry): entry is string => Boolean(entry));
  const hostname = parsed.hostname.toLowerCase();
  const loopbackInDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (!registeredHosts.includes(hostname) && !loopbackInDevelopment) return null;
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    return null;
  }
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

function sendZoomError(res: Response, error: unknown): void {
  if (error instanceof ZoomIntegrationError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  res.status(502).json({ error: "Zoom could not complete this request." });
}

router.get(
  "/status",
  requireStaff,
  requireRole("coordinator"),
  async (_req, res): Promise<void> => {
    const connection = await getZoomConnection();
    let connectedBy: string | null = null;
    if (connection?.connectedByStaffId) {
      const [staff] = await db
        .select({ email: staffMembersTable.email })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.id, connection.connectedByStaffId))
        .limit(1);
      connectedBy = staff?.email ?? null;
    }
    const origin = allowedOrigin(_req);
    res.json(
      GetZoomStatusResponse.parse({
        clientConfigured: hasZoomOAuthConfiguration(),
        connected: Boolean(connection),
        connectedAt: connection?.connectedAt ?? null,
        connectedBy,
        callbackUrl: origin ? `${origin}${callbackPath}` : null,
      }),
    );
  },
);

router.post(
  "/connect",
  requireStaff,
  requireRole("coordinator"),
  (req, res): void => {
    const body = StartZoomConnectionBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Invalid Zoom connection request." });
      return;
    }
    const clientId = process.env.ZOOM_CLIENT_ID;
    const origin = allowedOrigin(req);
    if (!clientId || !process.env.ZOOM_CLIENT_SECRET || !stateEncryptionKey()) {
      res.status(503).json({ error: "Zoom OAuth app credentials are not configured." });
      return;
    }
    if (!origin) {
      res.status(400).json({
        error: "This app address is not approved for Zoom authorization.",
      });
      return;
    }

    const staff = res.locals.staff as StaffAccess;
    const redirectUri = `${origin}${callbackPath}`;
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const state = randomBytes(32).toString("base64url");
    const payload: OAuthState = {
      staffId: staff.id,
      state,
      codeVerifier,
      origin,
      redirectUri,
      expiresAt: Date.now() + stateLifetimeMs,
    };
    const authorizationUrl = new URL("https://zoom.us/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
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
    res.json(
      StartZoomConnectionResponse.parse({
        authorizationUrl: authorizationUrl.toString(),
      }),
    );
  },
);

router.get("/callback", async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const payload = openState(cookieValue(req.get("cookie"), cookieName));
  if (!payload || !state || payload.state !== state || payload.expiresAt < Date.now()) {
    clearStateCookie(res, req.secure);
    res
      .status(400)
      .send("Zoom authorization expired or could not be verified. Return to Jusoor and try again.");
    return;
  }
  clearStateCookie(res, payload.origin.startsWith("https:"));

  const finish = (result: "connected" | "cancelled" | "error") => {
    const destination = new URL("/sessions", payload.origin);
    destination.searchParams.set("zoom", result);
    res.redirect(302, destination.toString());
  };
  if (typeof req.query.error === "string") {
    finish("cancelled");
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) {
    finish("error");
    return;
  }

  try {
    const [staff] = await db
      .select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(
        and(
          eq(staffMembersTable.id, payload.staffId),
          eq(staffMembersTable.role, "coordinator"),
          eq(staffMembersTable.status, "active"),
        ),
      )
      .limit(1);
    if (!staff) {
      finish("error");
      return;
    }

    const tokenResponse = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: payload.redirectUri,
        code_verifier: payload.codeVerifier,
      }),
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as TokenResponse;
    if (
      !tokenResponse.ok ||
      typeof tokenData.access_token !== "string" ||
      typeof tokenData.refresh_token !== "string" ||
      typeof tokenData.expires_in !== "number"
    ) {
      req.log.warn(
        { statusCode: tokenResponse.status },
        "Zoom authorization code exchange failed",
      );
      finish("error");
      return;
    }
    await saveZoomConnection(
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
      },
      staff.id,
    );
    finish("connected");
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Zoom OAuth callback failed",
    );
    finish("error");
  }
});

router.post(
  "/disconnect",
  requireStaff,
  requireRole("coordinator"),
  async (req, res): Promise<void> => {
    const body = DisconnectZoomBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Invalid Zoom disconnect request." });
      return;
    }
    await removeZoomConnection();
    res.sendStatus(204);
  },
);

router.post(
  "/sessions/:id/meeting",
  requireStaff,
  requireRole("coordinator"),
  async (req, res): Promise<void> => {
    const params = CreateOrUpdateZoomMeetingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.id))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    try {
      const updatedSession = await createOrUpdateZoomMeeting(session);
      res.json(CreateOrUpdateZoomMeetingResponse.parse(updatedSession));
    } catch (error) {
      sendZoomError(res, error);
    }
  },
);

router.post(
  "/sessions/:id/recording",
  requireStaff,
  requireRole("coordinator"),
  async (req, res): Promise<void> => {
    const params = SyncZoomRecordingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.id))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    try {
      const updatedSession = await syncZoomRecording(session);
      res.json(SyncZoomRecordingResponse.parse(updatedSession));
    } catch (error) {
      sendZoomError(res, error);
    }
  },
);

export default router;
