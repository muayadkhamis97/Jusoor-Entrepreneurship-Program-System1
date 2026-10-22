import { and, asc, eq, exists, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db, announcementEmailRequestsTable as requests, announcementEmailDeliveriesTable as deliveries,
  programAnnouncementsTable as announcements, applicationsTable, programsTable,
  staffMembersTable, staffProgramAssignmentsTable,
  businessesTable, participantBusinessMembershipsTable,
} from "@workspace/db";
import { PlatformEmailSendUncertainError, sendPlatformEmail } from "./platform-email";
import { logger } from "./logger";

type DeliveryCounts = {
  state: "not_requested" | "queued" | "processing" | "complete" | "needs_attention" | "paused" | "unavailable";
  sent: number; pending: number; failed: number; uncertain: number; skipped: number; canRetry: boolean;
};
export const emptyEmailStatus = (state: DeliveryCounts["state"] = "not_requested"): DeliveryCounts => ({
  state, sent: 0, pending: 0, failed: 0, uncertain: 0, skipped: 0, canRetry: false,
});

export function summarizeAnnouncementEmail(
  prepared: boolean,
  rows: { status: string; attemptedAt: Date | null }[],
  now = Date.now(),
): DeliveryCounts {
  const result = emptyEmailStatus(prepared ? "complete" : "queued");
  for (const row of rows) {
    if (row.status === "sent") result.sent++;
    else if (row.status === "failed") result.failed++;
    else if (row.status === "skipped") result.skipped++;
    else if (row.status === "uncertain" || (row.status === "sending" &&
      row.attemptedAt && now - row.attemptedAt.getTime() > 10 * 60_000)) result.uncertain++;
    else result.pending++;
  }
  if (result.pending) result.state = "processing";
  else if (result.failed || result.uncertain) result.state = "needs_attention";
  result.canRetry = result.failed > 0;
  return result;
}

export async function announcementEmailStatuses(ids: number[]): Promise<Map<number, DeliveryCounts>> {
  const result = new Map<number, DeliveryCounts>();
  if (!ids.length) return result;
  const batches = await db.select().from(requests).where(inArray(requests.announcementId, ids));
  const rows = await db.select().from(deliveries).where(inArray(deliveries.announcementId, ids));
  for (const batch of batches) {
    const status = summarizeAnnouncementEmail(
      batch.preparedAt !== null, rows.filter(row => row.announcementId === batch.announcementId),
    );
    if (batch.paused) { status.state = "paused"; status.canRetry = false; }
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

export async function processAnnouncementEmails(send = sendPlatformEmail): Promise<void> {
  const due = await db.select({ announcement: announcements }).from(requests)
    .innerJoin(announcements, eq(requests.announcementId, announcements.id))
    .where(and(isNull(requests.preparedAt), lte(announcements.scheduledFor, new Date())))
    .orderBy(asc(requests.checkedAt)).limit(20);
  for (const { announcement } of due) {
    // Transactional snapshot: zero recipients is also a completed snapshot, not an invitation
    // to mail participants who enroll later. The row lock serializes competing workers.
    await db.transaction(async tx => {
      const [request] = await tx.select().from(requests)
        .where(eq(requests.announcementId, announcement.id)).for("update");
      if (!request || request.preparedAt) return;
      if (!await authorMaySend(announcement)) {
        await tx.update(requests).set({ paused: true, checkedAt: new Date() }).where(eq(requests.announcementId, announcement.id));
        return;
      }
      const recipients = normalizedAnnouncementRecipients(await tx.select({ email: applicationsTable.email })
        .from(applicationsTable).where(recipientScope(announcement)));
      if (recipients.length) await tx.insert(deliveries).values(recipients.map(email => ({
        announcementId: announcement.id, email,
      }))).onConflictDoNothing();
      await tx.update(requests).set({ preparedAt: new Date(), paused: false, checkedAt: new Date() }).where(eq(requests.announcementId, announcement.id));
    });
  }
  const pending = await db.select({ delivery: deliveries, announcement: announcements }).from(deliveries)
    .innerJoin(announcements, eq(deliveries.announcementId, announcements.id))
    .where(and(eq(deliveries.status, "pending"), lte(announcements.scheduledFor, new Date())))
    .orderBy(sql`${deliveries.attemptedAt} asc nulls first`).limit(50);
  for (const { delivery, announcement } of pending) {
    if (!await authorMaySend(announcement)) {
      await db.update(requests).set({ paused: true }).where(eq(requests.announcementId, announcement.id));
      await db.update(deliveries).set({ attemptedAt: new Date() })
        .where(and(eq(deliveries.id, delivery.id), eq(deliveries.status, "pending")));
      continue;
    }
    await db.update(requests).set({ paused: false }).where(eq(requests.announcementId, announcement.id));
    // Persist a claim BEFORE contacting Gmail. Never reclaim an ambiguous/stale send.
    const [claimed] = await db.update(deliveries).set({ status: "sending", attemptedAt: new Date() })
      .where(and(eq(deliveries.id, delivery.id), eq(deliveries.status, "pending"))).returning({ id: deliveries.id });
    if (!claimed) continue;
    try {
      const [recipient] = await db.select({ id: applicationsTable.id }).from(applicationsTable)
        .where(recipientScope(announcement, delivery.email)).limit(1);
      if (!recipient) {
        await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, delivery.id));
        continue;
      }
      await send(announcementEmailContent(announcement, delivery.email));
    } catch (error) {
      await db.update(deliveries).set({
        status: error instanceof PlatformEmailSendUncertainError ? "uncertain" : "failed",
      }).where(eq(deliveries.id, delivery.id));
      logger.warn({ announcementId: announcement.id, deliveryId: delivery.id }, "Announcement email requires attention");
      continue;
    }
    // If this write fails, leave the committed claim in sending (never a retryable failure).
    await db.update(deliveries).set({ status: "sent", sentAt: new Date() }).where(eq(deliveries.id, delivery.id));
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
