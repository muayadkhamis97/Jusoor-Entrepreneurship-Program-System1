import type { PlatformEmail } from "./platform-email";
import { sendPlatformEmail } from "./platform-email";

export type StaffInvitationRole = "coordinator" | "staff" | "trainer" | "mentor" | "judge";

export type StaffInvitationEmailInput = {
  staffId: number;
  email: string;
  role: StaffInvitationRole;
  programNames: string[];
};

type EmailSender = (message: PlatformEmail) => Promise<void>;

const roleLabels: Record<StaffInvitationRole, string> = {
  coordinator: "Admin",
  staff: "Program staff",
  trainer: "Trainer",
  mentor: "Mentor",
  judge: "Judge",
};

export function buildStaffInvitationEmail(input: StaffInvitationEmailInput): PlatformEmail {
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
    "You have been invited to join the program platform.",
    `Role: ${roleLabel}.`,
    assignment,
    "",
    "Create an account or sign in using this same verified email address to access the platform.",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = [
    "<p>Hello,</p>",
    "<p>You have been invited to join the program platform.</p>",
    `<p><strong>Role:</strong> ${safeRole}</p>`,
    assignmentHtml,
    "<p>Create an account or sign in using this same verified email address to access the platform.</p>",
    "<p>If you were not expecting this invitation, you can ignore this email.</p>",
  ].join("");

  return {
    recipients: [input.email],
    subject: "Invitation to join the program team",
    text,
    html,
    idempotencyKey: `staff-invitation-${input.staffId}`,
  };
}

export async function sendStaffInvitationEmail(
  input: StaffInvitationEmailInput,
  send: EmailSender = sendPlatformEmail,
): Promise<void> {
  await send(buildStaffInvitationEmail(input));
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
