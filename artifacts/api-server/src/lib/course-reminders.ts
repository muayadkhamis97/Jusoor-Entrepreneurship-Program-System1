import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, asc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  applicationsTable,
  courseModuleProgressTable,
  courseModulesTable,
  courseProgramActivityTable,
  courseReminderDeliveriesTable,
  db,
  programsTable,
} from "@workspace/db";
import { logger } from "./logger";

const workerIntervalMs = 5 * 60 * 1000;
const reminderWindows = [
  { kind: "three_days_before", fromHours: 48, toHours: 72, subject: "Course deadline in 3 days" },
  { kind: "deadline_day", fromHours: 0, toHours: 24, subject: "Course deadline is due within 24 hours" },
  { kind: "three_days_overdue", fromHours: -96, toHours: -72, subject: "Course deadline passed" },
] as const;
const weeklyReminder = { kind: "weekly_incomplete", subject: "Keep your course moving" } as const;
const staleClaimMs = 10 * 60 * 1000;

let workerTimer: ReturnType<typeof setInterval> | undefined;
let workerRunning = false;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function reminderKindFor(dueAt: Date, now: Date): typeof reminderWindows[number] | null {
  const hoursUntil = (dueAt.getTime() - now.getTime()) / 3_600_000;
  return reminderWindows.find((window) =>
    hoursUntil >= window.fromHours && hoursUntil < window.toHours) ?? null;
}

function currentWeekStart(now: Date): Date {
  const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 400);
  return "Email delivery failed.";
}

async function sendCourseReminder(input: {
  id: number;
  email: string;
  founderName: string;
  programName: string;
  moduleTitle: string;
  dueAt: Date | null;
  subject: string;
}): Promise<void> {
  const from = process.env.JUSOOR_EMAIL_FROM?.trim();
  if (!from || /[\r\n]/.test(from) || !from.includes("@")) {
    throw new Error("JUSOOR_EMAIL_FROM is not configured with a verified sending address.");
  }
  const deadline = input.dueAt?.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const text = [
    `Hello ${input.founderName},`,
    "",
    `This is a reminder about the "${input.moduleTitle}" learning module in ${input.programName}.`,
    ...(deadline ? [`Deadline: ${deadline} UTC`] : ["This required module is still incomplete."]),
    "Sign in to Jusoor to review your learning progress and complete the module.",
  ].join("\n");
  const deadlineHtml = deadline
    ? `<p><strong>Deadline:</strong> ${escapeHtml(deadline)} UTC</p>`
    : "<p>This required module is still incomplete.</p>";
  const html = `<p>Hello ${escapeHtml(input.founderName)},</p><p>This is a reminder about the <strong>${escapeHtml(input.moduleTitle)}</strong> learning module in ${escapeHtml(input.programName)}.</p>${deadlineHtml}<p>Sign in to Jusoor to review your learning progress and complete the module.</p>`;
  const response = await new ReplitConnectors().proxy("resend", "/emails/batch", {
    method: "POST",
    headers: {
      "Idempotency-Key": `jusoor-course-reminder-${input.id}`,
    },
    body: [{
      from,
      to: input.email,
      subject: `${input.subject}: ${input.moduleTitle}`,
      text,
      html,
    }],
  });
  if (!response.ok) {
    throw new Error(`Resend returned HTTP ${response.status}.`);
  }
}

async function queueDueReminders(now: Date): Promise<void> {
  const modules = await db.select({
    moduleId: courseModulesTable.id,
    dueAt: courseModulesTable.dueAt,
    releaseAt: courseModulesTable.releaseAt,
    createdAt: courseModulesTable.createdAt,
    position: courseModulesTable.position,
    isRequired: courseModulesTable.isRequired,
    isPublished: courseModulesTable.isPublished,
    title: courseModulesTable.title,
    programId: courseModulesTable.programId,
    programName: programsTable.name,
  }).from(courseModulesTable)
    .innerJoin(programsTable, eq(programsTable.id, courseModulesTable.programId))
    .where(and(
      eq(courseModulesTable.isPublished, true),
      eq(courseModulesTable.isRequired, true),
      or(isNull(courseModulesTable.releaseAt), lte(courseModulesTable.releaseAt, now)),
    ));
  if (!modules.length) return;
  const applications = await db.select({
    id: applicationsTable.id,
    programId: applicationsTable.programId,
    founderName: applicationsTable.founderName,
    email: applicationsTable.email,
  }).from(applicationsTable)
    .where(and(
      eq(applicationsTable.status, "accepted"),
      inArray(applicationsTable.programId, [...new Set(modules.map((module) => module.programId))]),
    ));
  if (!applications.length) return;
  const progress = await db.select({
    applicationId: courseModuleProgressTable.applicationId,
    moduleId: courseModuleProgressTable.moduleId,
    completedAt: courseModuleProgressTable.completedAt,
  }).from(courseModuleProgressTable)
    .where(and(
      inArray(courseModuleProgressTable.applicationId, applications.map((application) => application.id)),
      inArray(courseModuleProgressTable.moduleId, modules.map((module) => module.moduleId)),
    ));
  const completedKeys = new Set(progress.filter((item) => item.completedAt)
    .map((item) => `${item.applicationId}:${item.moduleId}`));
  const activity = await db.select().from(courseProgramActivityTable)
    .where(inArray(courseProgramActivityTable.applicationId, applications.map((application) => application.id)));
  const activityByApplication = new Map(activity.map((item) => [item.applicationId, item]));
  const applicationByProgram = new Map<number, typeof applications>();
  for (const application of applications) {
    const current = applicationByProgram.get(application.programId) ?? [];
    current.push(application);
    applicationByProgram.set(application.programId, current);
  }
  for (const module of modules) {
    if (!module.dueAt) continue;
    const reminder = reminderKindFor(module.dueAt, now);
    if (!reminder) continue;
    for (const application of applicationByProgram.get(module.programId) ?? []) {
      if (completedKeys.has(`${application.id}:${module.moduleId}`)) continue;
      await db.insert(courseReminderDeliveriesTable).values({
        applicationId: application.id,
        moduleId: module.moduleId,
        dueAt: module.dueAt,
        reminderKind: reminder.kind,
      }).onConflictDoNothing();
    }
  }

  const weekStart = currentWeekStart(now);
  const inactiveSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  for (const application of applications) {
    const lastActivityAt = activityByApplication.get(application.id)?.lastActivityAt;
    if (lastActivityAt && lastActivityAt >= inactiveSince) continue;
    const candidate = modules
      .filter((module) =>
        module.programId === application.programId &&
        (!module.dueAt || module.dueAt <= now) &&
        module.isRequired &&
        module.isPublished &&
        (!module.releaseAt || module.releaseAt <= now) &&
        (module.dueAt ?? module.releaseAt ?? module.createdAt) <= inactiveSince &&
        !completedKeys.has(`${application.id}:${module.moduleId}`))
      .sort((left, right) => left.position - right.position)[0];
    if (!candidate) continue;
    await db.insert(courseReminderDeliveriesTable).values({
      applicationId: application.id,
      moduleId: candidate.moduleId,
      dueAt: weekStart,
      reminderKind: weeklyReminder.kind,
    }).onConflictDoNothing();
  }
}

async function sendPendingReminders(now: Date): Promise<void> {
  const pending = await db.select({
    delivery: courseReminderDeliveriesTable,
    application: applicationsTable,
    moduleTitle: courseModulesTable.title,
    programName: programsTable.name,
  }).from(courseReminderDeliveriesTable)
    .innerJoin(applicationsTable, eq(applicationsTable.id, courseReminderDeliveriesTable.applicationId))
    .innerJoin(courseModulesTable, eq(courseModulesTable.id, courseReminderDeliveriesTable.moduleId))
    .innerJoin(programsTable, eq(programsTable.id, courseModulesTable.programId))
    .leftJoin(courseModuleProgressTable, and(
      eq(courseModuleProgressTable.applicationId, courseReminderDeliveriesTable.applicationId),
      eq(courseModuleProgressTable.moduleId, courseReminderDeliveriesTable.moduleId),
    ))
    .where(and(
      inArray(courseReminderDeliveriesTable.status, ["pending", "failed"]),
      lte(courseReminderDeliveriesTable.nextAttemptAt, now),
      eq(applicationsTable.status, "accepted"),
      eq(courseModulesTable.isPublished, true),
      eq(courseModulesTable.isRequired, true),
      or(isNull(courseModulesTable.releaseAt), lte(courseModulesTable.releaseAt, now)),
      or(
        and(
          eq(courseReminderDeliveriesTable.reminderKind, weeklyReminder.kind),
          or(isNull(courseModulesTable.dueAt), lte(courseModulesTable.dueAt, now)),
        ),
        and(
          ne(courseReminderDeliveriesTable.reminderKind, weeklyReminder.kind),
          eq(courseModulesTable.dueAt, courseReminderDeliveriesTable.dueAt),
        ),
      ),
      or(isNull(courseModuleProgressTable.completedAt)),
    ))
    .orderBy(asc(courseReminderDeliveriesTable.nextAttemptAt))
    .limit(50);

  for (const item of pending) {
    const attempt = item.delivery.attempts + 1;
    const [claimed] = await db.update(courseReminderDeliveriesTable)
      .set({ status: "sending", attempts: sql`${courseReminderDeliveriesTable.attempts} + 1`, updatedAt: now })
      .where(and(
        eq(courseReminderDeliveriesTable.id, item.delivery.id),
        inArray(courseReminderDeliveriesTable.status, ["pending", "failed"]),
        lte(courseReminderDeliveriesTable.nextAttemptAt, now),
      ))
      .returning({ id: courseReminderDeliveriesTable.id });
    if (!claimed) continue;

    const reminder = reminderWindows.find((window) => window.kind === item.delivery.reminderKind) ??
      (item.delivery.reminderKind === weeklyReminder.kind ? weeklyReminder : null);
    try {
      if (!reminder) throw new Error("Unknown course reminder type.");
      await sendCourseReminder({
        id: item.delivery.id,
        email: item.application.email,
        founderName: item.application.founderName,
        programName: item.programName,
        moduleTitle: item.moduleTitle,
        dueAt: item.delivery.reminderKind === weeklyReminder.kind ? null : item.delivery.dueAt,
        subject: reminder.subject,
      });
      await db.update(courseReminderDeliveriesTable).set({
        status: "sent",
        sentAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      }).where(eq(courseReminderDeliveriesTable.id, item.delivery.id));
    } catch (error) {
      const retryDelayMs = Math.min(24 * 60 * 60 * 1000, 15 * 60 * 1000 * (2 ** Math.min(attempt - 1, 6)));
      await db.update(courseReminderDeliveriesTable).set({
        status: "failed",
        nextAttemptAt: new Date(Date.now() + retryDelayMs),
        lastError: safeError(error),
        updatedAt: new Date(),
      }).where(eq(courseReminderDeliveriesTable.id, item.delivery.id));
      logger.warn({ applicationId: item.application.id, moduleId: item.delivery.moduleId, attempt }, "Course reminder email failed and will be retried");
    }
  }
}

async function processCourseReminders(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const now = new Date();
    await db.update(courseReminderDeliveriesTable).set({
      status: "failed",
      nextAttemptAt: now,
      lastError: "Previous email attempt did not finish.",
      updatedAt: now,
    }).where(and(
      eq(courseReminderDeliveriesTable.status, "sending"),
      lt(courseReminderDeliveriesTable.updatedAt, new Date(now.getTime() - staleClaimMs)),
    ));
    await queueDueReminders(now);
    await sendPendingReminders(now);
  } catch (error) {
    logger.error({ err: error }, "Course reminder worker failed");
  } finally {
    workerRunning = false;
  }
}

export function startCourseReminderWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processCourseReminders();
  }, workerIntervalMs);
  workerTimer.unref?.();
  void processCourseReminders();
}
