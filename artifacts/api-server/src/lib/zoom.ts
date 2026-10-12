import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  sessionsTable,
  zoomConnectionsTable,
  type Session,
  type ZoomConnection,
} from "@workspace/db";

const zoomApiBase = "https://api.zoom.us/v2";
const zoomWebhookTimestampToleranceMs = 5 * 60 * 1000;

export class ZoomIntegrationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ZoomIntegrationError";
  }
}

type ZoomTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

type ZoomMeeting = {
  id?: number | string;
  join_url?: unknown;
};

export function hasZoomOAuthConfiguration(): boolean {
  return Boolean(
    process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET &&
      process.env.SESSION_SECRET,
  );
}

export function verifyZoomWebhookSignature(
  rawBody: Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (
    !secretToken ||
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    !signature
  ) {
    return false;
  }
  const timestampMs = Number(timestamp) * 1000;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > zoomWebhookTimestampToleranceMs
  ) {
    return false;
  }
  const signatureMatch = signature.match(/^v0=([a-f\d]{64})$/i);
  if (!signatureMatch) return false;

  const expected = createHmac("sha256", secretToken)
    .update(`v0:${timestamp}:${rawBody.toString("utf8")}`, "utf8")
    .digest();
  const received = Buffer.from(signatureMatch[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createZoomWebhookValidationResponse(
  plainToken: string,
): { plainToken: string; encryptedToken: string } {
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secretToken) {
    throw new ZoomIntegrationError(
      "Zoom webhook validation is not configured.",
      503,
    );
  }
  return {
    plainToken,
    encryptedToken: createHmac("sha256", secretToken)
      .update(plainToken, "utf8")
      .digest("hex"),
  };
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new ZoomIntegrationError(
      "Zoom token encryption is not available. Contact the platform administrator.",
      503,
    );
  }
  return createHash("sha256")
    .update("jusoor.zoom.tokens.v1\0")
    .update(secret)
    .digest();
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptToken(value: string): string | null {
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function saveZoomConnection(
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  connectedByStaffId: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
  const values = {
    provider: "zoom",
    connectedByStaffId,
    encryptedAccessToken: encryptToken(tokens.accessToken),
    encryptedRefreshToken: encryptToken(tokens.refreshToken),
    accessTokenExpiresAt: expiresAt,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  await db
    .insert(zoomConnectionsTable)
    .values(values)
    .onConflictDoUpdate({
      target: zoomConnectionsTable.provider,
      set: values,
    });
}

export async function removeZoomConnection(): Promise<void> {
  await db
    .delete(zoomConnectionsTable)
    .where(eq(zoomConnectionsTable.provider, "zoom"));
}

export async function getZoomConnection(): Promise<ZoomConnection | null> {
  const [connection] = await db
    .select()
    .from(zoomConnectionsTable)
    .where(eq(zoomConnectionsTable.provider, "zoom"))
    .limit(1);
  return connection ?? null;
}

async function getAccessToken(): Promise<string> {
  if (!hasZoomOAuthConfiguration()) {
    throw new ZoomIntegrationError(
      "Zoom OAuth app credentials are not configured.",
      503,
    );
  }
  const connection = await getZoomConnection();
  if (!connection) {
    throw new ZoomIntegrationError("Connect a Zoom account first.", 409);
  }

  const currentAccessToken = decryptToken(connection.encryptedAccessToken);
  if (
    currentAccessToken &&
    connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return currentAccessToken;
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new ZoomIntegrationError(
      "Zoom authorization needs to be reconnected.",
      409,
    );
  }

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as ZoomTokenResponse;
  if (!response.ok) {
    throw new ZoomIntegrationError(
      response.status === 401 || response.status === 400
        ? "Zoom authorization needs to be reconnected."
        : "Zoom could not refresh its authorization. Try again shortly.",
      response.status === 401 || response.status === 400 ? 409 : 502,
    );
  }
  if (
    typeof result.access_token !== "string" ||
    typeof result.expires_in !== "number"
  ) {
    throw new ZoomIntegrationError(
      "Zoom returned an invalid authorization response.",
      502,
    );
  }
  const nextRefreshToken =
    typeof result.refresh_token === "string" ? result.refresh_token : refreshToken;
  await db
    .update(zoomConnectionsTable)
    .set({
      encryptedAccessToken: encryptToken(result.access_token),
      encryptedRefreshToken: encryptToken(nextRefreshToken),
      accessTokenExpiresAt: new Date(Date.now() + result.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(zoomConnectionsTable.id, connection.id));
  return result.access_token;
}

async function zoomRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${zoomApiBase}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new ZoomIntegrationError(
        "Zoom authorization needs to be reconnected.",
        409,
      );
    }
    if (response.status === 403) {
      throw new ZoomIntegrationError(
        "Zoom is missing a permission required for this action. Check the app scopes and reconnect.",
        409,
      );
    }
    if (response.status === 404) {
      throw new ZoomIntegrationError(
        "Zoom could not find this meeting or recording.",
        404,
      );
    }
    throw new ZoomIntegrationError(
      "Zoom could not complete this request. Try again shortly.",
      502,
    );
  }
  return result as T;
}

function validateJoinUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new ZoomIntegrationError(
      "Zoom did not return a participant join link.",
      502,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ZoomIntegrationError(
      "Zoom returned an invalid participant join link.",
      502,
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !(parsed.hostname === "zoom.us" || parsed.hostname.endsWith(".zoom.us"))
  ) {
    throw new ZoomIntegrationError(
      "Zoom returned an invalid participant join link.",
      502,
    );
  }
  return parsed.toString();
}

function meetingStartTime(session: Session): string {
  if (!session.startTime) {
    throw new ZoomIntegrationError(
      "Add a start time to this session before creating its Zoom meeting.",
      400,
    );
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(session.startTime)) {
    throw new ZoomIntegrationError(
      "This session has an invalid start time. Edit the time and try again.",
      400,
    );
  }
  return `${session.scheduledDate}T${session.startTime}:00`;
}

export async function createOrUpdateZoomMeeting(
  session: Session,
): Promise<Session> {
  if (session.deliveryMode === "in_person") {
    throw new ZoomIntegrationError(
      "Only online or hybrid sessions can have a Zoom meeting.",
      400,
    );
  }
  if (session.status === "cancelled") {
    throw new ZoomIntegrationError(
      "A cancelled session cannot have a Zoom meeting.",
      400,
    );
  }

  const meetingBody = {
    topic: session.title,
    type: 2,
    start_time: meetingStartTime(session),
    duration: session.durationMinutes,
  };
  let meeting: ZoomMeeting;
  if (session.zoomMeetingId) {
    const meetingId = encodeURIComponent(session.zoomMeetingId);
    await zoomRequest<unknown>(`/meetings/${meetingId}`, {
      method: "PATCH",
      body: meetingBody,
    });
    meeting = await zoomRequest<ZoomMeeting>(`/meetings/${meetingId}`);
  } else {
    meeting = await zoomRequest<ZoomMeeting>("/users/me/meetings", {
      method: "POST",
      body: meetingBody,
    });
  }

  if (meeting.id === undefined || meeting.id === null) {
    throw new ZoomIntegrationError(
      "Zoom created the meeting but returned no meeting ID.",
      502,
    );
  }
  const [updatedSession] = await db
    .update(sessionsTable)
    .set({
      zoomMeetingId: String(meeting.id),
      zoomUrl: validateJoinUrl(meeting.join_url),
    })
    .where(eq(sessionsTable.id, session.id))
    .returning();
  if (!updatedSession) {
    throw new ZoomIntegrationError("Session not found.", 404);
  }
  return updatedSession;
}
