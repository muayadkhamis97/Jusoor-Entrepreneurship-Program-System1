import { ReplitConnectors } from "@replit/connectors-sdk";
import type { EmailHealthReport, EmailHealthStep } from "@workspace/api-zod";
import type { ProgramEmailBranding } from "./email-branding";
import {
  gmailRequest, gmailResponseFailure, platformEmailFailureDiagnostics,
  sendPlatformEmail, stableMessageId, type ConnectorClient,
} from "./platform-email";

// Return only controlled status/reason fields, never provider bodies or mailbox data.
export async function runEmailHealth(
  input: { requestId: string; sendTest: boolean },
  verifiedEmail?: string,
  connectors: ConnectorClient = new ReplitConnectors(),
  loadBranding?: () => Promise<ProgramEmailBranding>,
): Promise<EmailHealthReport> {
  const steps: EmailHealthStep[] = [];
  let messageIdPreserved: boolean | null = null;
  const key = `email-health-${input.requestId}`;
  const expectedMessageId = verifiedEmail ? stableMessageId(key, verifiedEmail.toLowerCase()) : "health-check@platform.invalid";
  let existingMessageId: string | undefined;

  async function step(
    name: EmailHealthStep["step"],
    path: string,
    operation: "profile_lookup" | "sent_message_lookup" | "message_metadata",
  ): Promise<unknown> {
    try {
      const response = await gmailRequest(connectors, path, { method: "GET" }, 15_000);
      if (!response.ok) throw await gmailResponseFailure(response, operation);
      const data = await response.json();
      steps.push({ step: name, status: "ok", httpStatus: response.status, reason: null, failureKind: null });
      return data;
    } catch (error) {
      const detail = platformEmailFailureDiagnostics(error);
      steps.push({
        step: name, status: "failed", httpStatus: detail.providerStatus ?? null,
        reason: detail.errorCode ?? (detail.providerStatus ? null : "connector_unreachable"),
        failureKind: detail.failureKind,
      });
      return null;
    }
  }

  await step("profile", "/gmail/v1/users/me/profile", "profile_lookup");
  const query = new URLSearchParams({ q: `in:sent rfc822msgid:${expectedMessageId}`, maxResults: "1" });
  const lookup = await step("lookup", `/gmail/v1/users/me/messages?${query}`, "sent_message_lookup") as {
    messages?: Array<{ id?: string }>;
  } | null;
  existingMessageId = lookup?.messages?.[0]?.id;

  if (!input.sendTest || !verifiedEmail || steps.some(result => result.status !== "ok")) {
    steps.push({ step: "send", status: "skipped", httpStatus: null, reason: null, failureKind: null });
    return { steps, messageIdPreserved };
  }

  let gmailMessageId = existingMessageId;
  try {
    let httpStatus = 200;
    await sendPlatformEmail({
      recipients: [verifiedEmail],
      subject: "Program email health check",
      text: "This test checks the program's Gmail connection and duplicate-send protection. No participant data is included.",
      html: "<p>This test checks the program's Gmail connection and duplicate-send protection. No participant data is included.</p>",
      idempotencyKey: key,
    }, connectors, loadBranding, {}, receipt => {
      gmailMessageId = receipt.gmailMessageId;
      httpStatus = receipt.httpStatus;
    });
    steps.push({ step: "send", status: "ok", httpStatus, reason: null, failureKind: null });
  } catch (error) {
    const detail = platformEmailFailureDiagnostics(error);
    steps.push({
      step: "send", status: "failed", httpStatus: detail.providerStatus ?? null,
      reason: detail.errorCode ?? null, failureKind: detail.failureKind,
    });
    return { steps, messageIdPreserved };
  }

  if (gmailMessageId) {
    const metadata = await step(
      "metadata",
      `/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID`,
      "message_metadata",
    ) as { payload?: { headers?: Array<{ name?: string; value?: string }> } } | null;
    const header = metadata?.payload?.headers?.find(item => item.name?.toLowerCase() === "message-id")?.value;
    if (header) messageIdPreserved = header.trim().replace(/^<|>$/g, "") === expectedMessageId;
    else if (metadata) {
      steps[steps.length - 1] = { step: "metadata", status: "failed", httpStatus: 200, reason: "message_id_missing", failureKind: "unavailable" };
    }
  } else {
    steps.push({ step: "metadata", status: "failed", httpStatus: null, reason: "message_id_unavailable", failureKind: "unavailable" });
  }
  return { steps, messageIdPreserved };
}
