import type { PlatformEmail } from "./platform-email";
import { sendPlatformEmail } from "./platform-email";
import { contrastColor, loadProgramEmailBranding, visibleEmailBrandName } from "./email-branding";

export type ParticipantInvitationEmailInput = {
  applicationId: number;
  email: string;
  participantName: string;
  programName: string;
  businessName: string;
  expiresAt: Date;
  accessUrl: string;
  resendRequestId?: string;
};

type EmailSender = (message: PlatformEmail) => Promise<void>;

export function participantAccessUrl(appUrl: string | undefined): string | null {
  if (!appUrl?.trim()) return null;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return new URL("/participant", url.origin).toString();
  } catch {
    return null;
  }
}

export function buildParticipantInvitationEmail(
  input: ParticipantInvitationEmailInput,
  brandName = "Program Hub",
  primaryColor = "#28665a",
): PlatformEmail {
  const brand = visibleEmailBrandName(brandName).replace(/\s+/g, " ");
  const name = escapeHtml(input.participantName);
  const program = escapeHtml(input.programName);
  const business = escapeHtml(input.businessName);
  const accessUrl = escapeHtml(input.accessUrl);
  const buttonColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor.toLowerCase() : "#28665a";
  const buttonTextColor = contrastColor(buttonColor);
  const expiry = `${input.expiresAt.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  })} (GMT)`;
  const text = [
    `Hello ${input.participantName},`,
    "",
    `The ${brand} program team has invited you to join its workspace as a participant.`,
    `Program: ${input.programName}.`,
    `Business: ${input.businessName}.`,
    `This invitation is valid until ${expiry}.`,
    "",
    "Create an account or sign in using this same verified email address to access the assigned program and business.",
    `Access your program: ${input.accessUrl}`,
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
    `<p style="margin:24px 0"><a href="${accessUrl}" style="display:inline-block;padding:12px 20px;border-radius:6px;background-color:${buttonColor};color:${buttonTextColor};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.4;text-align:center;text-decoration:none">Access your program</a></p>`,
    "<p>If you have questions about this invitation, reply to this email to contact the program team.</p>",
    "<p>If you were not expecting this invitation, you can ignore this email.</p>",
  ].join("");

  return {
    recipients: [input.email],
    subject: `${brand}: Your program invitation`,
    text,
    html,
    idempotencyKey: input.resendRequestId
      ? `participant-invitation-${input.applicationId}-resend-${input.resendRequestId}`
      : `participant-invitation-${input.applicationId}-${input.expiresAt.getTime()}`,
  };
}

export async function sendParticipantInvitationEmail(
  input: ParticipantInvitationEmailInput,
  send?: EmailSender,
  loadBranding = loadProgramEmailBranding,
): Promise<void> {
  const branding = await loadBranding();
  const message = buildParticipantInvitationEmail(input, branding.brandName, branding.primaryColor);
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
