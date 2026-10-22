import { ReplitConnectors } from "@replit/connectors-sdk";
import { createHash } from "node:crypto";
import {
  loadProgramEmailBranding,
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  visibleEmailBrandName,
  type ProgramEmailBranding,
} from "./email-branding";

export type PlatformEmail = {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

type ConnectorClient = Pick<ReplitConnectors, "proxy">;
type LoadEmailBranding = () => Promise<ProgramEmailBranding>;

// Only use safe retries when Gmail definitely did not accept this attempt.
export class PlatformEmailSendUncertainError extends Error {}

export async function sendPlatformEmail(
  message: PlatformEmail,
  connectors: ConnectorClient = new ReplitConnectors(),
  loadBranding: LoadEmailBranding = loadProgramEmailBranding,
): Promise<void> {
  const recipients = [...new Set(message.recipients.map(validateEmailAddress))];
  if (!recipients.length) throw new Error("Email has no recipients.");
  const subject = validateHeader(message.subject, "subject");
  if (!message.idempotencyKey.trim()) {
    throw new Error("Email delivery requires an idempotency key.");
  }
  const branding = await loadBranding();
  const brandedText = renderBrandedEmailText(message.text, branding);
  const brandedHtml = renderBrandedEmailHtml(message.html, branding);

  const profileResponse = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/profile",
    { method: "GET" },
  );
  if (!profileResponse.ok) {
    throw new Error(`Gmail profile lookup returned HTTP ${profileResponse.status}.`);
  }
  const profile = await profileResponse.json() as { emailAddress?: unknown };
  if (typeof profile.emailAddress !== "string") {
    throw new Error("Gmail did not return the connected account address.");
  }
  const from = validateEmailAddress(profile.emailAddress);

  for (const recipient of recipients) {
    const messageId = stableMessageId(message.idempotencyKey, recipient);
    if (await wasAlreadySent(connectors, messageId)) continue;

    const raw = encodeMessage({
      from: formatFromHeader(visibleEmailBrandName(branding.brandName), from),
      to: recipient,
      subject,
      text: brandedText,
      html: brandedHtml,
      messageId,
    });
    let response: Awaited<ReturnType<ConnectorClient["proxy"]>>;
    try {
      response = await connectors.proxy(
        "google-mail",
        "/gmail/v1/users/me/messages/send",
        { method: "POST", body: { raw } },
      );
    } catch {
      throw new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.");
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 408) {
        throw new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.");
      }
      throw new Error(`Gmail send returned HTTP ${response.status}.`);
    }
  }
}

async function wasAlreadySent(
  connectors: ConnectorClient,
  messageId: string,
): Promise<boolean> {
  const query = new URLSearchParams({
    q: `in:sent rfc822msgid:${messageId}`,
    maxResults: "1",
  });
  const response = await connectors.proxy(
    "google-mail",
    `/gmail/v1/users/me/messages?${query.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) {
    throw new Error(`Gmail sent-message lookup returned HTTP ${response.status}.`);
  }
  const result = await response.json() as { messages?: unknown };
  return Array.isArray(result.messages) && result.messages.length > 0;
}

function stableMessageId(idempotencyKey: string, recipient: string): string {
  const digest = createHash("sha256")
    .update(`${idempotencyKey}\0${recipient.toLowerCase()}`)
    .digest("hex");
  return `${digest}@platform.invalid`;
}

function formatFromHeader(displayName: string, emailAddress: string): string {
  const encodedName = Buffer.from(displayName, "utf8").toString("base64");
  return `=?UTF-8?B?${encodedName}?= <${emailAddress}>`;
}

function encodeMessage(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
}): string {
  const boundary = `alt_${input.messageId.slice(0, 32)}`;
  const encodedSubject = Buffer.from(input.subject, "utf8").toString("base64");
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${input.messageId}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

function wrapBase64(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .replace(/\r\n$/, "");
}

function validateHeader(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw new Error(`Invalid email ${name}.`);
  }
  return normalized;
}

function validateEmailAddress(value: string): string {
  const normalized = value.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalized)) {
    throw new Error("Email contains an invalid address.");
  }
  return normalized;
}
