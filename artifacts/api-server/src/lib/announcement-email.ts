import { and, asc, eq, exists, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db, announcementEmailRequestsTable as requests, announcementEmailDeliveriesTable as deliveries,
  programAnnouncementsTable as announcements, applicationsTable, programsTable,
  staffMembersTable, staffProgramAssignmentsTable,
  businessesTable, participantBusinessMembershipsTable,
} from "@workspace/db";
import {
  gmailEmailTransport,
  PlatformEmailSendUncertainError,
  type EmailConnectionResult,
  type EmailSendResult,
  type EmailTransport,
  type PlatformEmail,
} from "./platform-email";
import { logger } from "./logger";
import { platformEmailFailureDiagnostics } from "./platform-email";
import type { EmailDeliveryFailure } from "@workspace/api-zod";

type DeliveryCounts = {
  state: "not_requested" | "queued" | "processing" | "complete" | "needs_attention" | "paused" | "quota_paused" | "needs_reconnect" | "unavailable";
  sent: number; pending: number; failed: number; invalidRecipients: number; uncertain: number; skipped: number; canRetry: boolean;
  nextRetryAt?: string | null;
  failures?: EmailDeliveryFailure[];
};
export const emptyEmailStatus = (state: DeliveryCounts["state"] = "not_requested"): DeliveryCounts => ({
  state, sent: 0, pending: 0, failed: 0, invalidRecipients: 0, uncertain: 0, skipped: 0, canRetry: false,
});

export type AnnouncementEmailPauseAlert = {
  quotaPaused: boolean;
  reconnectPaused: boolean;
  nextRetryAt: string | null;
};

export function summarizeAnnouncementEmailPauseAlert(
  rows: { pauseReason: string | null; resumeAt: Date | null }[],
): AnnouncementEmailPauseAlert {
  const paused = rows.filter(row => row.pauseReason === "quota" || row.pauseReason === "needs_reconnect");
  const retryTimes = paused.flatMap(row => row.resumeAt ? [row.resumeAt] : []);
  return {
    quotaPaused: paused.some(row => row.pauseReason === "quota"),
    reconnectPaused: paused.some(row => row.pauseReason === "needs_reconnect"),
    nextRetryAt: retryTimes.length
      ? new Date(Math.min(...retryTimes.map(time => time.getTime()))).toISOString()
      : null,
  };
}

export function summarizeAnnouncementEmail(
  prepared: boolean,
  rows: { status: string; failureKind?: string | null; attemptedAt: Date | null }[],
  now = Date.now(),
  pauseReason?: string | null,
): DeliveryCounts {
  const result = emptyEmailStatus(prepared ? "complete" : "queued");
  for (const row of rows) {
    if (row.status === "sent") result.sent++;
    else if (row.status === "failed") {
      result.failed++;
      if (row.failureKind === "invalid_recipient") result.invalidRecipients++;
    }
    else if (row.status === "skipped") result.skipped++;
    else if (row.status === "uncertain" || (row.status === "sending" &&
      row.attemptedAt && now - row.attemptedAt.getTime() > 10 * 60_000)) result.uncertain++;
    else result.pending++;
  }
  if (pauseReason === "quota") result.state = "quota_paused";
  else if (pauseReason === "needs_reconnect") result.state = "needs_reconnect";
  else if (pauseReason === "author_access") result.state = "paused";
  else if (result.pending) result.state = "processing";
  else if (result.failed || result.uncertain) result.state = "needs_attention";
  result.canRetry = !pauseReason && rows.some(row =>
    row.status === "failed" && row.failureKind !== "invalid_recipient",
  );
  return result;
}

export async function announcementEmailStatuses(ids: number[]): Promise<Map<number, DeliveryCounts>> {
  const result = new Map<number, DeliveryCounts>();
  if (!ids.length) return result;
  const batches = await db.select().from(requests).where(inArray(requests.announcementId, ids));
  const rows = await db.select().from(deliveries).where(inArray(deliveries.announcementId, ids));
  for (const batch of batches) {
    const status = summarizeAnnouncementEmail(
      batch.preparedAt !== null,
      rows.filter(row => row.announcementId === batch.announcementId),
      Date.now(),
      batch.paused ? batch.pauseReason ?? "author_access" : null,
    );
    status.nextRetryAt = batch.resumeAt?.toISOString() ?? null;
    status.failures = rows.filter(row => row.announcementId === batch.announcementId && row.failureKind)
      .map(row => ({
        deliveryId: row.id, failureKind: row.failureKind!,
        operation: row.failureOperation, providerStatus: row.providerStatus, reason: row.providerReason,
      }));
    result.set(batch.announcementId, status);
  }
  return result;
}

export function normalizedAnnouncementRecipients(rows: { email: string }[]): string[] {
  return [...new Set(rows.map(row => row.email.trim().toLowerCase()))];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function announcementEmailContent(announcement: { id: number; title: string; body: string }, email: string) {
  return {
    recipients: [email],
    subject: announcement.title.replace(/[\r\n]+/g, " "),
    text: `${announcement.title}\n\n${announcement.body}\n\nSign in to the program platform to view this announcement.`,
    html: `<h2>${escapeHtml(announcement.title)}</h2><p>${escapeHtml(announcement.body).replace(/\r?\n/g, "<br>")}</p><p>Sign in to the program platform to view this announcement.</p>`,
    idempotencyKey: `jusoor-announcement-${announcement.id}`,
  };
}

// Recheck the author's current authority at scheduled release and before each send.
async function authorMaySend(announcement: typeof announcements.$inferSelect): Promise<boolean> {
  if (announcement.createdByStaffId === null) return false;
  const [staff] = await db.select().from(staffMembersTable)
    .where(eq(staffMembersTable.id, announcement.createdByStaffId)).limit(1);
  if (!staff || staff.status !== "active") return false;
  if (staff.role === "coordinator") return true;
  if (staff.role !== "staff" || announcement.programId === null) return false;
  const [assignment] = await db.select({ id: staffProgramAssignmentsTable.id })
    .from(staffProgramAssignmentsTable).innerJoin(programsTable,
      eq(staffProgramAssignmentsTable.programId, programsTable.id))
    .where(and(eq(staffProgramAssignmentsTable.staffId, staff.id),
      eq(programsTable.id, announcement.programId), isNull(programsTable.archivedAt))).limit(1);
  return Boolean(assignment);
}

function recipientScope(announcement: typeof announcements.$inferSelect, email?: string) {
  // Match portal access: an application's direct business takes precedence.
  // Staff-managed membership is effective only when its businessId is null.
  // Explicit outer qualifiers prevent correlated columns being rebound by Drizzle.
  const businessScope = announcement.businessId === null ? undefined : exists(
    db.select({ id: businessesTable.id }).from(businessesTable).where(and(
      eq(businessesTable.id, announcement.businessId),
      eq(businessesTable.programId, sql`"jusoor_applications"."program_id"`),
      or(
        eq(businessesTable.id, sql`"jusoor_applications"."business_id"`),
        and(
          isNull(sql`"jusoor_applications"."business_id"`),
          exists(db.select({ id: participantBusinessMembershipsTable.id }).from(participantBusinessMembershipsTable)
            .where(and(
              eq(participantBusinessMembershipsTable.applicationId, sql`"jusoor_applications"."id"`),
              eq(participantBusinessMembershipsTable.businessId, announcement.businessId),
            ))),
        ),
      ),
    )),
  );
  return and(
    eq(applicationsTable.status, "accepted"),
    announcement.programId === null ? undefined : eq(applicationsTable.programId, announcement.programId),
    businessScope,
    email === undefined ? undefined : sql`lower(trim(${applicationsTable.email})) = ${email}`,
  );
}

type LegacyEmailSender = (message: PlatformEmail) => Promise<void>;

function asEmailTransport(transportOrSend: EmailTransport | LegacyEmailSender): EmailTransport {
  if (typeof transportOrSend !== "function") return transportOrSend;
  return {
    checkConnection: async () => ({ kind: "ready" }),
    async send(message): Promise<EmailSendResult> {
      try {
        await transportOrSend(message);
        return { kind: "sent" };
      } catch (error) {
        return {
          kind: error instanceof PlatformEmailSendUncertainError ? "ambiguous" : "transient",
          diagnostics: platformEmailFailureDiagnostics(error),
        };
      }
    },
  };
}

async function pausePendingRequests(
  reason: "quota" | "needs_reconnect",
  resumeAt: Date | null,
  recordAttempt = false,
): Promise<void> {
  const now = new Date();
  const pendingIds = await db.select({ announcementId: deliveries.announcementId })
    .from(deliveries)
    .innerJoin(announcements, eq(deliveries.announcementId, announcements.id))
    .where(and(
      eq(deliveries.status, "pending"),
      lte(announcements.scheduledFor, sql`CURRENT_TIMESTAMP`),
    ));
  const unpreparedIds = await db.select({ announcementId: requests.announcementId })
    .from(requests)
    .innerJoin(announcements, eq(requests.announcementId, announcements.id))
    .where(and(isNull(requests.preparedAt), lte(announcements.scheduledFor, sql`CURRENT_TIMESTAMP`)));
  const ids = [...new Set([
    ...pendingIds.map(row => row.announcementId),
    ...unpreparedIds.map(row => row.announcementId),
  ])];
  if (!ids.length) return;
  await db.update(requests).set({
    paused: true,
    pauseReason: reason,
    resumeAt,
    checkedAt: now,
    ...(recordAttempt ? { pauseAttempts: sql`${requests.pauseAttempts} + 1` } : {}),
  }).where(inArray(requests.announcementId, ids));
}

export function announcementEmailBackoffMs(previousAttempts: number): number {
  return [5 * 60_000, 15 * 60_000, 60 * 60_000][Math.min(Math.max(previousAttempts, 0), 2)]!;
}

async function resumePausedRequests(transport: EmailTransport): Promise<void> {
  const pausedRequests = await db.select({
    request: requests,
    announcement: announcements,
  }).from(requests)
    .innerJoin(announcements, eq(requests.announcementId, announcements.id))
    .where(eq(requests.paused, true));
  let reconnectCheck: EmailConnectionResult | undefined;
  for (const { request, announcement } of pausedRequests) {
    if (request.pauseReason === "quota") {
      if (request.resumeAt && request.resumeAt.getTime() > Date.now()) {
        await pausePendingRequests("quota", request.resumeAt);
        return;
      }
      await db.update(requests).set({
        paused: false,
        pauseReason: null,
        resumeAt: null,
        checkedAt: new Date(),
      }).where(and(eq(requests.announcementId, request.announcementId), eq(requests.paused, true)));
      continue;
    }
    if (request.pauseReason === "needs_reconnect") {
      if (request.resumeAt && request.resumeAt.getTime() > Date.now()) {
        await pausePendingRequests("needs_reconnect", request.resumeAt);
        return;
      }
      if (!reconnectCheck) {
        try {
          reconnectCheck = await transport.checkConnection();
        } catch (error) {
          reconnectCheck = { kind: "transient", diagnostics: platformEmailFailureDiagnostics(error) };
        }
        if (reconnectCheck.kind !== "ready") logger.warn({
          emailFailure: reconnectCheck.diagnostics ?? { failureKind: reconnectCheck.kind },
        }, "Announcement Gmail connection check failed");
      }
      if (reconnectCheck.kind === "ready") {
        await db.update(requests).set({
          paused: false,
          pauseReason: null,
          resumeAt: null,
          checkedAt: new Date(),
        }).where(and(
          eq(requests.announcementId, request.announcementId),
          eq(requests.paused, true),
          eq(requests.pauseReason, "needs_reconnect"),
        ));
      } else if (reconnectCheck.kind === "quota") {
        const resumeAt = new Date(Date.now() + Math.max(
          reconnectCheck.retryAfterMs ?? 0, announcementEmailBackoffMs(request.pauseAttempts),
        ));
        await pausePendingRequests("quota", resumeAt, true);
        return;
      } else {
        const resumeAt = new Date(Date.now() + announcementEmailBackoffMs(request.pauseAttempts));
        await pausePendingRequests("needs_reconnect", resumeAt, true);
        return;
      }
      continue;
    }
    if (await authorMaySend(announcement)) {
      await db.update(requests).set({
        paused: false,
        pauseReason: null,
        resumeAt: null,
        checkedAt: new Date(),
      }).where(and(eq(requests.announcementId, request.announcementId), eq(requests.paused, true)));
    }
  }
}

export async function processAnnouncementEmails(
  transportOrSend: EmailTransport | LegacyEmailSender = gmailEmailTransport,
): Promise<void> {
  const transport = asEmailTransport(transportOrSend);
  const due = await db.select({ announcement: announcements }).from(requests)
    .innerJoin(announcements, eq(requests.announcementId, announcements.id))
    .where(and(isNull(requests.preparedAt), lte(announcements.scheduledFor, sql`CURRENT_TIMESTAMP`)))
    .orderBy(asc(requests.checkedAt)).limit(20);
  for (const { announcement } of due) {
    // Transactional snapshot: zero recipients is also a completed snapshot, not an invitation
    // to mail participants who enroll later. The row lock serializes competing workers.
    await db.transaction(async tx => {
      const [request] = await tx.select().from(requests)
        .where(eq(requests.announcementId, announcement.id)).for("update");
      if (!request || request.preparedAt) return;
      if (!await authorMaySend(announcement)) {
        await tx.update(requests).set({
          paused: true,
          pauseReason: "author_access",
          resumeAt: null,
          checkedAt: new Date(),
        }).where(eq(requests.announcementId, announcement.id));
        return;
      }
      const recipients = normalizedAnnouncementRecipients(await tx.select({ email: applicationsTable.email })
        .from(applicationsTable).where(recipientScope(announcement)));
      if (recipients.length) await tx.insert(deliveries).values(recipients.map(email => ({
        announcementId: announcement.id, email,
      }))).onConflictDoNothing();
      await tx.update(requests).set({
        preparedAt: new Date(),
        ...(request.paused && (request.pauseReason === "quota" || request.pauseReason === "needs_reconnect")
          ? {}
          : { paused: false, pauseReason: null, resumeAt: null }),
        checkedAt: new Date(),
      }).where(eq(requests.announcementId, announcement.id));
    });
  }
  await resumePausedRequests(transport);
  const pending = await db.select({ delivery: deliveries, announcement: announcements }).from(deliveries)
    .innerJoin(announcements, eq(deliveries.announcementId, announcements.id))
    .innerJoin(requests, eq(deliveries.announcementId, requests.announcementId))
    .where(and(
      eq(deliveries.status, "pending"),
      eq(requests.paused, false),
      lte(announcements.scheduledFor, sql`CURRENT_TIMESTAMP`),
    ))
    .orderBy(sql`${deliveries.attemptedAt} asc nulls first`).limit(50);
  for (const { delivery, announcement } of pending) {
    if (!await authorMaySend(announcement)) {
      await db.update(requests).set({
        paused: true,
        pauseReason: "author_access",
        resumeAt: null,
        checkedAt: new Date(),
      }).where(eq(requests.announcementId, announcement.id));
      continue;
    }
    // Persist a claim BEFORE contacting Gmail. Never reclaim an ambiguous/stale send.
    const claimed = await db.transaction(async tx => {
      const [request] = await tx.select({ paused: requests.paused }).from(requests)
        .where(eq(requests.announcementId, announcement.id)).for("update");
      if (!request || request.paused) return false;
      const [row] = await tx.update(deliveries).set({
        status: "sending",
        failureKind: null,
        attemptedAt: new Date(),
      }).where(and(eq(deliveries.id, delivery.id), eq(deliveries.status, "pending")))
        .returning({ id: deliveries.id });
      return Boolean(row);
    });
    if (!claimed) continue;
    if (delivery.gmailMessageId) {
      // A persisted Gmail receipt proves acceptance even if the local status was interrupted.
      await db.update(deliveries).set({ status: "sent", failureKind: null })
        .where(eq(deliveries.id, delivery.id));
      continue;
    }
    const [recipient] = await db.select({ id: applicationsTable.id }).from(applicationsTable)
      .where(recipientScope(announcement, delivery.email)).limit(1);
    if (!recipient) {
      await db.update(deliveries).set({ status: "skipped", failureKind: null })
        .where(eq(deliveries.id, delivery.id));
      continue;
    }
    let result: EmailSendResult;
    try {
      result = await transport.send(announcementEmailContent(announcement, delivery.email));
    } catch (error) {
      // A transport that rejects unexpectedly may have already sent the message.
      result = { kind: "ambiguous", diagnostics: platformEmailFailureDiagnostics(error) };
    }
    if (result.kind === "sent") {
      // If this write fails, leave the committed claim in sending (never a retryable failure).
      await db.update(deliveries).set({
        status: "sent",
        failureKind: null,
        sentAt: new Date(),
        failureOperation: null, providerStatus: null, providerReason: null,
        gmailMessageId: result.gmailMessageId ?? null,
      }).where(eq(deliveries.id, delivery.id));
      continue;
    }
    const emailFailure = result.diagnostics ?? { failureKind: result.kind };
    const failureDetails = {
      failureKind: result.kind,
      failureOperation: emailFailure.operation ?? null,
      providerStatus: emailFailure.providerStatus ?? null,
      providerReason: emailFailure.errorCode ?? null,
    };
    if (result.kind === "quota" || result.kind === "needs_reconnect") {
      await db.update(deliveries).set({
        status: "pending",
        ...failureDetails,
        attemptedAt: new Date(),
      }).where(eq(deliveries.id, delivery.id));
      const [request] = await db.select({ attempts: requests.pauseAttempts }).from(requests)
        .where(eq(requests.announcementId, announcement.id));
      const resumeAt = new Date(Date.now() + Math.max(
        announcementEmailBackoffMs(request?.attempts ?? 0), result.retryAfterMs ?? 0,
      ));
      if (result.kind === "quota") {
        await pausePendingRequests("quota", resumeAt, true);
      } else {
        await pausePendingRequests("needs_reconnect", resumeAt, true);
      }
      logger.warn({ announcementId: announcement.id, emailFailure, resumeAt }, "Announcement email delivery paused");
      break;
    }
    await db.update(deliveries).set({
      status: result.kind === "ambiguous" ? "uncertain" : "failed",
      ...failureDetails,
    }).where(eq(deliveries.id, delivery.id));
    logger.warn({
      announcementId: announcement.id,
      deliveryId: delivery.id,
      emailFailure,
    }, "Announcement email requires attention");
  }
}

let running = false;
export function startAnnouncementEmailWorker(): void {
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processAnnouncementEmails(); }
    catch { logger.warn("Announcement email worker unavailable; portal publishing is unaffected"); }
    finally { running = false; }
  };
  void tick();
  setInterval(() => void tick(), 60_000).unref();
}
