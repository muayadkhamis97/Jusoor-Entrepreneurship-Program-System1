import type { PlatformEmail } from "./platform-email";
import { sendPlatformEmail } from "./platform-email";

export type ParticipantInvitationEmailInput = {
  applicationId: number;
  email: string;
  participantName: string;
  programName: string;
  businessName: string;
  expiresAt: Date;
};

type EmailSender = (message: PlatformEmail) => Promise<void>;

export function buildParticipantInvitationEmail(
  input: ParticipantInvitationEmailInput,
): PlatformEmail {
  const name = escapeHtml(input.participantName);
  const program = escapeHtml(input.programName);
  const business = escapeHtml(input.businessName);
  const expiry = input.expiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const text = [
    `Hello ${input.participantName},`,
    "",
    "You have been invited to join the program platform as a participant.",
    `Program: ${input.programName}.`,
    `Business: ${input.businessName}.`,
    `This invitation is valid until ${expiry}.`,
    "",
    "Create an account or sign in using this same verified email address to access the assigned program and business.",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = [
    `<p>Hello ${name},</p>`,
    "<p>You have been invited to join the program platform as a participant.</p>",
    `<p><strong>Program:</strong> ${program}</p>`,
    `<p><strong>Business:</strong> ${business}</p>`,
    `<p>This invitation is valid until ${escapeHtml(expiry)}.</p>`,
    "<p>Create an account or sign in using this same verified email address to access the assigned program and business.</p>",
    "<p>If you were not expecting this invitation, you can ignore this email.</p>",
  ].join("");

  return {
    recipients: [input.email],
    subject: "Invitation to join a program",
    text,
    html,
    idempotencyKey: `participant-invitation-${input.applicationId}-${input.expiresAt.getTime()}`,
  };
}

export async function sendParticipantInvitationEmail(
  input: ParticipantInvitationEmailInput,
  send: EmailSender = sendPlatformEmail,
): Promise<void> {
  await send(buildParticipantInvitationEmail(input));
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
