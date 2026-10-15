import { ReplitConnectors } from "@replit/connectors-sdk";
import { eq } from "drizzle-orm";
import { db, emailSenderConnectionsTable } from "@workspace/db";
import { buildGmailRawMessage } from "./gmailMessage";
import { openGmailRefreshToken } from "./gmailOAuthState";

export type PlatformEmail = {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  fallbackFrom?: string;
  idempotencyKey?: string;
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

export async function sendPlatformEmail(message: PlatformEmail): Promise<"gmail" | "resend"> {
  let connection: { accountEmail: string; encryptedRefreshToken: string } | undefined;
  try {
    [connection] = await db.select({
      accountEmail: emailSenderConnectionsTable.accountEmail,
      encryptedRefreshToken: emailSenderConnectionsTable.encryptedRefreshToken,
    }).from(emailSenderConnectionsTable)
      .where(eq(emailSenderConnectionsTable.provider, "gmail"))
      .limit(1);
  } catch (error) {
    if (!isMissingSenderTable(error)) throw error;
  }

  if (connection) {
    await sendWithGmail(connection, message);
    return "gmail";
  }

  const fallbackFrom = message.fallbackFrom?.trim();
  if (!fallbackFrom || /[\r\n]/.test(fallbackFrom) || !fallbackFrom.includes("@")) {
    throw new Error("No Gmail sender is connected and the existing email sender is not configured.");
  }
  if (!message.recipients.length) throw new Error("Email has no recipients.");

  const response = await new ReplitConnectors().proxy("resend", "/emails/batch", {
    method: "POST",
    ...(message.idempotencyKey
      ? { headers: { "Idempotency-Key": message.idempotencyKey } }
      : {}),
    body: message.recipients.map((to) => ({
      from: fallbackFrom,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  return "resend";
}

async function sendWithGmail(
  connection: { accountEmail: string; encryptedRefreshToken: string },
  message: PlatformEmail,
): Promise<void> {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const refreshToken = openGmailRefreshToken(connection.encryptedRefreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("The Gmail sender connection needs to be reauthorized.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokens = await tokenResponse.json().catch(() => ({})) as { access_token?: unknown };
  if (!tokenResponse.ok || typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new Error("Google could not refresh the Gmail sender authorization.");
  }

  const raw = buildGmailRawMessage({
    from: connection.accountEmail,
    recipients: message.recipients,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Gmail returned HTTP ${response.status}.`);
}
