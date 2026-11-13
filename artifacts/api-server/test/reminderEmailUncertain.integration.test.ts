import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import type { ProgramEmailBranding } from "../src/lib/email-branding";
import type { PlatformEmail } from "../src/lib/platform-email";

const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
process.env.REPLIT_DOMAINS ??= "example.test";

const schema = await import("@workspace/db");
const { sendPlatformEmail, stableMessageId } =
  await import("../src/lib/platform-email");
const { processCourseReminders } = await import("../src/lib/course-reminders");
const { processMentorFollowUpDigests } =
  await import("../src/lib/mentor-follow-up-digests");
const { getProgramCalendarDate } =
  await import("../src/lib/mentor-follow-up-digests");
const {
  retryZoomRecordingAlertEmail,
} = await import("../src/lib/zoom-recording-alerts");

const testBranding: ProgramEmailBranding = {
  brandName: "Test Program",
  logoUrl: null,
  primaryColor: "#28665a",
  accentColor: "#d98a46",
};

function makeLostResponseSender() {
  const requests: { path: string; body?: unknown }[] = [];
  const acceptedMessageIds = new Set<string>();
  const connectors = {
    async proxy(_connector: string, path: string, config?: { body?: unknown }) {
      requests.push({ path, body: config?.body });
      if (path.endsWith("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "sender@example.test" }));
      }
      if (path.includes("/messages?")) {
        const decodedPath = decodeURIComponent(path);
        const alreadyAccepted = [...acceptedMessageIds].some((id) =>
          decodedPath.includes(id),
        );
        return new Response(JSON.stringify(
          alreadyAccepted ? { messages: [{ id: "accepted-message" }] } : {},
        ));
      }
      if (path.endsWith("/messages/send")) {
        const raw = (config?.body as { raw?: string } | undefined)?.raw;
        assert.equal(typeof raw, "string");
        const decodedMessage = Buffer.from(raw!, "base64url").toString("utf8");
        const messageId = decodedMessage.match(/^Message-ID: <([^>]+)>/im)?.[1];
        assert.ok(messageId, "the sent email keeps its stable Message-ID");
        acceptedMessageIds.add(messageId!);
        // Gmail accepts the message, then the connector loses the response.
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fake Gmail request: ${path}`);
    },
  } as unknown as Pick<ReplitConnectors, "proxy">;

  const idempotencyKeys: string[] = [];
  const send = async (message: PlatformEmail): Promise<void> => {
    idempotencyKeys.push(message.idempotencyKey);
    await sendPlatformEmail(
      message,
      connectors,
      async () => testBranding,
      { profileMs: 500, sendMs: 15, sentLookupMs: 100 },
    );
  };
  return { send, requests, idempotencyKeys };
}

async function makeIsolatedTables(connection: {
  query: (text: string) => Promise<unknown>;
}) {
  const tables = [
    "jusoor_programs",
    "jusoor_applications",
    "jusoor_course_modules",
    "jusoor_course_module_progress",
    "jusoor_course_program_activity",
    "jusoor_course_reminder_deliveries",
    "jusoor_staff_members",
    "jusoor_staff_program_roles",
    "jusoor_mentor_follow_up_digest_deliveries",
    "jusoor_sessions",
    "jusoor_zoom_recording_alerts",
  ];
  for (const table of tables) {
    assert.match(table, /^jusoor_[a-z_]+$/);
    await connection.query(
      `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`,
    );
  }
  await connection.query("SET search_path TO pg_temp");
}

test("reminder workers hold lost Gmail responses and keep definite failures retryable", {
  skip: !databaseAvailable,
}, async (t) => {
  const connection = await schema.pool.connect();
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 1);
  now.setUTCHours(12, 0, 0, 0);
  const staleAt = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const dueAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const calendarDate = getProgramCalendarDate(now);
  const methods = ["select", "insert", "update", "delete", "transaction"] as const;
  const originals = methods.map((name) =>
    [name, Object.getOwnPropertyDescriptor(schema.db, name)] as const,
  );
  const local = drizzle(connection, { schema });
  try {
    await makeIsolatedTables(connection);
    for (const name of methods) {
      Object.defineProperty(schema.db, name, {
        configurable: true,
        value: local[name].bind(local),
      });
    }
    await connection.query(`
      INSERT INTO jusoor_programs (id, name) VALUES (1, 'Test cohort');
      INSERT INTO jusoor_applications
        (id, program_id, founder_name, email, business_name, summary, support_needs, status)
        VALUES
          (101, 1, 'Stale Founder', 'stale@example.test', 'Stale Business', 'Summary', 'Needs', 'accepted'),
          (102, 1, 'Course Founder', 'course@example.test', 'Course Business', 'Summary', 'Needs', 'accepted');
      INSERT INTO jusoor_course_modules
        (id, program_id, title, position, due_at, is_required, is_published, created_at)
        VALUES (201, 1, 'Required module', 1, '${dueAt}', true, true, '2026-10-01T00:00:00Z');
      INSERT INTO jusoor_course_reminder_deliveries
        (id, application_id, module_id, due_at, reminder_kind, status, attempts, next_attempt_at, updated_at)
        VALUES (301, 101, 201, '${dueAt}', 'deadline_day', 'sending', 1, now(), '${staleAt}');
      INSERT INTO jusoor_staff_members (id, email, role, status, calendly_follow_up_date)
        VALUES
          (401, 'coordinator@example.test', 'coordinator', 'active', null),
          (403, 'retry-coordinator@example.test', 'coordinator', 'active', null),
          (402, 'mentor@example.test', 'mentor', 'active', '2026-11-10');
      INSERT INTO jusoor_mentor_follow_up_digest_deliveries
        (id, coordinator_staff_id, calendar_date, status, attempts, next_attempt_at, last_attempt_at)
        VALUES (501, 401, '${calendarDate}', 'sending', 1, now(), '${staleAt}');
      INSERT INTO jusoor_sessions (id, title, scheduled_date)
        VALUES (601, 'Recording session', '2026-11-13');
      INSERT INTO jusoor_zoom_recording_alerts
        (id, session_id, event_key, email_status, email_attempts, email_last_attempt_at)
        VALUES
          (701, 601, 'recording.completed:stale', 'sending', 1, now() - interval '20 minutes'),
          (702, 601, 'recording.completed:ready', 'pending', 0, null);
    `);

    await t.test("course reminders do not reclaim stale or ambiguous sends", async () => {
      const failBeforeSend = async () => {
        throw new Error("Synthetic profile lookup failure; nothing was sent.");
      };
      await processCourseReminders(now, failBeforeSend);
      let deliveries = await schema.db.select().from(schema.courseReminderDeliveriesTable);
      assert.equal(deliveries.find((row) => row.id === 301)?.status, "uncertain");
      const retryable = deliveries.find((row) => row.applicationId === 102);
      assert.equal(retryable?.status, "failed");

      await schema.db.update(schema.courseReminderDeliveriesTable)
        .set({ nextAttemptAt: now })
        .where(eq(
          schema.courseReminderDeliveriesTable.id,
          retryable!.id,
        ));

      const connector = makeLostResponseSender();
      await processCourseReminders(now, connector.send);
      deliveries = await schema.db.select().from(schema.courseReminderDeliveriesTable);
      const uncertain = deliveries.find((row) => row.id === retryable!.id)!;
      assert.equal(uncertain.status, "uncertain");
      assert.equal(connector.idempotencyKeys.length, 1);
      assert.equal(connector.idempotencyKeys[0], `jusoor-course-reminder-${uncertain.id}`);
      assert.equal(
        connector.requests.filter((request) => request.path.endsWith("/messages/send")).length,
        1,
      );

      await processCourseReminders(now, connector.send);
      assert.equal(
        connector.requests.filter((request) => request.path.endsWith("/messages/send")).length,
        1,
      );
    });

    await t.test("mentor digests hold stale claims and lost responses", async () => {
      const failBeforeSend = async () => {
        throw new Error("Synthetic profile lookup failure; nothing was sent.");
      };
      await processMentorFollowUpDigests(now, failBeforeSend);
      let deliveries = await schema.db.select().from(
        schema.mentorFollowUpDigestDeliveriesTable,
      );
      assert.equal(deliveries.find((row) => row.id === 501)?.status, "uncertain");
      const retryable = deliveries.find((row) => row.coordinatorStaffId === 403);
      assert.equal(retryable?.status, "failed");
      await schema.db.update(schema.mentorFollowUpDigestDeliveriesTable)
        .set({ nextAttemptAt: now })
        .where(eq(
          schema.mentorFollowUpDigestDeliveriesTable.id,
          retryable!.id,
        ));

      const connector = makeLostResponseSender();
      await processMentorFollowUpDigests(now, connector.send);
      deliveries = await schema.db.select().from(
        schema.mentorFollowUpDigestDeliveriesTable,
      );
      assert.equal(deliveries.find((row) => row.id === retryable!.id)?.status, "uncertain");
      assert.deepEqual(connector.idempotencyKeys, [
        `jusoor-mentor-follow-up-digest-403-${calendarDate}`,
      ]);
      assert.equal(
        connector.requests.filter((request) => request.path.endsWith("/messages/send")).length,
        1,
      );

      await processMentorFollowUpDigests(now, connector.send);
      assert.equal(
        connector.requests.filter((request) => request.path.endsWith("/messages/send")).length,
        1,
      );
    });

    await t.test("Zoom recording alerts hold stale claims and lost responses", async () => {
      const staleResult = await retryZoomRecordingAlertEmail(701);
      assert.equal(staleResult, "uncertain");
      const connector = makeLostResponseSender();
      const failBeforeSend = async () => {
        throw new Error("Synthetic profile lookup failure; nothing was sent.");
      };
      assert.equal(await retryZoomRecordingAlertEmail(702, failBeforeSend), "failed");
      let [alert] = await schema.db.select().from(schema.zoomRecordingAlertsTable)
        .where(eq(schema.zoomRecordingAlertsTable.id, 702));
      assert.equal(alert?.emailStatus, "failed");

      assert.equal(await retryZoomRecordingAlertEmail(702, connector.send), "uncertain");
      [alert] = await schema.db.select().from(schema.zoomRecordingAlertsTable)
        .where(eq(schema.zoomRecordingAlertsTable.id, 702));
      assert.equal(alert?.emailStatus, "uncertain");
      assert.deepEqual(connector.idempotencyKeys, [
        `jusoor-zoom-recording-702-recording.completed:ready`,
      ]);
      assert.equal(
        connector.requests.filter((request) => request.path.endsWith("/messages/send")).length,
        1,
      );
      const raw = (connector.requests.find((request) =>
        request.path.endsWith("/messages/send"),
      )?.body as { raw: string }).raw;
      const message = Buffer.from(raw, "base64url").toString("utf8");
      assert.match(message, new RegExp(stableMessageId(
        "jusoor-zoom-recording-702-recording.completed:ready",
        "coordinator@example.test",
      ).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      assert.equal(await retryZoomRecordingAlertEmail(702, connector.send), "uncertain");
      assert.equal(
        connector.requests.filter((request) => request.path.endsWith("/messages/send")).length,
        1,
      );
    });
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(schema.db, name, descriptor);
    }
    connection.release();
  }
});
