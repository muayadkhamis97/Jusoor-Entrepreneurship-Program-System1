import { sendPlatformEmail } from "./platform-email";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  sessionsTable,
  staffMembersTable,
  zoomRecordingAlertsTable,
} from "@workspace/db";

const STALE_EMAIL_CLAIM_MS = 10 * 60 * 1000;

export type ZoomRecordingReadyEvent = {
  meetingId: string;
  eventKey: string;
};

export type ZoomRecordingAlertEmailStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed";

export function parseZoomRecordingReadyEvent(
  envelope: unknown,
): ZoomRecordingReadyEvent | null {
  if (!isRecord(envelope) || envelope.event !== "recording.completed") {
    return null;
  }
  const payload = isRecord(envelope.payload) ? envelope.payload : null;
  const object = payload && isRecord(payload.object) ? payload.object : null;
  const meetingIdValue = object?.id;
  const meetingUuid = object?.uuid;
  const eventTs = envelope.event_ts;
  const meetingId =
    typeof meetingIdValue === "number" && Number.isSafeInteger(meetingIdValue)
      ? String(meetingIdValue)
      : typeof meetingIdValue === "string"
        ? meetingIdValue.trim()
        : "";
  const eventTimestamp =
    typeof eventTs === "number" && Number.isFinite(eventTs)
      ? String(eventTs)
      : typeof eventTs === "string"
        ? eventTs.trim()
        : "";

  if (
    !meetingId ||
    meetingId.length > 64 ||
    typeof meetingUuid !== "string" ||
    !meetingUuid.trim() ||
    meetingUuid.length > 512 ||
    !eventTimestamp ||
    eventTimestamp.length > 64
  ) {
    return null;
  }

  return {
    meetingId,
    eventKey: `recording.completed:${meetingId}:${meetingUuid}:${eventTimestamp}`,
  };
}

export function isGoogleDriveRecordingUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "drive.google.com" ||
      url.username ||
      url.password
    ) {
      return false;
    }
    return Boolean(
      url.pathname.match(/\/file\/d\/[A-Za-z0-9_-]+/) ||
        /^[A-Za-z0-9_-]+$/.test(url.searchParams.get("id") ?? ""),
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicEmailError(error: unknown): string {
  if (error instanceof RecordingEmailConfigurationError) {
    return error.message;
  }
  return "The email service could not send the alert. Check the sender connection and retry.";
}

class RecordingEmailConfigurationError extends Error {}

function senderAddress(): string | undefined {
  const from = process.env.JUSOOR_EMAIL_FROM?.trim();
  return from && !/[\r\n]/.test(from) && from.includes("@") ? from : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
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

async function sendReadyEmail(input: {
  alertId: number;
  eventKey: string;
  title: string;
  scheduledDate: string;
  recipients: string[];
}): Promise<void> {
  const from = senderAddress();
  if (input.recipients.length === 0) {
    throw new RecordingEmailConfigurationError(
      "No active admin account has an email address to receive alerts.",
    );
  }

  const title = input.title.trim();
  const text = [
    `A Zoom recording is ready to upload to Google Drive.`,
    `Session: ${title}`,
    `Date: ${input.scheduledDate}`,
    "After staff upload the video to Drive, add the share link to the session in the platform.",
  ].join("\n");
  const html = `<p>A Zoom recording is ready to upload to Google Drive.</p><p><strong>Session:</strong> ${escapeHtml(title)}<br><strong>Date:</strong> ${escapeHtml(input.scheduledDate)}</p><p>After staff upload the video to Drive, add the share link to the session in the platform.</p>`;
  await sendPlatformEmail({
    recipients: input.recipients,
    fallbackFrom: from,
    subject: `Zoom recording ready: ${title}`,
    text,
    html,
    idempotencyKey: `jusoor-zoom-recording-${input.alertId}-${input.eventKey}`,
  });
}

function isRetryableStatus(
  status: string,
  lastAttemptAt: Date | null,
  now: Date,
): boolean {
  if (status === "pending" || status === "failed") return true;
  return (
    status === "sending" &&
    (!lastAttemptAt || now.getTime() - lastAttemptAt.getTime() >= STALE_EMAIL_CLAIM_MS)
  );
}

export async function retryZoomRecordingAlertEmail(
  alertId: number,
): Promise<ZoomRecordingAlertEmailStatus | null> {
  const [alert] = await db
    .select({
      id: zoomRecordingAlertsTable.id,
      eventKey: zoomRecordingAlertsTable.eventKey,
      emailStatus: zoomRecordingAlertsTable.emailStatus,
      emailLastAttemptAt: zoomRecordingAlertsTable.emailLastAttemptAt,
      resolvedAt: zoomRecordingAlertsTable.resolvedAt,
      title: sessionsTable.title,
      scheduledDate: sessionsTable.scheduledDate,
    })
    .from(zoomRecordingAlertsTable)
    .innerJoin(
      sessionsTable,
      eq(zoomRecordingAlertsTable.sessionId, sessionsTable.id),
    )
    .where(eq(zoomRecordingAlertsTable.id, alertId))
    .limit(1);

  if (!alert) return null;
  if (alert.resolvedAt) return alert.emailStatus as ZoomRecordingAlertEmailStatus;

  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_EMAIL_CLAIM_MS);
  const claimable = or(
    inArray(zoomRecordingAlertsTable.emailStatus, ["pending", "failed"]),
    and(
      eq(zoomRecordingAlertsTable.emailStatus, "sending"),
      or(
        isNull(zoomRecordingAlertsTable.emailLastAttemptAt),
        lt(zoomRecordingAlertsTable.emailLastAttemptAt, staleBefore),
      ),
    ),
  );
  const [claimed] = await db
    .update(zoomRecordingAlertsTable)
    .set({
      emailStatus: "sending",
      emailAttempts: sql`${zoomRecordingAlertsTable.emailAttempts} + 1`,
      emailLastAttemptAt: now,
      emailError: null,
    })
    .where(
      and(
        eq(zoomRecordingAlertsTable.id, alertId),
        isNull(zoomRecordingAlertsTable.resolvedAt),
        claimable,
      ),
    )
    .returning({ id: zoomRecordingAlertsTable.id });

  if (!claimed) {
    return alert.emailStatus as ZoomRecordingAlertEmailStatus;
  }

  try {
    const coordinators = await db
      .select({ email: staffMembersTable.email })
      .from(staffMembersTable)
      .where(
        and(
          eq(staffMembersTable.role, "coordinator"),
          eq(staffMembersTable.status, "active"),
        ),
      );
    const recipients = [
      ...new Set(
        coordinators
          .map(({ email }) => email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    ];

    await sendReadyEmail({
      alertId,
      eventKey: alert.eventKey,
      title: alert.title,
      scheduledDate: alert.scheduledDate,
      recipients,
    });
    await db
      .update(zoomRecordingAlertsTable)
      .set({
        emailStatus: "sent",
        emailSentAt: new Date(),
        emailError: null,
      })
      .where(eq(zoomRecordingAlertsTable.id, alertId));
    return "sent";
  } catch (error) {
    const message = publicEmailError(error);
    await db
      .update(zoomRecordingAlertsTable)
      .set({ emailStatus: "failed", emailError: message })
      .where(eq(zoomRecordingAlertsTable.id, alertId));
    return "failed";
  }
}

export function canRetryZoomRecordingAlertEmail(
  status: string,
  lastAttemptAt: Date | null,
  now = new Date(),
): boolean {
  return isRetryableStatus(status, lastAttemptAt, now);
}
