import { ReplitConnectors } from "@replit/connectors-sdk";
import { createHash } from "node:crypto";
import {
  loadProgramEmailBranding,
  renderBrandedEmailHtml,
  renderBrandedEmailText,
  visibleEmailBrandName,
  type ProgramEmailBranding,
} from "./email-branding";
import {
  fetchWithTimeout,
  gmailProfileTimeoutMs,
  gmailSendTimeoutMs,
  gmailSentLookupTimeoutMs,
  promiseWithTimeout,
} from "./outbound-http";

export type PlatformEmail = {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type EmailFailureKind =
  | "quota"
  | "needs_reconnect"
  | "invalid_recipient"
  | "transient"
  | "ambiguous";

export type EmailSendResult =
  | { kind: "sent"; gmailMessageId?: string }
  | { kind: EmailFailureKind; retryAfterMs?: number; diagnostics?: EmailFailureDiagnostics };

export type EmailFailureDiagnostics = {
  failureKind: string;
  errorName?: string;
  operation?: string;
  providerStatus?: number;
  errorCode?: string;
};

export type EmailConnectionResult =
  | { kind: "ready" }
  | { kind: "quota" | "needs_reconnect" | "transient"; retryAfterMs?: number; diagnostics?: EmailFailureDiagnostics };

export interface EmailTransport {
  checkConnection(): Promise<EmailConnectionResult>;
  send(message: PlatformEmail): Promise<EmailSendResult>;
}

export type ConnectorClient = Pick<ReplitConnectors, "proxy"> &
  Partial<Pick<ReplitConnectors, "createProxyFetch" | "getProxyUrl">>;
type LoadEmailBranding = () => Promise<ProgramEmailBranding>;
type ConnectorRequestOptions = {
  method: string;
  body?: unknown;
};

export type PlatformEmailTimeouts = {
  profileMs: number;
  sendMs: number;
  sentLookupMs: number;
};

const defaultConnectorProxy = ReplitConnectors.prototype.proxy;

export class PlatformEmailProviderError extends Error {
  readonly httpStatus?: number;
  readonly errorCode?: string;
  readonly retryAfterMs?: number;
  readonly operation: string;

  constructor(
    readonly kind: Exclude<EmailFailureKind, "ambiguous">,
    message: string,
    details: { httpStatus?: number; errorCode?: string; retryAfterMs?: number; operation?: string } = {},
  ) {
    super(message);
    this.name = "PlatformEmailProviderError";
    this.httpStatus = details.httpStatus;
    this.errorCode = details.errorCode;
    this.retryAfterMs = details.retryAfterMs;
    this.operation = details.operation ?? "provider_request";
  }
}

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

export function platformEmailFailureDiagnostics(error: unknown): EmailFailureDiagnostics {
  if (error instanceof PlatformEmailSendUncertainError) {
    return {
      failureKind: "delivery_outcome_unknown",
      operation: error.operation,
      ...(error.httpStatus ? { providerStatus: error.httpStatus } : {}),
      ...(error.errorCode ? { errorCode: error.errorCode } : {}),
    };
  }
  if (error instanceof PlatformEmailProviderError) {
    return {
      failureKind: `gmail_${error.kind}`,
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
  timeouts: Partial<PlatformEmailTimeouts> = {},
  onAccepted?: (receipt: { gmailMessageId: string; messageId: string; httpStatus: number }) => void,
): Promise<void> {
  const requestTimeouts = {
    profileMs: timeouts.profileMs ?? gmailProfileTimeoutMs,
    sendMs: timeouts.sendMs ?? gmailSendTimeoutMs,
    sentLookupMs: timeouts.sentLookupMs ?? gmailSentLookupTimeoutMs,
  };
  const recipients = [...new Set(message.recipients.map(validateEmailAddress))];
  if (!recipients.length) throw new Error("Email has no recipients.");
  const subject = validateHeader(message.subject, "subject");
  if (!message.idempotencyKey.trim()) {
    throw new Error("Email delivery requires an idempotency key.");
  }
  const branding = await loadBranding();
  const brandedText = renderBrandedEmailText(message.text, branding);
  const brandedHtml = renderBrandedEmailHtml(message.html, branding);

  const profile = await connectedGmailProfile(connectors, requestTimeouts.profileMs);
  const from = profile.emailAddress;

  for (const recipient of recipients) {
    const messageId = stableMessageId(message.idempotencyKey, recipient);
    if (await wasAlreadySent(connectors, messageId, requestTimeouts.sentLookupMs)) continue;

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
      response = await gmailRequest(
        connectors,
        "/gmail/v1/users/me/messages/send",
        { method: "POST", body: { raw } },
        requestTimeouts.sendMs,
      );
    } catch (error) {
      throw new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.", {
        errorCode: safeErrorCode(error),
      });
    }
    if (!response.ok) {
      throw await gmailResponseFailure(response, "send");
    }
    const accepted = await response.json().catch(() => null) as { id?: unknown } | null;
    if (typeof accepted?.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(accepted.id)) {
      onAccepted?.({ gmailMessageId: accepted.id, messageId, httpStatus: response.status });
    }
  }
}

export function createGmailEmailTransport(
  connectors: ConnectorClient = new ReplitConnectors(),
  loadBranding: LoadEmailBranding = loadProgramEmailBranding,
  timeouts: Partial<PlatformEmailTimeouts> = {},
): EmailTransport {
  return {
    async checkConnection(): Promise<EmailConnectionResult> {
      try {
        await connectedGmailProfile(connectors, timeouts.profileMs ?? gmailProfileTimeoutMs);
        await wasAlreadySent(connectors, "health-check@platform.invalid", timeouts.sentLookupMs ?? gmailSentLookupTimeoutMs);
        return { kind: "ready" };
      } catch (error) {
        const result = toEmailSendResult(error, "profile_lookup");
        return {
          kind: result.kind === "sent" || result.kind === "ambiguous" || result.kind === "invalid_recipient"
            ? "transient"
            : result.kind,
          ...("diagnostics" in result ? { diagnostics: result.diagnostics } : {}),
          ...("retryAfterMs" in result && result.retryAfterMs
            ? { retryAfterMs: result.retryAfterMs }
            : {}),
        };
      }
    },
    async send(message: PlatformEmail): Promise<EmailSendResult> {
      try {
        let gmailMessageId: string | undefined;
        await sendPlatformEmail(message, connectors, loadBranding, timeouts, receipt => {
          gmailMessageId = receipt.gmailMessageId;
        });
        return { kind: "sent", ...(gmailMessageId ? { gmailMessageId } : {}) };
      } catch (error) {
        return toEmailSendResult(error, "send");
      }
    },
  };
}

export const gmailEmailTransport: EmailTransport = createGmailEmailTransport();

async function connectedGmailProfile(
  connectors: ConnectorClient,
  timeoutMs: number,
): Promise<{ emailAddress: string }> {
  let response: Response;
  try {
    response = await gmailRequest(
      connectors,
      "/gmail/v1/users/me/profile",
      { method: "GET" },
      timeoutMs,
    );
  } catch (error) {
    throw toProviderFailure(error, "profile_lookup");
  }
  if (!response.ok) throw await gmailResponseFailure(response, "profile_lookup");

  let profile: { emailAddress?: unknown };
  try {
    profile = await response.json() as { emailAddress?: unknown };
  } catch {
    throw new PlatformEmailProviderError("transient", "Gmail profile response was unavailable.");
  }
  if (typeof profile.emailAddress !== "string") {
    throw new PlatformEmailProviderError(
      "needs_reconnect",
      "Gmail did not return the connected account address.",
    );
  }
  try {
    return { emailAddress: validateEmailAddress(profile.emailAddress) };
  } catch {
    throw new PlatformEmailProviderError(
      "needs_reconnect",
      "Gmail did not return a valid connected account address.",
    );
  }
}

async function wasAlreadySent(
  connectors: ConnectorClient,
  messageId: string,
  timeoutMs: number,
): Promise<boolean> {
  const query = new URLSearchParams({
    q: `in:sent rfc822msgid:${messageId}`,
    maxResults: "1",
  });
  let response: Response;
  try {
    response = await gmailRequest(
      connectors,
      `/gmail/v1/users/me/messages?${query.toString()}`,
      { method: "GET" },
      timeoutMs,
    );
  } catch (error) {
    throw toProviderFailure(error, "sent_message_lookup");
  }
  if (!response.ok) throw await gmailResponseFailure(response, "sent_message_lookup");
  let result: { messages?: unknown };
  try {
    result = await response.json() as { messages?: unknown };
  } catch {
    throw new PlatformEmailProviderError("transient", "Gmail sent-message lookup was unavailable.");
  }
  return Array.isArray(result.messages) && result.messages.length > 0;
}

type GmailOperation = "profile_lookup" | "sent_message_lookup" | "send" | "message_metadata";

export async function gmailResponseFailure(
  response: Response,
  operation: GmailOperation,
): Promise<PlatformEmailProviderError | PlatformEmailSendUncertainError> {
  const payload = await response.clone().json().catch(() => null) as {
    error?: { status?: unknown; errors?: Array<{ reason?: unknown }> };
  } | null;
  const reasons = [
    ...(Array.isArray(payload?.error?.errors)
      ? payload.error.errors.map(error => error.reason).filter((reason): reason is string => typeof reason === "string")
      : []),
    ...(typeof payload?.error?.status === "string" ? [payload.error.status] : []),
  ];
  const normalizedReasons = reasons.map(reason => reason.toLowerCase());
  const rateLimited = response.status === 429 || normalizedReasons.some(reason =>
    /rate.?limit|daily.?limit|quota.?exceeded|user.?rate.?limit/.test(reason),
  );
  const errorCode = reasons.find(reason => /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(reason));
  if (rateLimited) {
    const dailyQuota = normalizedReasons.some(reason => /daily.?limit|quota.?exceeded/.test(reason));
    return new PlatformEmailProviderError(
      "quota",
      "Gmail sending is temporarily limited.",
      {
        httpStatus: response.status,
        operation,
        ...(errorCode ? { errorCode } : {}),
        retryAfterMs: retryAfterMs(response, dailyQuota),
      },
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new PlatformEmailProviderError(
      "needs_reconnect",
      "The connected Gmail account needs to be reconnected.",
      { httpStatus: response.status, operation, ...(errorCode ? { errorCode } : {}) },
    );
  }
  if (operation === "send" && (response.status >= 500 || response.status === 408)) {
    return new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.", {
      httpStatus: response.status,
      ...(errorCode ? { errorCode } : {}),
    });
  }
  if (operation === "send" && response.status === 400) {
    return new PlatformEmailProviderError(
      "invalid_recipient",
      "Gmail rejected the recipient address.",
      { httpStatus: response.status, operation, ...(errorCode ? { errorCode } : {}) },
    );
  }
  return new PlatformEmailProviderError(
    "transient",
    `Gmail ${operation.replaceAll("_", " ")} returned HTTP ${response.status}.`,
    { httpStatus: response.status, operation, ...(errorCode ? { errorCode } : {}) },
  );
}

function retryAfterMs(response: Response, dailyQuota: boolean): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 24 * 60 * 60_000);
  }
  return dailyQuota ? 24 * 60 * 60_000 : 60 * 60_000;
}

function toProviderFailure(
  error: unknown,
  operation: GmailOperation,
): PlatformEmailProviderError | PlatformEmailSendUncertainError {
  if (error instanceof PlatformEmailProviderError || error instanceof PlatformEmailSendUncertainError) {
    return error;
  }
  const errorCode = safeErrorCode(error);
  if (operation === "send") {
    return new PlatformEmailSendUncertainError("Gmail delivery outcome is unknown.", {
      ...(errorCode ? { errorCode } : {}),
    });
  }
  return new PlatformEmailProviderError(
    "needs_reconnect",
    `Gmail ${operation.replaceAll("_", " ")} could not be completed.`,
    { operation, ...(errorCode ? { errorCode } : {}) },
  );
}

function toEmailSendResult(
  error: unknown,
  operation: GmailOperation,
): EmailSendResult {
  const failure = toProviderFailure(error, operation);
  return {
    kind: failure instanceof PlatformEmailSendUncertainError ? "ambiguous" : failure.kind,
    diagnostics: platformEmailFailureDiagnostics(failure),
    ...("retryAfterMs" in failure && failure.retryAfterMs
      ? { retryAfterMs: failure.retryAfterMs }
      : {}),
  };
}

export async function gmailRequest(
  connectors: ConnectorClient,
  path: string,
  options: ConnectorRequestOptions,
  timeoutMs: number,
): Promise<Response> {
  if (
    connectors.proxy === defaultConnectorProxy &&
    connectors.createProxyFetch &&
    connectors.getProxyUrl
  ) {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (options.body !== undefined && options.body !== null) {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
    return fetchWithTimeout(
      `${connectors.getProxyUrl()}${path.startsWith("/") ? path : `/${path}`}`,
      {
        method: options.method,
        ...(body ? { body } : {}),
        headers,
      },
      timeoutMs,
      connectors.createProxyFetch("google-mail"),
    );
  }

  // ProxyOptions currently has no AbortSignal. Bound compatible mock/client
  // implementations too; production uses createProxyFetch above to abort I/O.
  return promiseWithTimeout(
    connectors.proxy("google-mail", path, options),
    timeoutMs,
  );
}

export function stableMessageId(idempotencyKey: string, recipient: string): string {
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
