import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
const { db, pool } = await import("@workspace/db");
const { createChatRouter } = await import("../src/routes/chat");
const { targetForThread } = await import("../src/lib/chatAccess");

test("chat targets require matching program, kind and identity together", () => {
  const targets = [{ programId: 11, kind: "private" as const, targetId: 101, programName: "Program", name: "Founder" }];
  assert.ok(targetForThread(targets, { programId: 11, kind: "private", participantId: 101, businessId: null }));
  assert.equal(targetForThread(targets, { programId: 22, kind: "private", participantId: 101, businessId: null }), undefined);
  assert.equal(targetForThread(targets, { programId: 11, kind: "private", participantId: 102, businessId: null }), undefined);
  assert.equal(targetForThread(targets, { programId: 11, kind: "business", participantId: null, businessId: 101 }), undefined);
});

describe("chat API with isolated PostgreSQL tables", { skip: !databaseAvailable }, () => {
  let client: Awaited<ReturnType<typeof pool.connect>>;
  let server: Server;
  let origin: string;
  let privateId: number;
  let businessId: number;
  const originals = ["select", "selectDistinct", "insert", "update", "transaction"].map(key => [key, Object.getOwnPropertyDescriptor(db, key)] as const);

  before(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    // PostgreSQL resolves these temporary tables before public tables. All
    // synthetic records and new chat tables disappear on rollback, without
    // touching real program records or public sequences.
    await client.query(`
      CREATE TEMP TABLE jusoor_programs (id integer PRIMARY KEY, name text NOT NULL, archived_at timestamptz);
      CREATE TEMP TABLE jusoor_businesses (id integer PRIMARY KEY, program_id integer, business_name text);
      CREATE TEMP TABLE jusoor_applications (id integer PRIMARY KEY, program_id integer, business_id integer, founder_name text, clerk_user_id text, status text);
      CREATE TEMP TABLE jusoor_participant_business_memberships (id integer PRIMARY KEY, application_id integer, business_id integer);
      CREATE TEMP TABLE jusoor_staff_members (id integer PRIMARY KEY, clerk_user_id text);
      CREATE TEMP TABLE jusoor_user_profiles (user_id text PRIMARY KEY, display_name text);
      INSERT INTO jusoor_programs VALUES (11, 'Program one', NULL), (22, 'Program two', NULL), (33, 'Archived', now());
      INSERT INTO jusoor_businesses VALUES (201,11,'Shared team'), (202,11,'Other team'), (203,22,'Other program'), (204,33,'Archived team');
      INSERT INTO jusoor_applications VALUES
        (101,11,201,'Founder One','user_one','accepted'),
        (102,11,201,'Founder Two','user_two','accepted'),
        (103,11,202,'Founder Three','user_three','accepted'),
        (104,22,203,'Founder Four','user_four','accepted'),
        (105,11,201,'Pending Founder','user_pending','submitted'),
        (106,11,NULL,'Invited Member','user_member','accepted'),
        (107,33,204,'Archived Founder','user_archived','accepted');
      INSERT INTO jusoor_participant_business_memberships VALUES (1,106,201);
      INSERT INTO jusoor_staff_members VALUES (7,'staff_seven');
      INSERT INTO jusoor_user_profiles VALUES ('staff_seven','Program Staff');
    `);
    const migration = readFileSync(new URL("../../../lib/db/migrations/20261022_program_chat.sql", import.meta.url), "utf8")
      .replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "").replaceAll("CREATE TABLE ", "CREATE TEMP TABLE ");
    await client.query(migration);
    const isolated = drizzle(client);
    for (const key of ["select", "selectDistinct", "insert", "update"] as const) {
      Object.defineProperty(db, key, { configurable: true, value: isolated[key].bind(isolated) });
    }
    Object.defineProperty(db, "transaction", { configurable: true, value: async (callback: (tx: typeof isolated) => Promise<unknown>) => {
      await client.query("SAVEPOINT chat_send");
      try {
        const result = await callback(isolated);
        await client.query("RELEASE SAVEPOINT chat_send");
        return result;
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT chat_send");
        throw error;
      }
    } });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const role = req.get("x-test-role");
      const userId = req.get("x-test-user");
      if (role) res.locals.staff = { id: 7, role, programIds: req.get("x-empty-scope") ? [] : [11] };
      if (userId) res.locals.participant = { userId, email: `${userId}@example.test` };
      next();
    });
    app.use("/staff/chat", createChatRouter("staff"));
    app.use("/participant/chat", createChatRouter("participant"));
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
  });
  after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(db, key, descriptor);
      else Reflect.deleteProperty(db, key);
    }
    if (client) { await client.query("ROLLBACK"); client.release(); }
    await pool.end();
  });

  function request(actor: string, path: string, method = "GET", body?: unknown) {
    const staff = ["staff", "coordinator", "trainer", "mentor", "judge", "anonymous"].includes(actor);
    return fetch(`${origin}/${staff ? "staff" : "participant"}/chat${path}`, {
      method, headers: { "content-type": "application/json", ...(actor === "anonymous" ? {} : staff ? { "x-test-role": actor } : { "x-test-user": actor }) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function open(actor: string, kind: string, targetId: number, programId = 11) {
    return request(actor, "/threads", "POST", { kind, targetId, programId });
  }
  function send(actor: string, id: number, body: string, clientMessageId = randomUUID(), extra = {}) {
    return request(actor, `/threads/${id}/messages`, "POST", { body, clientMessageId, ...extra });
  }

  test("targets exclude unassigned, pending and archived programs; membership links grant business chat only", async () => {
    const staff = await (await request("staff", "/targets")).json();
    assert.ok(staff.every((target: any) => target.programId === 11));
    assert.ok(!staff.some((target: any) => target.targetId === 105));
    const member = await (await request("user_member", "/targets")).json();
    assert.deepEqual(member.map((target: any) => [target.kind, target.targetId]), [["private", 106], ["business", 201]]);
    assert.deepEqual(await (await request("user_pending", "/targets")).json(), []);
    assert.deepEqual(await (await request("user_archived", "/targets")).json(), []);
    assert.equal((await open("staff", "business", 203, 22)).status, 403);
    assert.equal((await open("user_one", "business", 202)).status, 403);
    assert.equal((await open("user_one", "private", 102)).status, 403);
    assert.equal((await open("user_one", "business", 201, 22)).status, 403);
    assert.equal((await open("coordinator", "business", 203, 22)).status, 200);
  });
  test("private conversations are shared with authorized staff, never other team members", async () => {
    const opened = await open("user_one", "private", 101);
    assert.equal(opened.status, 200);
    privateId = (await opened.json()).id;
    assert.equal((await (await open("staff", "private", 101)).json()).id, privateId, "opening again reuses the existing thread");
    const response = await send("staff", privateId, "Private advice");
    assert.equal(response.status, 201);
    assert.equal((await request("user_one", `/threads/${privateId}/messages`)).status, 200);
    for (const actor of ["user_two", "user_three", "user_four", "user_pending"]) {
      assert.equal((await request(actor, `/threads/${privateId}/messages`)).status, 404);
      assert.equal((await send(actor, privateId, "Forbidden reply")).status, 404);
      assert.equal((await request(actor, `/threads/${privateId}/read`, "POST", { lastReadMessageId: 1 })).status, 404);
    }
  });
  test("business-team chat supports staff and participant replies with individual unread positions", async () => {
    businessId = (await (await open("staff", "business", 201)).json()).id;
    const firstResponse = await send("staff", businessId, "Welcome team");
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    for (const actor of ["user_one", "user_two", "user_member"]) {
      const threads = await (await request(actor, "/threads")).json();
      assert.equal(threads.find((thread: any) => thread.id === businessId).unreadCount, 1);
      assert.equal(threads.find((thread: any) => thread.id === businessId).lastMessage, "Welcome team");
      assert.ok(threads.find((thread: any) => thread.id === businessId).lastMessageAt);
    }
    assert.equal((await request("user_one", `/threads/${businessId}/read`, "POST", { lastReadMessageId: first.id })).status, 200);
    assert.equal((await (await request("user_one", "/threads")).json()).find((thread: any) => thread.id === businessId).unreadCount, 0);
    assert.equal((await (await request("user_two", "/threads")).json()).find((thread: any) => thread.id === businessId).unreadCount, 1);
    const reply = await send("user_one", businessId, "Our reply", randomUUID(), { senderName: "Spoofed", senderRole: "staff", senderKey: "staff:7" });
    assert.equal(reply.status, 201);
    const result = await reply.json();
    assert.equal(result.senderName, "Founder One");
    assert.equal(result.senderRole, "participant");
    assert.equal(result.isOwn, true);
    const staffPage = await (await request("staff", `/threads/${businessId}/messages`)).json();
    assert.equal(staffPage.messages.at(-1).isOwn, false);
    assert.equal((await request("user_three", `/threads/${businessId}/messages`)).status, 404);
    assert.equal((await request("user_four", `/threads/${businessId}/messages`)).status, 404);
    assert.equal((await request("user_one", `/threads/${businessId}/read`, "POST", { lastReadMessageId: first.id - 1 })).status, 404, "cannot mark a message from a different thread");
  });
  test("send retries are idempotent and input is validated without accepting sender spoofing", async () => {
    const key = randomUUID();
    const first = await (await send("user_two", businessId, "Same message", key)).json();
    const retry = await (await send("user_two", businessId, "Same message", key)).json();
    assert.equal(retry.id, first.id);
    assert.equal((await send("user_two", businessId, "Changed message", key)).status, 409);
    assert.equal((await send("user_two", businessId, "   ")).status, 400);
    assert.equal((await send("user_two", businessId, "a".repeat(4001))).status, 400);
    assert.equal((await send("user_two", businessId, "Message", "invalid")).status, 400);
    const count = await client.query("SELECT count(*)::integer AS count FROM program_chat_messages WHERE client_message_id = $1", [key]);
    assert.equal(count.rows[0].count, 1);
  });
  test("message cursor returns older messages without overlap or silent truncation", async () => {
    await client.query(`INSERT INTO program_chat_messages(thread_id,sender_key,sender_name,sender_role,body,client_message_id)
      SELECT $1,'staff:7','Program Staff','staff','History ' || n,md5('chat-history-' || n)::uuid FROM generate_series(1,55) n`, [businessId]);
    const recent = await (await request("user_one", `/threads/${businessId}/messages`)).json();
    assert.equal(recent.messages.length, 50);
    assert.ok(recent.nextBeforeId);
    const older = await (await request("user_one", `/threads/${businessId}/messages?beforeId=${recent.nextBeforeId}`)).json();
    assert.ok(older.messages.length > 0);
    assert.ok(older.messages.every((message: any) => message.id < recent.nextBeforeId));
    assert.equal(older.nextBeforeId, null);
    assert.equal((await request("user_one", `/threads/${businessId}/messages?beforeId=1.5`)).status, 400);
  });
  test("revoked memberships and specialist roles cannot keep reading existing conversations", async () => {
    await client.query("UPDATE jusoor_applications SET status = 'withdrawn' WHERE id = 102");
    assert.equal((await request("user_two", `/threads/${businessId}/messages`)).status, 404);
    assert.equal((await send("user_two", businessId, "After revocation")).status, 404);
    for (const role of ["trainer", "mentor", "judge", "anonymous"]) {
      assert.equal((await request(role, "/threads")).status, role === "anonymous" ? 401 : 403);
    }
  });
});
