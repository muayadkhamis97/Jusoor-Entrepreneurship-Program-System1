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
export class PlatformEmailSendUncertainError extends Error {
  readonly operation = "send";
  readonly httpStatus?: number;
  readonly errorCode?: string;

  constructor(
    message: string,
    details: { httpStatus?: number; errorCode?: string } = {},
  ) {
    super(message);
    this.name = "PlatformEmailSendUncertainError";
    this.httpStatus = details.httpStatus;
    this.errorCode = details.errorCode;
  }
}

export function platformEmailFailureDiagnostics(error: unknown): Record<string, string | number> {
  if (error instanceof PlatformEmailSendUncertainError) {
    return {
      failureKind: "delivery_outcome_unknown",
      operation: error.operation,
      ...(error.httpStatus ? { providerStatus: error.httpStatus } : {}),
      ...(error.errorCode ? { errorCode: error.errorCode } : {}),
    };
  }

  if (error instanceof Error) {
    const httpFailure = /^Gmail (profile lookup|send|sent-message lookup) returned HTTP ([1-5]\d\d)\.$/.exec(error.message);
    if (httpFailure) {
      const operation = httpFailure[1] === "profile lookup"
        ? "profile_lookup"
        : httpFailure[1] === "sent-message lookup"
          ? "sent_message_lookup"
          : "send";
      return {
        failureKind: "gmail_http_error",
        operation,
        providerStatus: Number(httpFailure[2]),
      };
    }
    if (error.message === "Gmail did not return the connected account address.") {
      return { failureKind: "gmail_profile_missing_address", operation: "profile_lookup" };
    }
  }

  const errorCode = safeErrorCode(error);
  const errorName = error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
    ? error.name
    : "UnknownError";
  return {
    failureKind: "unclassified_email_error",
    errorName,
    ...(errorCode ? { errorCode } : {}),
  };
}

function safeErrorCode(error: unknown): string | undefined {
  const visited = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object" && !visited.has(current); depth++) {
    visited.add(current);
    const candidate = current as { code?: unknown; errorCode?: unknown; cause?: unknown };
    for (const value of [candidate.errorCode, candidate.code]) {
      if (typeof value === "string") {
        const normalized = value.toUpperCase();
        if (/^(?:E[A-Z0-9]{2,31}|ERR_[A-Z0-9_]{1,32}|UND_[A-Z0-9_]{1,32}|[0-9A-Z]{5})$/.test(normalized)) {
          return normalized;
        }
      }
    }
    current = candidate.cause;
  }
  return undefined;
}

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
    } catch (error) {
      throw new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.", {
        errorCode: safeErrorCode(error),
      });
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 408) {
        throw new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.", {
          httpStatus: response.status,
        });
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
