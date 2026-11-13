import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
const { db, pool } = await import("@workspace/db");
const { createAnnouncementRepliesRouter } = await import("../src/routes/announcementReplies");
const { default: communicationsRouter } = await import("../src/routes/communications");

describe("private announcement reply API", { skip: !databaseAvailable }, () => {
  let client: Awaited<ReturnType<typeof pool.connect>>;
  let server: Server;
  let origin: string;
  const originals = ["select", "insert", "update", "delete"].map(key => [key, Object.getOwnPropertyDescriptor(db, key)] as const);
  before(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    // Synthetic temporary tables shadow public tables. No real user records or
    // sequences are changed, and rollback removes all fixtures and schema.
    await client.query(`
      CREATE TEMP TABLE jusoor_programs (id integer PRIMARY KEY, name text, archived_at timestamptz);
      CREATE TEMP TABLE jusoor_businesses (id integer PRIMARY KEY, program_id integer, business_name text);
      CREATE TEMP TABLE jusoor_applications (id integer PRIMARY KEY, program_id integer, business_id integer, founder_name text, clerk_user_id text, status text);
      CREATE TEMP TABLE jusoor_participant_business_memberships (id integer PRIMARY KEY, application_id integer, business_id integer);
      CREATE TEMP TABLE jusoor_staff_members (id integer PRIMARY KEY);
      CREATE TEMP TABLE jusoor_sessions (id integer PRIMARY KEY, program_id integer, recording_version integer, recording_url text);
      CREATE TEMP TABLE jusoor_program_announcements (
        id integer PRIMARY KEY, program_id integer, business_id integer, session_id integer,
        recording_version integer, scheduled_for timestamptz NOT NULL DEFAULT now(),
        kind text NOT NULL DEFAULT 'update', title text NOT NULL DEFAULT 'Program update',
        body text NOT NULL DEFAULT 'A message for participants', created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TEMP TABLE jusoor_announcement_email_requests (
        announcement_id integer PRIMARY KEY, prepared_at timestamptz, paused boolean NOT NULL DEFAULT false,
        pause_reason text, resume_at timestamptz, checked_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TEMP TABLE jusoor_announcement_email_deliveries (
        id integer PRIMARY KEY, announcement_id integer, email text, status text, failure_kind text,
        attempted_at timestamptz, sent_at timestamptz
      );
      INSERT INTO jusoor_programs VALUES (11,'One',NULL),(22,'Two',NULL),(33,'Archived',now());
      INSERT INTO jusoor_businesses VALUES (201,11,'Shared team'),(202,11,'Other business'),(203,22,'Other program'),(204,33,'Archived business');
      INSERT INTO jusoor_applications VALUES
        (101,11,201,'Founder One','one','accepted'),
        (102,11,201,'Teammate','two','accepted'),
        (103,11,202,'Other Business','three','accepted'),
        (104,22,203,'Other Program','four','accepted'),
        (105,11,201,'Pending','pending','submitted'),
        (106,11,NULL,'Invited teammate','member','accepted'),
        (107,33,204,'Archived','archived','accepted'),
        (108,22,203,'Founder One in Two','one','accepted');
      INSERT INTO jusoor_participant_business_memberships VALUES (1,106,201),(2,103,201);
      INSERT INTO jusoor_staff_members VALUES (7);
      INSERT INTO jusoor_sessions VALUES (301,11,2,'https://drive.google.com/file/d/recording/view');
      INSERT INTO jusoor_program_announcements(id,program_id,business_id) VALUES
        (1,11,NULL),(2,11,201),(3,22,203),(4,NULL,NULL),(5,33,NULL);
      INSERT INTO jusoor_program_announcements(id,program_id,business_id,session_id,recording_version,scheduled_for) VALUES
        (6,11,NULL,NULL,NULL,now()+interval '1 day'),
        (7,11,NULL,301,1,now()), (8,11,NULL,301,2,now());
    `);
    const migration = readFileSync(new URL("../../../lib/db/migrations/20261022_announcement_replies.sql", import.meta.url), "utf8")
      .replace("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE");
    await client.query(migration);
    const isolated = drizzle(client);
    for (const key of ["select", "insert", "update", "delete"] as const) {
      Object.defineProperty(db, key, { configurable: true, value: isolated[key].bind(isolated) });
    }
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const userId = req.get("x-test-user");
      const role = req.get("x-test-role");
      if (!userId && !role) { res.status(401).json({ error: "Sign in required." }); return; }
      if (userId) res.locals.participant = { userId, email: `${userId}@example.test` };
      if (role) res.locals.staff = { id: 7, role, programIds: req.get("x-empty-scope") ? [] : [11] };
      next();
    });
    app.use("/api/participant/announcements", createAnnouncementRepliesRouter("participant"));
    app.use("/api", communicationsRouter);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
  });
  after(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(db, key, descriptor);
    if (client) { await client.query("ROLLBACK"); client.release(); }
    await pool.end();
  });

  function request(actor: string, announcement: number | string, suffix = "", body?: unknown, headers = {}) {
    const staff = ["staff", "coordinator", "trainer", "mentor", "judge", "anonymous"].includes(actor);
    return fetch(`${origin}/api/${staff ? "communications" : "participant/announcements"}/${announcement}/replies${suffix}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...headers,
        ...(actor === "anonymous" ? {} : staff ? { "x-test-role": actor } : { "x-test-user": actor }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function send(actor: string, announcement: number, applicationId: number, body = "A private reply") {
    return request(actor, announcement, `/${applicationId}`, { body });
  }
  type Conversation = { applicationId: number; unreadCount: number; messages: { id: number; body: string; sender: string; readAt: string | null }[] };
  async function conversations(actor: string, announcement: number): Promise<Conversation[]> {
    const response = await request(actor, announcement);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return response.json();
  }

  test("rejects anonymous, specialist and invalid identifiers", async () => {
    assert.equal((await request("anonymous", 1)).status, 401);
    for (const role of ["trainer", "mentor", "judge"]) {
      assert.equal((await request(role, 1)).status, 403);
      assert.equal((await send(role, 1, 101)).status, 403);
      assert.equal((await request(role, 1, "/101/read", { throughId: 1 })).status, 403);
    }
    assert.equal((await request("one", "bad")).status, 400);
    assert.equal((await request("one", 1, "/-1", { body: "Test" })).status, 400);
    for (const body of ["", "   ", "x".repeat(5001)]) {
      assert.equal((await send("one", 1, 101, body)).status, 400);
    }
  });

  test("staff see an empty list when an accessible cohort has no replies or accepted participants", async () => {
    assert.deepEqual(await conversations("staff", 1), []);
    await client.query("INSERT INTO jusoor_programs VALUES (44,'Empty cohort',NULL); INSERT INTO jusoor_program_announcements(id,program_id) VALUES(9,44)");
    assert.deepEqual(await conversations("coordinator", 9), []);
    assert.equal((await request("staff", 9)).status, 404);
  });

  test("participants see only their own replies, not a teammate or another business", async () => {
    const response = await request("one", 1, "/101", { body: "  Only my program team sees this  ", sender: "staff", applicationId: 102 });
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.equal(saved.sender, "participant");
    assert.equal(saved.body, "Only my program team sees this");
    const own = await conversations("one", 1);
    assert.deepEqual(own.map(row => row.applicationId), [101]);
    assert.equal(own[0].messages[0].id, saved.id);
    for (const actor of ["two", "three"]) {
      const rows = await conversations(actor, 1);
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].messages, []);
      assert.equal((await send(actor, 1, 101)).status, 404);
      assert.equal((await request(actor, 1, "/101/read", { throughId: saved.id })).status, 404);
    }
    assert.equal((await send("one", 1, 102)).status, 404);
    assert.equal((await send("one", 1, 103)).status, 404);
    const staff = await conversations("staff", 1);
    assert.equal(staff[0].unreadCount, 1);
    assert.equal(staff[0].messages[0].body, saved.body);
  });

  test("business-targeted messages require current business in the original program", async () => {
    assert.equal((await send("one", 2, 101)).status, 201);
    assert.equal((await send("two", 2, 102)).status, 201);
    assert.equal((await send("member", 2, 106)).status, 201);
    // Primary business wins over an inconsistent secondary membership.
    for (const [actor, app] of [["three", 103], ["four", 104], ["pending", 105]] as const) {
      assert.equal((await request(actor, 2)).status, 404);
      assert.equal((await send(actor, 2, app)).status, 404);
      assert.equal((await request(actor, 2, `/${app}/read`, { throughId: 99999 })).status, 404);
    }
    const teammate = await conversations("two", 2);
    assert.deepEqual(teammate.map(row => row.applicationId), [102]);
    assert.equal(teammate[0].messages.length, 1);
  });

  test("staff responses and read receipts are private, bounded and persistent", async () => {
    const before = (await conversations("staff", 1))[0];
    const firstId = before.messages.at(-1)!.id;
    const response = await send("staff", 1, 101, "Private team response");
    assert.equal(response.status, 201);
    const staffMessage = await response.json();
    assert.equal(staffMessage.sender, "staff");
    assert.equal((await conversations("one", 1))[0].unreadCount, 1);
    assert.equal((await conversations("two", 1))[0].unreadCount, 0);
    // Mark only already rendered incoming messages; a later one stays unread.
    const later = await (await send("one", 1, 101, "A later participant reply")).json();
    assert.equal((await request("staff", 1, "/101/read", { throughId: firstId })).status, 204);
    let staff = (await conversations("staff", 1))[0];
    assert.equal(staff.unreadCount, 1);
    assert.ok(staff.messages.find(row => row.id === firstId)!.readAt);
    assert.equal(staff.messages.find(row => row.id === later.id)!.readAt, null);
    const participantUnread = (await conversations("one", 1))[0].unreadCount;
    assert.equal(participantUnread, 1); // staff cannot mark its own response read
    assert.equal((await request("one", 1, "/101/read", { throughId: staffMessage.id })).status, 204);
    assert.equal((await conversations("one", 1))[0].unreadCount, 0);
    assert.equal((await request("staff", 1, "/101/read", { throughId: later.id })).status, 204);
    staff = (await conversations("staff", 1))[0];
    assert.equal(staff.unreadCount, 0);
    assert.equal((await send("staff", 1, 103)).status, 404); // no participant-initiated conversation
  });

  test("all-program announcements keep each program separate for staff", async () => {
    assert.equal((await send("one", 4, 101)).status, 201);
    assert.equal((await send("one", 4, 108)).status, 201);
    assert.equal((await send("four", 3, 104)).status, 201);
    assert.deepEqual((await conversations("one", 4)).map(row => row.applicationId).sort(), [101, 108]);
    assert.deepEqual((await conversations("staff", 4)).map(row => row.applicationId), [101]);
    for (const [announcement, app] of [[3, 104], [4, 108]]) {
      assert.equal((await send("staff", announcement, app)).status, 404);
      assert.equal((await request("staff", announcement, `/${app}/read`, { throughId: 99999 })).status, 404);
    }
    assert.equal((await request("staff", 3)).status, 404);
    assert.equal((await request("one", 3)).status, 200); // own second application
    assert.equal((await send("one", 3, 104)).status, 404); // not someone else's
    assert.equal((await request("three", 3)).status, 404);
    assert.equal((await request("staff", 4, "", undefined, { "x-empty-scope": "true" })).status, 404);
    assert.equal((await send("coordinator", 3, 104)).status, 201);
  });

  test("staff discover and answer a global announcement through Communications without acquiring global management permissions", async () => {
    const history = await fetch(`${origin}/api/communications`, { headers: { "x-test-role": "staff" } });
    assert.equal(history.status, 200);
    const cards = await history.json();
    const global = cards.find((card: { id: number }) => card.id === 4);
    assert.ok(global, "global announcement has a card in the assigned staff workspace");
    assert.equal(global.programId, null);
    assert.equal(global.email, undefined, "global delivery details stay Admin-only");
    assert.ok(!cards.some((card: { id: number }) => card.id === 3), "other program remains hidden");
    const threads = await conversations("staff", global.id);
    assert.deepEqual(threads.map(row => row.applicationId), [101]);
    assert.equal((await send("staff", global.id, 101, "Assigned team's global announcement response")).status, 201);
    const participantThreads = await conversations("one", global.id);
    assert.equal(participantThreads.find(row => row.applicationId === 101)!.messages.at(-1)!.body,
      "Assigned team's global announcement response");
    assert.equal(participantThreads.find(row => row.applicationId === 108)!.messages.length, 1);
    assert.equal((await fetch(`${origin}/api/communications/4`, {
      method: "DELETE", headers: { "x-test-role": "staff" },
    })).status, 404);
    assert.equal((await fetch(`${origin}/api/communications/4/email/retry`, {
      method: "POST", headers: { "x-test-role": "staff" },
    })).status, 404);
    const empty = await fetch(`${origin}/api/communications`, {
      headers: { "x-test-role": "staff", "x-empty-scope": "true" },
    });
    assert.deepEqual(await empty.json(), []);
  });

  test("scheduled, archived and superseded recording messages cannot be read or written", async () => {
    for (const [actor, announcement, app] of [
      ["one", 6, 101], ["one", 7, 101], ["archived", 5, 107],
      ["staff", 6, 101], ["staff", 7, 101], ["coordinator", 5, 107],
    ] as const) {
      assert.equal((await request(actor, announcement)).status, 404);
      assert.equal((await send(actor, announcement, app)).status, 404);
      assert.equal((await request(actor, announcement, `/${app}/read`, { throughId: 99999 })).status, 404);
    }
    assert.equal((await send("one", 8, 101)).status, 201);
  });

  test("acceptance, membership, ownership and archival changes revoke existing thread access", async () => {
    await client.query("UPDATE jusoor_applications SET status='withdrawn' WHERE id=101");
    assert.equal((await request("one", 1)).status, 404);
    assert.equal((await send("staff", 1, 101)).status, 404);
    assert.equal((await request("staff", 1, "/101/read", { throughId: 99999 })).status, 404);
    await client.query("UPDATE jusoor_applications SET status='accepted', clerk_user_id='replacement' WHERE id=101");
    assert.equal((await request("one", 1)).status, 404);
    await client.query("UPDATE jusoor_applications SET clerk_user_id='one', business_id=202 WHERE id=101");
    assert.equal((await request("one", 2)).status, 404);
    assert.equal((await send("staff", 2, 101)).status, 404);
    await client.query("DELETE FROM jusoor_participant_business_memberships WHERE application_id=106");
    assert.equal((await request("member", 2)).status, 404);
    await client.query("UPDATE jusoor_programs SET archived_at=now() WHERE id=11");
    for (const actor of ["one", "staff", "coordinator"]) {
      assert.equal((await request(actor, 1)).status, 404);
      assert.equal((await send(actor, 1, 101)).status, 404);
      assert.equal((await request(actor, 1, "/101/read", { throughId: 99999 })).status, 404);
    }
  });
});
