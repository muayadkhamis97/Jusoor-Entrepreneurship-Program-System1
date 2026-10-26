import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
const schema = await import("@workspace/db");
const { db, pool } = schema;
const { processAnnouncementEmails, announcementEmailStatuses } = await import("../src/lib/announcement-email");
const { PlatformEmailSendUncertainError } = await import("../src/lib/platform-email");
const { default: router } = await import("../src/routes/communications");

test("announcement email lifecycle uses isolated PostgreSQL tables and never sends real mail", { skip: !databaseAvailable }, async t => {
  const connection = await pool.connect();
  const tables = [
    "jusoor_program_announcements", "jusoor_announcement_email_requests", "jusoor_announcement_email_deliveries",
    "jusoor_applications", "jusoor_programs", "jusoor_staff_members", "jusoor_staff_program_assignments", "jusoor_businesses",
    "jusoor_participant_business_memberships",
  ];
  const methods = ["select", "insert", "update", "delete", "transaction"] as const;
  const originals = methods.map(name => [name, Object.getOwnPropertyDescriptor(db, name)] as const);
  const local = drizzle(connection, { schema });
  let server: ReturnType<typeof createServer> | undefined;
  try {
    for (const table of tables) {
      assert.match(table, /^jusoor_[a-z_]+$/);
      // These additive tables may not exist yet in the shared development schema.
      // Build them locally so this integration test remains isolated and can still
      // exercise its deliberate missing-table fallback case.
      if (table === "jusoor_announcement_email_requests" || table === "jusoor_announcement_email_deliveries") continue;
      await connection.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
      if (table !== "jusoor_announcement_email_requests") {
        await connection.query(`CREATE TEMP SEQUENCE ${table}_test_seq START 100`);
        await connection.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN id SET DEFAULT nextval('pg_temp.${table}_test_seq')`);
      }
    }
    await connection.query(`
      CREATE TEMP TABLE jusoor_announcement_email_requests (
        announcement_id integer PRIMARY KEY REFERENCES jusoor_program_announcements(id) ON DELETE CASCADE,
        prepared_at timestamptz,
        paused boolean NOT NULL DEFAULT false,
        checked_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TEMP TABLE jusoor_announcement_email_deliveries (
        id serial PRIMARY KEY,
        announcement_id integer NOT NULL REFERENCES jusoor_announcement_email_requests(announcement_id) ON DELETE CASCADE,
        email text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempted_at timestamptz,
        sent_at timestamptz
      );
      CREATE UNIQUE INDEX jusoor_announcement_email_recipient_unique
        ON jusoor_announcement_email_deliveries(announcement_id, email);
      CREATE INDEX jusoor_announcement_email_pending_idx
        ON jusoor_announcement_email_deliveries(status);
    `);
    for (const name of methods) Object.defineProperty(db, name, { configurable: true, value: local[name].bind(local) });
    // Do not ever fall through to public tables, even when simulating a missing table.
    await connection.query("SET search_path TO pg_temp");
    await connection.query(`
      INSERT INTO pg_temp.jusoor_programs (id, name) VALUES (1, 'Assigned'), (2, 'Other'), (3, 'Archived');
      UPDATE pg_temp.jusoor_programs SET archived_at = now() WHERE id = 3;
      INSERT INTO pg_temp.jusoor_staff_members (id, email, role, status)
        VALUES (1, 'admin@example.test', 'coordinator', 'active'), (2, 'staff@example.test', 'staff', 'active');
      INSERT INTO pg_temp.jusoor_staff_program_assignments (staff_id, program_id) VALUES (2, 1), (2, 3);
      INSERT INTO pg_temp.jusoor_businesses (id, program_id, business_name, founder_name, email)
        VALUES (11, 1, 'One', 'One', 'one@example.test'), (12, 1, 'Two', 'Two', 'other-team@example.test');
      INSERT INTO pg_temp.jusoor_applications (id, program_id, founder_name, email, business_name, summary, support_needs, status, business_id)
        VALUES (1, 1, 'One', 'ONE@example.test', 'One', 'Summary', 'Needs', 'accepted', 11),
        (2, 1, 'Two', 'two@example.test', 'One', 'Summary', 'Needs', 'accepted', 11),
        (3, 1, 'Rejected', 'rejected@example.test', 'One', 'Summary', 'Needs', 'rejected', 11),
        (4, 1, 'Other team', 'other-team@example.test', 'Two', 'Summary', 'Needs', 'accepted', 12),
        (5, 2, 'Duplicate', 'one@example.test', 'Other', 'Summary', 'Needs', 'accepted', 21);
    `);
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const role = req.get("x-role") ?? "coordinator";
      res.locals.staff = { id: role === "staff" ? 2 : 1, role, programIds: [1, 3] };
      req.log = { warn() {} } as typeof req.log;
      next();
    });
    app.use("/api", router);
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/api`;
    const post = async (path: string, data = {}, role = "coordinator") => fetch(`${origin}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-role": role }, body: JSON.stringify(data),
    });
    const create = async (data = {}) => {
      const response = await post("/communications", { kind: "update", title: "Important update", body: "Please read this announcement.", notifyByEmail: true, ...data });
      const result = await response.json();
      assert.equal(response.status, 201, JSON.stringify(result));
      return result as { id: number; email: { state: string } };
    };
    const sent: string[] = [];
    const send = async (message: { recipients: string[] }) => { sent.push(...message.recipients); };

    await t.test("portal-only and legacy messages never gain email requests; future messages do not send early", async () => {
      const portal = await create({ notifyByEmail: false });
      assert.equal(portal.email.state, "not_requested");
      const scheduled = await create({ scheduledFor: "2099-01-01T00:00:00Z" });
      await processAnnouncementEmails(send);
      assert.deepEqual(sent, []);
      assert.equal((await announcementEmailStatuses([portal.id])).size, 0);
      assert.equal((await announcementEmailStatuses([scheduled.id])).get(scheduled.id)?.state, "queued");
      assert.equal((await post(`/communications/${portal.id}/email/retry`)).status, 404);
    });
    await t.test("global messages deduplicate accepted addresses and repeated workers do not resend", async () => {
      const result = await create();
      await processAnnouncementEmails(send);
      assert.deepEqual([...sent].sort(), ["one@example.test", "two@example.test", "other-team@example.test"].sort());
      await processAnnouncementEmails(send);
      assert.equal(sent.length, 3);
      assert.equal((await announcementEmailStatuses([result.id])).get(result.id)?.sent, 3);
    });
    await t.test("business audience is private, retries exclude successful and uncertain recipients", async () => {
      const result = await create({ programId: 1, businessId: 11 });
      let calls = 0;
      await processAnnouncementEmails(async message => {
        calls++;
        if (message.recipients[0] === "one@example.test") throw new Error("Profile unavailable before sending");
        throw new PlatformEmailSendUncertainError("Lost response");
      });
      assert.equal(calls, 2);
      const status = (await announcementEmailStatuses([result.id])).get(result.id)!;
      assert.equal(status.failed, 1);
      assert.equal(status.uncertain, 1);
      assert.equal((await post(`/communications/${result.id}/email/retry`)).status, 200);
      const retrySent: string[] = [];
      // Both workers can see pending work, but only one can persist its sending claim.
      await Promise.all([processAnnouncementEmails(async m => { retrySent.push(...m.recipients); }),
        processAnnouncementEmails(async m => { retrySent.push(...m.recipients); })]);
      assert.deepEqual(retrySent, ["one@example.test"]);
      assert.equal((await post(`/communications/${result.id}/email/retry`)).status, 200);
      await processAnnouncementEmails(send);
      assert.equal(sent.length, 3);
    });
    await t.test("accepted membership is rechecked on retry and later enrollment does not expand the audience", async () => {
      const result = await create({ programId: 1 });
      await processAnnouncementEmails(async () => { throw new Error("Profile lookup failed"); });
      await connection.query("UPDATE pg_temp.jusoor_applications SET status = 'withdrawn' WHERE id = 2");
      await connection.query(`INSERT INTO pg_temp.jusoor_applications
        (program_id, founder_name, email, business_name, summary, support_needs, status)
        VALUES (1, 'Later', 'later@example.test', 'Later', 'Summary', 'Needs', 'accepted')`);
      await post(`/communications/${result.id}/email/retry`);
      const addresses: string[] = [];
      await processAnnouncementEmails(async m => { addresses.push(...m.recipients); });
      assert.deepEqual(addresses.sort(), ["one@example.test", "other-team@example.test"].sort());
      assert.equal((await announcementEmailStatuses([result.id])).get(result.id)?.skipped, 1);
    });
    await t.test("staff publishing and retries stay within assigned active programs", async () => {
      for (const programId of [null, 2, 3]) {
        assert.equal((await post("/communications", { kind: "update", title: "Important", body: "Announcement", programId, notifyByEmail: true }, "staff")).status, 403);
      }
      const other = await create({ programId: 2 });
      assert.equal((await post(`/communications/${other.id}/email/retry`, {}, "staff")).status, 404);
      const staffResponse = await post("/communications", { kind: "update", title: "Staff update", body: "Announcement", programId: 1, notifyByEmail: true }, "staff");
      const staffAnnouncement = await staffResponse.json() as { id: number };
      assert.equal(staffResponse.status, 201);
      await connection.query("DELETE FROM pg_temp.jusoor_staff_program_assignments WHERE program_id = 1");
      await processAnnouncementEmails(send);
      assert.equal((await announcementEmailStatuses([staffAnnouncement.id])).get(staffAnnouncement.id)?.state, "paused");
    });
    await t.test("scheduled mail starts only after release and deletion cancels pending delivery", async () => {
      const scheduled = await create({ scheduledFor: "2099-02-01T00:00:00Z", programId: 2 });
      const addresses: string[] = [];
      await processAnnouncementEmails(async m => { addresses.push(...m.recipients); });
      assert.deepEqual(addresses, []);
      await connection.query("UPDATE pg_temp.jusoor_program_announcements SET scheduled_for = now() WHERE id = $1", [scheduled.id]);
      await processAnnouncementEmails(async m => { addresses.push(...m.recipients); });
      assert.deepEqual(addresses, ["one@example.test"]);
      const deleted = await create({ programId: 2 });
      // TEMP LIKE does not copy foreign keys; the real delete cascades requests and deliveries.
      await connection.query("DELETE FROM pg_temp.jusoor_program_announcements WHERE id = $1", [deleted.id]);
      await processAnnouncementEmails(async m => { addresses.push(...m.recipients); });
      assert.equal(addresses.length, 1);
    });
    await t.test("a lost database acknowledgement after sending never becomes retryable", async () => {
      const result = await create({ programId: 2 });
      const realUpdate = db.update.bind(db);
      Object.defineProperty(db, "update", { configurable: true, value: (table: unknown) => {
        const update = realUpdate(table as typeof schema.announcementEmailDeliveriesTable);
        return { set(values: Record<string, unknown>) {
          if (table === schema.announcementEmailDeliveriesTable && values.status === "sent") {
            return { where() { throw new Error("Database acknowledgement lost"); } };
          }
          return update.set(values);
        } };
      } });
      let sends = 0;
      try { await assert.rejects(processAnnouncementEmails(async () => { sends++; }), /acknowledgement lost/); }
      finally { Object.defineProperty(db, "update", { configurable: true, value: local.update.bind(local) }); }
      assert.equal(sends, 1);
      await post(`/communications/${result.id}/email/retry`);
      await processAnnouncementEmails(async () => { sends++; });
      assert.equal(sends, 1);
      await connection.query("UPDATE pg_temp.jusoor_announcement_email_deliveries SET attempted_at = now() - interval '11 minutes' WHERE announcement_id = $1", [result.id]);
      const status = (await announcementEmailStatuses([result.id])).get(result.id)!;
      assert.equal(status.uncertain, 1);
      assert.equal(status.canRetry, false);
    });
    await t.test("queue storage failures do not roll back portal publishing", async () => {
      await connection.query("ALTER TABLE pg_temp.jusoor_announcement_email_requests RENAME TO email_requests_unavailable");
      try {
        const result = await create({ programId: 1 });
        assert.equal(result.email.state, "unavailable");
        const saved = await connection.query("SELECT id FROM pg_temp.jusoor_program_announcements WHERE id = $1", [result.id]);
        assert.equal(saved.rowCount, 1);
      } finally {
        await connection.query("ALTER TABLE pg_temp.email_requests_unavailable RENAME TO jusoor_announcement_email_requests");
      }
    });
    await t.test("staff-assigned business members receive email only while their effective portal membership remains valid", async () => {
      await connection.query(`
        INSERT INTO pg_temp.jusoor_applications
          (id, program_id, founder_name, email, business_name, summary, support_needs, status, business_id)
          VALUES
          (60, 1, 'Assigned member', 'assigned@example.test', 'One', 'Summary', 'Needs', 'accepted', null),
          (61, 1, 'Direct other team', 'direct-other@example.test', 'Two', 'Summary', 'Needs', 'accepted', 12),
          (62, 2, 'Other program', 'cross-program@example.test', 'Other', 'Summary', 'Needs', 'accepted', null),
          (63, 1, 'Rejected member', 'rejected-member@example.test', 'One', 'Summary', 'Needs', 'rejected', null);
        INSERT INTO pg_temp.jusoor_participant_business_memberships (application_id, business_id)
          VALUES (60, 11), (61, 11), (62, 11), (63, 11);
      `);
      const announcement = await create({ programId: 1, businessId: 11 });
      const attempted: string[] = [];
      await processAnnouncementEmails(async message => {
        attempted.push(...message.recipients);
        if (message.recipients[0] === "assigned@example.test") throw new Error("Failed before Gmail accepted the message");
      });
      // Null application business is resolved through its staff-managed membership.
      // Direct membership wins over stale assignments, and program/status boundaries still apply.
      assert.deepEqual(attempted.sort(), ["one@example.test", "assigned@example.test"].sort());
      assert.equal((await announcementEmailStatuses([announcement.id])).get(announcement.id)?.failed, 1);
      await connection.query("DELETE FROM pg_temp.jusoor_participant_business_memberships WHERE application_id = 60");
      assert.equal((await post(`/communications/${announcement.id}/email/retry`)).status, 200);
      const retried: string[] = [];
      await processAnnouncementEmails(async message => { retried.push(...message.recipients); });
      assert.deepEqual(retried, []);
      const status = (await announcementEmailStatuses([announcement.id])).get(announcement.id)!;
      assert.equal(status.sent, 1);
      assert.equal(status.skipped, 1);
      assert.equal(status.failed, 0);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(db, name, original);
      else delete (db as unknown as Record<string, unknown>)[name];
    }
    // Drop only this connection's temporary tables and sequences.
    await connection.query("DISCARD TEMP");
    await connection.query("RESET search_path");
    connection.release();
    await pool.end();
  }
});
