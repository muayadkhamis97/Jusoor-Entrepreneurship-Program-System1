import type { PlatformEmail } from "./platform-email";
import { sendPlatformEmail } from "./platform-email";

export type MentorAdditionalSessionDecisionEmailInput = {
  requestId: number;
  recipientEmail: string;
  mentorName: string;
  businessName: string;
  programName: string;
  decision: "approved" | "declined";
  approvedAdditionalSessions: number | null;
};

export type MentorAdditionalSessionWithdrawalEmailInput = {
  requestId: number;
  recipients: string[];
  mentorName: string;
  mentorEmail: string;
  businessName: string;
  programName: string;
};

type EmailSender = (message: PlatformEmail) => Promise<void>;

export function buildMentorAdditionalSessionDecisionEmail(
  input: MentorAdditionalSessionDecisionEmailInput,
): PlatformEmail {
  const decisionText = input.decision === "approved"
    ? `Your request for additional one-to-one sessions was approved. ${input.approvedAdditionalSessions ?? 0} additional ${input.approvedAdditionalSessions === 1 ? "session was" : "sessions were"} approved.`
    : "Your request for additional one-to-one sessions was declined.";
  const text = [
    `Hello ${input.mentorName},`,
    "",
    decisionText,
    `Business: ${input.businessName}`,
    `Program: ${input.programName}`,
  ].join("\n");
  const html = [
    `<p>Hello ${escapeHtml(input.mentorName)},</p>`,
    `<p>${escapeHtml(decisionText)}</p>`,
    `<p><strong>Business:</strong> ${escapeHtml(input.businessName)}<br><strong>Program:</strong> ${escapeHtml(input.programName)}</p>`,
  ].join("");

  return {
    recipients: [input.recipientEmail],
    subject: input.decision === "approved"
      ? `Additional sessions approved: ${input.businessName}`
      : `Additional sessions declined: ${input.businessName}`,
    text,
    html,
    idempotencyKey: `mentor-additional-session-decision-${input.requestId}`,
  };
}

export async function sendMentorAdditionalSessionDecisionEmail(
  input: MentorAdditionalSessionDecisionEmailInput,
  send: EmailSender = sendPlatformEmail,
): Promise<void> {
  await send(buildMentorAdditionalSessionDecisionEmail(input));
}

export function buildMentorAdditionalSessionWithdrawalEmail(
  input: MentorAdditionalSessionWithdrawalEmailInput,
): PlatformEmail {
  const summary = `${input.mentorName} withdrew the request for additional one-to-one sessions for ${input.businessName}.`;
  const details = `Program: ${input.programName}\nMentor: ${input.mentorName} (${input.mentorEmail})`;
  return {
    recipients: input.recipients,
    subject: `Mentor withdrew additional sessions request: ${input.businessName}`,
    text: `${summary}\n${details}`,
    html: `<p>${escapeHtml(summary)}</p><p><strong>Program:</strong> ${escapeHtml(input.programName)}<br><strong>Mentor:</strong> ${escapeHtml(input.mentorName)} (${escapeHtml(input.mentorEmail)})</p>`,
    idempotencyKey: `mentor-additional-session-withdrawal-${input.requestId}`,
  };
}

export async function sendMentorAdditionalSessionWithdrawalEmail(
  input: MentorAdditionalSessionWithdrawalEmailInput,
  send: EmailSender = sendPlatformEmail,
): Promise<void> {
  await send(buildMentorAdditionalSessionWithdrawalEmail(input));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
