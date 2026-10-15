import { ReplitConnectors } from "@replit/connectors-sdk";

export type PlatformEmail = {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  fallbackFrom?: string;
  idempotencyKey?: string;
};

export async function sendPlatformEmail(message: PlatformEmail): Promise<void> {
  const fallbackFrom = message.fallbackFrom?.trim();
  if (!fallbackFrom || /[\r\n]/.test(fallbackFrom) || !fallbackFrom.includes("@")) {
    throw new Error("The platform email sender is not configured.");
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
}
