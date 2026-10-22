import type { PlatformEmail } from "./platform-email";
import { sendPlatformEmail } from "./platform-email";
import { loadProgramEmailBranding, visibleEmailBrandName } from "./email-branding";

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
  brandName = "Program Hub",
): PlatformEmail {
  const brand = visibleEmailBrandName(brandName).replace(/\s+/g, " ");
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
    `The ${brand} program team has invited you to join its workspace as a participant.`,
    `Program: ${input.programName}.`,
    `Business: ${input.businessName}.`,
    `This invitation is valid until ${expiry}.`,
    "",
    "Create an account or sign in using this same verified email address to access the assigned program and business.",
    "If you have questions about this invitation, reply to this email to contact the program team.",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = [
    `<p>Hello ${name},</p>`,
    `<p>The ${escapeHtml(brand)} program team has invited you to join its workspace as a participant.</p>`,
    `<p><strong>Program:</strong> ${program}</p>`,
    `<p><strong>Business:</strong> ${business}</p>`,
    `<p>This invitation is valid until ${escapeHtml(expiry)}.</p>`,
    "<p>Create an account or sign in using this same verified email address to access the assigned program and business.</p>",
    "<p>If you have questions about this invitation, reply to this email to contact the program team.</p>",
    "<p>If you were not expecting this invitation, you can ignore this email.</p>",
  ].join("");

  return {
    recipients: [input.email],
    subject: `${brand}: Your program invitation`,
    text,
    html,
    idempotencyKey: `participant-invitation-${input.applicationId}-${input.expiresAt.getTime()}`,
  };
}

export async function sendParticipantInvitationEmail(
  input: ParticipantInvitationEmailInput,
  send?: EmailSender,
  loadBranding = loadProgramEmailBranding,
): Promise<void> {
  const branding = await loadBranding();
  const message = buildParticipantInvitationEmail(input, branding.brandName);
  if (send) await send(message);
  else await sendPlatformEmail(message, undefined, async () => branding);
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
