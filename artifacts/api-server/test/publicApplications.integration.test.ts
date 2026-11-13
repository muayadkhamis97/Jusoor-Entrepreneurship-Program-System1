import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
const schema = await import("@workspace/db");
const { db, pool } = schema;
const { default: publicApplicationsRouter } = await import("../src/routes/publicApplications");

const tooManyApplicationsError = "Too many applications from this connection. Please wait a few minutes and try again.";
after(async () => {
  await pool.end();
});

test("public application abuse protection uses isolated PostgreSQL tables", {
  skip: !databaseAvailable && "Set TEST_DATABASE_URL to a disposable PostgreSQL database.",
  timeout: 30_000,
}, async t => {
  const connection = await pool.connect();
  const methods = ["select", "insert", "update", "delete"] as const;
  const originals = methods.map(name => [name, Object.getOwnPropertyDescriptor(db, name)] as const);
  let server: Server | undefined;
  try {
    await connection.query("BEGIN");
    await connection.query(`
      CREATE TEMP TABLE jusoor_rate_limit_counters (
        key_hash text PRIMARY KEY,
        window_started_at timestamptz NOT NULL,
        hit_count integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TEMP TABLE jusoor_applications (
        id serial PRIMARY KEY,
        program_id integer NOT NULL,
        founder_name text NOT NULL,
        email text NOT NULL,
        phone text,
        business_name text NOT NULL,
        industry text,
        website text,
        summary text NOT NULL,
        support_needs text NOT NULL,
        status text NOT NULL DEFAULT 'submitted',
        clerk_user_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TEMP TABLE jusoor_program_google_sheets_sync_events (
        id serial PRIMARY KEY,
        program_id integer NOT NULL,
        source_type text NOT NULL,
        source_id integer NOT NULL,
        sheet_row integer NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        revision integer NOT NULL DEFAULT 1,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        claimed_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      SET search_path TO pg_temp;
    `);
    const isolated = drizzle(connection, { schema });
    for (const name of methods) {
      Object.defineProperty(db, name, {
        configurable: true,
        value: isolated[name].bind(isolated),
      });
    }

    const infoLogs: unknown[][] = [];
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use((req, _res, next) => {
      req.log = {
        info: (...args: unknown[]) => { infoLogs.push(args); },
        error: () => {},
      } as unknown as typeof req.log;
      next();
    });
    app.use("/api", publicApplicationsRouter);
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/api`;
    const post = (body: unknown, ip: string) => fetch(`${origin}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });

    await t.test("the 21st request from one IP is rate limited with Retry-After", async () => {
      const unique = `ip-${randomUUID()}`;
      for (let index = 0; index < 20; index++) {
        const response = await post({ email: `app-${index}-${unique}@example.test` }, "198.51.100.77");
        assert.equal(response.status, 400, `Request ${index + 1} should reach normal body validation.`);
      }
      const limited = await post({ email: `app-21-${unique}@example.test` }, "198.51.100.77");
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
      assert.deepEqual(await limited.json(), { error: tooManyApplicationsError });
    });

    await t.test("the sixth request for a case-insensitive email is rate limited", async () => {
      const email = `shared-${randomUUID()}@example.test`;
      for (let index = 0; index < 5; index++) {
        const addressVariant = index % 2 === 0 ? email.toUpperCase() : email;
        const response = await post({ email: addressVariant }, `198.51.100.${index + 1}`);
        assert.equal(response.status, 400, `Request ${index + 1} should reach normal body validation.`);
      }
      const limited = await post({ email: email.toUpperCase() }, "198.51.100.6");
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
      assert.deepEqual(await limited.json(), { error: tooManyApplicationsError });
    });

    await t.test("a filled honeypot returns success without application or Sheets rows", async () => {
      const email = `trap-${randomUUID()}@example.test`;
      const response = await post({
        programId: 41,
        founderName: "Trap Applicant",
        email,
        businessName: "Sample Venture",
        summary: "A sample venture description long enough to pass validation.",
        supportNeeds: "Mentorship and market access.",
        contactNote: "Please contact me",
      }, "198.51.100.90");
      assert.equal(response.status, 201);
      const receipt = await response.json();
      assert.equal(receipt.status, "submitted");
      assert.ok(receipt.createdAt);
      assert.equal(Number((await connection.query("SELECT count(*) AS count FROM pg_temp.jusoor_applications")).rows[0].count), 0);
      assert.equal(Number((await connection.query("SELECT count(*) AS count FROM pg_temp.jusoor_program_google_sheets_sync_events")).rows[0].count), 0);
      assert.equal(infoLogs.length, 1);
      assert.equal(JSON.stringify(infoLogs).includes(email), false);
      assert.doesNotMatch(JSON.stringify(infoLogs), /Trap Applicant|Sample Venture|Please contact me/);
    });

    await t.test("an oversized field is rejected before program lookup", async () => {
      const response = await post({
        programId: 41,
        founderName: "N".repeat(121),
        email: `oversized-${randomUUID()}@example.test`,
        businessName: "Sample Venture",
        summary: "A sample venture description long enough to pass validation.",
        supportNeeds: "Mentorship and market access.",
      }, "198.51.100.91");
      assert.equal(response.status, 400);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(db, name, descriptor);
      else Reflect.deleteProperty(db, name);
    }
    await connection.query("ROLLBACK");
    connection.release();
  }
});
