import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  mentorFollowUpDigestDeliveriesTable,
  programsTable,
  staffMembersTable,
  staffProgramRolesTable,
} from "@workspace/db";
import { logger } from "./logger";
import { sendPlatformEmail } from "./platform-email";

const programTimeZone = "Asia/Amman";
const deliveryHour = 9;
const workerIntervalMs = 5 * 60 * 1000;
const staleClaimMs = 10 * 60 * 1000;
const baseRetryDelayMs = 15 * 60 * 1000;
const maxRetryDelayMs = 24 * 60 * 60 * 1000;

type OverdueMentor = {
  email: string;
  calendlyFollowUpDate: string | null;
  calendlyBookingUrl: string | null;
  googleCalendarAccountEmail: string | null;
};

let workerTimer: ReturnType<typeof setInterval> | undefined;
let workerRunning = false;
let workerSchemaUnavailable = false;

function isUndefinedRelation(error: unknown): boolean {
  return getDatabaseErrorCode(error) === "42P01";
}

function isMissingSchemaObject(error: unknown): boolean {
  const code = getDatabaseErrorCode(error);
  return code === "42P01" || code === "42703";
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function getProgramCalendarParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: programTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

export function getProgramCalendarDate(date: Date): string {
  const parts = getProgramCalendarParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isMentorFollowUpDigestDue(date: Date): boolean {
  return Number(getProgramCalendarParts(date).hour) >= deliveryHour;
}

export function selectOverdueMentors(
  mentors: OverdueMentor[],
  calendarDate: string,
): { email: string; calendlyFollowUpDate: string }[] {
  return mentors
    .filter(
      (mentor): mentor is OverdueMentor & { calendlyFollowUpDate: string } =>
        !mentor.calendlyBookingUrl &&
        !mentor.googleCalendarAccountEmail &&
        Boolean(mentor.calendlyFollowUpDate) &&
        mentor.calendlyFollowUpDate! < calendarDate,
    )
    .map(({ email, calendlyFollowUpDate }) => ({
      email,
      calendlyFollowUpDate,
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}

async function getOverdueMentors(
  calendarDate: string,
): Promise<{ email: string; calendlyFollowUpDate: string }[]> {
  const primaryMentors = await db
    .select({ staffId: staffMembersTable.id })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.role, "mentor"));

  let programMentors: { staffId: number }[] = [];
  try {
    programMentors = await db
      .select({ staffId: staffProgramRolesTable.staffId })
      .from(staffProgramRolesTable)
      .innerJoin(
        programsTable,
        eq(programsTable.id, staffProgramRolesTable.programId),
      )
      .where(
        and(
          eq(staffProgramRolesTable.role, "mentor"),
          isNull(programsTable.archivedAt),
        ),
      );
  } catch (error) {
    if (!isUndefinedRelation(error)) throw error;
  }

  const mentorIds = [
    ...new Set([
      ...primaryMentors.map(({ staffId }) => staffId),
      ...programMentors.map(({ staffId }) => staffId),
    ]),
  ];
  if (!mentorIds.length) return [];

  const mentors = await db
    .select({
      email: staffMembersTable.email,
      calendlyFollowUpDate: staffMembersTable.calendlyFollowUpDate,
      calendlyBookingUrl: staffMembersTable.calendlyBookingUrl,
      googleCalendarAccountEmail: staffMembersTable.googleCalendarAccountEmail,
    })
    .from(staffMembersTable)
    .where(inArray(staffMembersTable.id, mentorIds));

  return selectOverdueMentors(mentors, calendarDate);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function getOverdueViewUrl(): string {
  const configuredDomain = process.env.REPLIT_DOMAINS
    ?.split(",")
    .map((domain) => domain.trim())
    .find(Boolean);
  if (!configuredDomain) {
    throw new Error("The application domain is not configured for email links.");
  }

  const host = configuredDomain.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
  if (!host || /[\r\n]/.test(host)) {
    throw new Error("The application domain is invalid for email links.");
  }
  return new URL(
    "/mentor-booking?followUp=overdue",
    `https://${host}`,
  ).toString();
}

async function sendDigestEmail(input: {
  coordinatorEmail: string;
  calendarDate: string;
  mentors: { email: string; calendlyFollowUpDate: string }[];
  idempotencyKey: string;
}): Promise<void> {
  const overdueViewUrl = getOverdueViewUrl();
  const rows = input.mentors.map(
    ({ email, calendlyFollowUpDate }) => `- ${email} (due ${calendlyFollowUpDate})`,
  );
  const text = [
    "Overdue mentor follow-ups",
    `Program day: ${input.calendarDate}`,
    "",
    `${input.mentors.length} mentor${input.mentors.length === 1 ? "" : "s"} need follow-up:`,
    ...rows,
    "",
    `Open the overdue view: ${overdueViewUrl}`,
  ].join("\n");
  const htmlRows = input.mentors
    .map(
      ({ email, calendlyFollowUpDate }) =>
        `<li>${escapeHtml(email)} — due ${escapeHtml(calendlyFollowUpDate)}</li>`,
    )
    .join("");
  const html = `<h1>Overdue mentor follow-ups</h1><p>Program day: ${escapeHtml(input.calendarDate)}</p><p>${input.mentors.length} mentor${input.mentors.length === 1 ? "" : "s"} need follow-up:</p><ul>${htmlRows}</ul><p><a href="${escapeHtml(overdueViewUrl)}">Open the overdue view</a></p>`;

  await sendPlatformEmail({
    recipients: [input.coordinatorEmail],
    subject: `Overdue mentor follow-ups (${input.mentors.length})`,
    text,
    html,
    idempotencyKey: input.idempotencyKey,
  });
}

async function deliverCoordinatorDigest(input: {
  coordinatorStaffId: number;
  coordinatorEmail: string;
  calendarDate: string;
  mentors: { email: string; calendlyFollowUpDate: string }[];
  now: Date;
}): Promise<void> {
  const { coordinatorStaffId, coordinatorEmail, calendarDate, mentors, now } =
    input;
  const staleBefore = new Date(now.getTime() - staleClaimMs);
  const [claimed] = await db
    .update(mentorFollowUpDigestDeliveriesTable)
    .set({
      status: "sending",
      attempts: sql`${mentorFollowUpDigestDeliveriesTable.attempts} + 1`,
      lastAttemptAt: now,
      lastError: null,
    })
    .where(
      and(
        eq(
          mentorFollowUpDigestDeliveriesTable.coordinatorStaffId,
          coordinatorStaffId,
        ),
        eq(mentorFollowUpDigestDeliveriesTable.calendarDate, calendarDate),
        or(
          and(
            inArray(mentorFollowUpDigestDeliveriesTable.status, [
              "pending",
              "failed",
            ]),
            lte(mentorFollowUpDigestDeliveriesTable.nextAttemptAt, now),
          ),
          and(
            eq(mentorFollowUpDigestDeliveriesTable.status, "sending"),
            or(
              isNull(mentorFollowUpDigestDeliveriesTable.lastAttemptAt),
              lt(
                mentorFollowUpDigestDeliveriesTable.lastAttemptAt,
                staleBefore,
              ),
            ),
          ),
        ),
      ),
    )
    .returning({ id: mentorFollowUpDigestDeliveriesTable.id });
  if (!claimed) return;

  const idempotencyKey =
    `jusoor-mentor-follow-up-digest-${coordinatorStaffId}-${calendarDate}`;
  try {
    await sendDigestEmail({
      coordinatorEmail,
      calendarDate,
      mentors,
      idempotencyKey,
    });
    await db
      .update(mentorFollowUpDigestDeliveriesTable)
      .set({ status: "sent", sentAt: new Date(), lastError: null })
      .where(eq(mentorFollowUpDigestDeliveriesTable.id, claimed.id));
  } catch (error) {
    const attempt = (await db
      .select({ attempts: mentorFollowUpDigestDeliveriesTable.attempts })
      .from(mentorFollowUpDigestDeliveriesTable)
      .where(eq(mentorFollowUpDigestDeliveriesTable.id, claimed.id))
      .limit(1))[0]?.attempts ?? 1;
    const retryDelayMs = Math.min(
      maxRetryDelayMs,
      baseRetryDelayMs * 2 ** Math.min(attempt - 1, 6),
    );
    const message =
      error instanceof Error ? error.message.slice(0, 400) : "Email delivery failed.";
    await db
      .update(mentorFollowUpDigestDeliveriesTable)
      .set({
        status: "failed",
        nextAttemptAt: new Date(now.getTime() + retryDelayMs),
        lastError: message,
      })
      .where(eq(mentorFollowUpDigestDeliveriesTable.id, claimed.id));
    logger.warn(
      { coordinatorStaffId, calendarDate, attempt },
      "Mentor follow-up digest email failed and will be retried",
    );
  }
}

async function processMentorFollowUpDigests(): Promise<void> {
  if (workerRunning || workerSchemaUnavailable) return;
  workerRunning = true;
  try {
    const now = new Date();
    if (!isMentorFollowUpDigestDue(now)) return;

    const calendarDate = getProgramCalendarDate(now);
    const mentors = await getOverdueMentors(calendarDate);
    if (!mentors.length) return;

    const coordinators = await db
      .select({
        staffId: staffMembersTable.id,
        email: staffMembersTable.email,
      })
      .from(staffMembersTable)
      .where(
        and(
          eq(staffMembersTable.role, "coordinator"),
          eq(staffMembersTable.status, "active"),
        ),
      )
      .orderBy(asc(staffMembersTable.id));
    if (!coordinators.length) return;

    await db
      .insert(mentorFollowUpDigestDeliveriesTable)
      .values(
        coordinators.map(({ staffId }) => ({
          coordinatorStaffId: staffId,
          calendarDate,
        })),
      )
      .onConflictDoNothing();

    const retryableDeliveries = await db
      .select({
        coordinatorStaffId:
          mentorFollowUpDigestDeliveriesTable.coordinatorStaffId,
        coordinatorEmail: staffMembersTable.email,
      })
      .from(mentorFollowUpDigestDeliveriesTable)
      .innerJoin(
        staffMembersTable,
        eq(
          staffMembersTable.id,
          mentorFollowUpDigestDeliveriesTable.coordinatorStaffId,
        ),
      )
      .where(
        and(
          eq(mentorFollowUpDigestDeliveriesTable.calendarDate, calendarDate),
          eq(staffMembersTable.role, "coordinator"),
          eq(staffMembersTable.status, "active"),
          or(
            and(
              inArray(mentorFollowUpDigestDeliveriesTable.status, [
                "pending",
                "failed",
              ]),
              lte(mentorFollowUpDigestDeliveriesTable.nextAttemptAt, now),
            ),
            and(
              eq(mentorFollowUpDigestDeliveriesTable.status, "sending"),
              or(
                isNull(mentorFollowUpDigestDeliveriesTable.lastAttemptAt),
                lt(
                  mentorFollowUpDigestDeliveriesTable.lastAttemptAt,
                  new Date(now.getTime() - staleClaimMs),
                ),
              ),
            ),
          ),
        ),
      )
      .orderBy(asc(mentorFollowUpDigestDeliveriesTable.coordinatorStaffId));

    for (const delivery of retryableDeliveries) {
      await deliverCoordinatorDigest({
        ...delivery,
        calendarDate,
        mentors,
        now,
      });
    }
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      workerSchemaUnavailable = true;
      logger.warn(
        "Mentor follow-up digest worker paused until its database migrations are applied",
      );
    } else {
      logger.error({ err: error }, "Mentor follow-up digest worker failed");
    }
  } finally {
    workerRunning = false;
  }
}

export function startMentorFollowUpDigestWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processMentorFollowUpDigests();
  }, workerIntervalMs);
  workerTimer.unref?.();
  void processMentorFollowUpDigests();
}
