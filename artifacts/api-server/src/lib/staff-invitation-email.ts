import type { PlatformEmail } from "./platform-email";
import { sendPlatformEmail } from "./platform-email";
import { loadProgramEmailBranding, visibleEmailBrandName } from "./email-branding";

export type StaffInvitationRole = "coordinator" | "staff" | "trainer" | "mentor" | "judge";

export type StaffInvitationEmailInput = {
  staffId: number;
  email: string;
  role: StaffInvitationRole;
  programNames: string[];
};

type EmailSender = (message: PlatformEmail) => Promise<void>;

// Use the published system URL, not a workspace preview or development domain.
const SYSTEM_SIGN_IN_URL = "https://entrep-system.replit.app/sign-in";

const roleLabels: Record<StaffInvitationRole, string> = {
  coordinator: "Admin",
  staff: "Program staff",
  trainer: "Trainer",
  mentor: "Mentor",
  judge: "Judge",
};

export function buildStaffInvitationEmail(input: StaffInvitationEmailInput, brandName = "Program Hub"): PlatformEmail {
  const brand = visibleEmailBrandName(brandName).replace(/\s+/g, " ");
  const roleLabel = roleLabels[input.role];
  const programNames = input.role === "coordinator" ? [] : input.programNames;
  const assignment = programNames.length
    ? `Assigned program${programNames.length === 1 ? "" : "s"}: ${programNames.join(", ")}.`
    : input.role === "coordinator" ? "Access: all programs." : "No program has been assigned yet.";
  const safeRole = escapeHtml(roleLabel);
  const safePrograms = programNames.map(escapeHtml);
  const assignmentHtml = safePrograms.length
    ? `<p><strong>Assigned program${safePrograms.length === 1 ? "" : "s"}:</strong> ${safePrograms.join(", ")}</p>`
    : `<p>${escapeHtml(assignment)}</p>`;

  const text = [
    "Hello,",
    "",
    `The ${brand} program team has invited you to join its workspace.`,
    `Role: ${roleLabel}.`,
    assignment,
    "",
    "Create an account or sign in using this same verified email address to access the platform.",
    `Open the program system: ${SYSTEM_SIGN_IN_URL}`,
    "If you have questions about your role or program access, reply to this email to contact the program team.",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = [
    "<p>Hello,</p>",
    `<p>The ${escapeHtml(brand)} program team has invited you to join its workspace.</p>`,
    `<p><strong>Role:</strong> ${safeRole}</p>`,
    assignmentHtml,
    "<p>Create an account or sign in using this same verified email address to access the platform.</p>",
    `<p><a href="${escapeHtml(SYSTEM_SIGN_IN_URL)}">Open the program system</a></p>`,
    "<p>If you have questions about your role or program access, reply to this email to contact the program team.</p>",
    "<p>If you were not expecting this invitation, you can ignore this email.</p>",
  ].join("");

  return {
    recipients: [input.email],
    subject: `${brand}: Your invitation to join the program team`,
    text,
    html,
    idempotencyKey: `staff-invitation-${input.staffId}`,
  };
}

export async function sendStaffInvitationEmail(
  input: StaffInvitationEmailInput,
  send?: EmailSender,
  loadBranding = loadProgramEmailBranding,
): Promise<void> {
  const branding = await loadBranding();
  const message = buildStaffInvitationEmail(input, branding.brandName);
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
