import {
  gmailEmailTransport,
  type EmailSendResult,
  type PlatformEmail,
} from "./platform-email";
import { participantAccessUrl } from "./participant-invitation-email";

export type ReplyEmailNotificationStatus = "sent" | "failed" | "uncertain";
export type ReplyEmailFailureKind = Exclude<EmailSendResult["kind"], "sent">;

export type StaffReplyNotificationInput = {
  replyId: number;
  announcementId: number;
  applicationId: number;
  participantEmail: string;
  participantName: string;
  programName: string;
};

export function participantAnnouncementConversationUrl(
  appUrl: string | undefined,
  announcementId: number,
  applicationId: number,
): string | null {
  const participantUrl = participantAccessUrl(appUrl);
  if (!participantUrl || !Number.isSafeInteger(announcementId) || announcementId < 1 ||
    !Number.isSafeInteger(applicationId) || applicationId < 1) return null;
  const url = new URL(participantUrl);
  url.pathname = "/participant/updates";
  url.searchParams.set("announcementId", String(announcementId));
  url.searchParams.set("applicationId", String(applicationId));
  return url.toString();
}

export function buildStaffReplyNotificationEmail(
  input: StaffReplyNotificationInput,
  accessUrl: string,
): PlatformEmail {
  const safeName = escapeHtml(input.participantName);
  const safeProgramName = escapeHtml(input.programName);
  const safeUrl = escapeHtml(accessUrl);
  const text = [
    `Hello ${input.participantName},`,
    "",
    `The program team has replied to your private message in ${input.programName}.`,
    "Sign in to your Program Hub to read the reply.",
    `Open your private conversation: ${accessUrl}`,
  ].join("\n");
  const html = [
    `<p>Hello ${safeName},</p>`,
    `<p>The program team has replied to your private message in ${safeProgramName}.</p>`,
    "<p>Sign in to your Program Hub to read the reply.</p>",
    `<p><a href="${safeUrl}">Open your private conversation</a></p>`,
  ].join("");

  return {
    recipients: [input.participantEmail],
    subject: "A private reply from your program team",
    text,
    html,
    idempotencyKey: `jusoor-private-reply-${input.replyId}`,
  };
}

export async function sendStaffReplyNotification(
  input: StaffReplyNotificationInput,
  appUrl: string | undefined,
  send: (message: PlatformEmail) => Promise<EmailSendResult> = message => gmailEmailTransport.send(message),
): Promise<{ status: ReplyEmailNotificationStatus; failureKind: ReplyEmailFailureKind | null }> {
  const accessUrl = participantAnnouncementConversationUrl(appUrl, input.announcementId, input.applicationId);
  if (!accessUrl) return { status: "failed", failureKind: "transient" };

  try {
    const result = await send(buildStaffReplyNotificationEmail(input, accessUrl));
    if (result.kind === "sent") return { status: "sent", failureKind: null };
    if (result.kind === "ambiguous") return { status: "uncertain", failureKind: "ambiguous" };
    return { status: "failed", failureKind: result.kind };
  } catch {
    return { status: "failed", failureKind: "transient" };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
