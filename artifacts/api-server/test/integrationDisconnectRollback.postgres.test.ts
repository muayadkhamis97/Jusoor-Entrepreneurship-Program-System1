import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import express from "express";
import pinoHttp from "pino-http";

const postgresTestUrl = process.env.TEST_DATABASE_URL;
const schemaName = `disconnect_rollback_${randomUUID().replaceAll("-", "")}`;
const nativeFetch = globalThis.fetch;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "integration-disconnect-rollback-test-secret";
process.env.ZOOM_CLIENT_ID = "integration-disconnect-test-client";
process.env.ZOOM_CLIENT_SECRET = "integration-disconnect-test-secret";
process.env.JUSOOR_BOOTSTRAP_COORDINATOR_EMAIL = "coordinator@example.test";
if (postgresTestUrl) {
  const isolatedUrl = new URL(postgresTestUrl);
  isolatedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
  process.env.DATABASE_URL = isolatedUrl.toString();
} else {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
}

let server: Server | undefined;
let pool: typeof import("@workspace/db").pool | undefined;

after(async () => {
  globalThis.fetch = nativeFetch;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  if (pool) {
    try {
      await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
});

test("PostgreSQL rolls back all three disconnects when audit history cannot be saved", {
  skip: postgresTestUrl
    ? false
    : "Set TEST_DATABASE_URL to a dedicated PostgreSQL test database to run this isolated-schema route test.",
}, async () => {
  assert.ok(postgresTestUrl);
  const database = await import("@workspace/db");
  pool = database.pool;
  await pool.query(`CREATE SCHEMA "${schemaName}"`);
  const schemaCheck = await pool.query<{ schema: string | null }>("SELECT current_schema() AS schema");
  assert.equal(schemaCheck.rows[0]?.schema, schemaName, "the test must use only its isolated schema");

  await pool.query(`
    CREATE TABLE jusoor_staff_members (
      id serial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      clerk_user_id text UNIQUE,
      role text NOT NULL DEFAULT 'staff',
      status text NOT NULL DEFAULT 'invited',
      invitation_email_status text,
      booking_provider text NOT NULL DEFAULT 'calendly',
      calendly_booking_url text,
      calendly_follow_up_date date,
      calendly_follow_up_note text,
      calendly_follow_up_updated_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
      calendly_follow_up_updated_at timestamptz,
      google_calendar_account_email text,
      google_calendar_booking_url text,
      google_calendar_refresh_token_encrypted text,
      google_calendar_access_token_encrypted text,
      google_calendar_access_token_expires_at timestamptz,
      google_calendar_sync_token text,
      calendly_webhook_token_hash text UNIQUE,
      calendly_webhook_token_encrypted text,
      calendly_webhook_secret_encrypted text,
      calendly_webhook_subscription_uri text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE jusoor_programs (
      id serial PRIMARY KEY,
      name text NOT NULL,
      format text NOT NULL DEFAULT 'bootcamp',
      description text,
      start_date date,
      end_date date,
      application_deadline date,
      mentor_sessions_per_business integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'outreach',
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE jusoor_program_google_sheets_connections (
      program_id integer PRIMARY KEY REFERENCES jusoor_programs(id) ON DELETE CASCADE,
      spreadsheet_id text NOT NULL UNIQUE,
      spreadsheet_url text NOT NULL,
      spreadsheet_title text NOT NULL,
      next_application_row integer NOT NULL DEFAULT 2,
      next_judging_response_row integer NOT NULL DEFAULT 2,
      connected_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
      connected_at timestamptz NOT NULL DEFAULT now(),
      last_synced_at timestamptz,
      last_error text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE jusoor_zoom_connections (
      id serial PRIMARY KEY,
      provider text NOT NULL UNIQUE DEFAULT 'zoom',
      connected_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
      encrypted_access_token text NOT NULL,
      encrypted_refresh_token text NOT NULL,
      access_token_expires_at timestamptz NOT NULL,
      connected_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE jusoor_integration_disconnect_audit_events (
      id serial PRIMARY KEY,
      integration_type text NOT NULL,
      initiator_type text NOT NULL DEFAULT 'admin',
      actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
      actor_email text NOT NULL,
      affected_staff_id integer,
      affected_account_email text,
      program_id integer,
      program_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION reject_disconnect_audit_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'simulated audit persistence failure';
      END;
      $$;
    CREATE TRIGGER reject_disconnect_audit_insert
      BEFORE INSERT ON jusoor_integration_disconnect_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_disconnect_audit_insert();
    INSERT INTO jusoor_staff_members (
      id, email, clerk_user_id, role, status, booking_provider,
      google_calendar_account_email
    ) VALUES
      (7, 'coordinator@example.test', 'test-coordinator', 'coordinator', 'active', 'calendly', NULL),
      (27, 'mentor@example.test', NULL, 'mentor', 'active', 'google_calendar', 'calendar@example.test');
    INSERT INTO jusoor_programs (id, name) VALUES (19, 'Rollback Test Program');
    INSERT INTO jusoor_program_google_sheets_connections (
      program_id, spreadsheet_id, spreadsheet_url, spreadsheet_title
    ) VALUES (19, 'sheet-test-id', 'https://docs.google.test/sheet-test-id', 'Rollback Test Workbook');
    INSERT INTO jusoor_zoom_connections (
      provider, connected_by_staff_id, encrypted_access_token,
      encrypted_refresh_token, access_token_expires_at
    ) VALUES (
      'zoom', 7, 'initially-encrypted-access-token',
      'initially-encrypted-refresh-token', now() + interval '1 hour'
    );
    SELECT setval(pg_get_serial_sequence('jusoor_staff_members', 'id'), 27, true);
    SELECT setval(pg_get_serial_sequence('jusoor_programs', 'id'), 19, true);
  `);

  const { default: staffRouter } = await import("../src/routes/staff");
  const { default: sheetsRouter } = await import("../src/routes/googleSheets");
  const { default: zoomRouter } = await import("../src/routes/zoom");
  const { encryptGoogleCalendarToken } = await import("../src/lib/googleCalendarSync");
  const { saveZoomConnection } = await import("../src/lib/zoom");
  const calendarRefreshToken = encryptGoogleCalendarToken("integration-test-calendar-refresh-token");
  await pool.query(
    "UPDATE jusoor_staff_members SET google_calendar_refresh_token_encrypted = $1 WHERE id = 27",
    [calendarRefreshToken],
  );
  await saveZoomConnection({
    accessToken: "integration-test-access-token",
    refreshToken: "integration-test-refresh-token",
    expiresIn: 3600,
  }, 7);

  const app = express();
  app.use(express.json());
  app.use(pinoHttp());
  app.use((req, res, next) => {
    const auth = Object.assign(
      () => ({ userId: "test-coordinator", tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, { auth });
    res.locals.staff = {
      id: 7,
      email: "coordinator@example.test",
      role: "coordinator",
      primaryRole: "coordinator",
      status: "active",
      invitationEmailStatus: null,
      bookingProvider: "calendly",
      calendlyBookingUrl: null,
      googleCalendarAccountEmail: null,
      googleCalendarBookingUrl: null,
      createdAt: new Date(),
      programIds: [],
      programRoles: [],
    };
    next();
  });
  app.use("/api", staffRouter);
  app.use("/api/staff/google-sheets", sheetsRouter);
  app.use("/api/zoom", zoomRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;
  const calendarResponse = await nativeFetch(`${origin}/api/staff/27/google-calendar-connection`, {
    method: "DELETE",
  });
  assert.equal(calendarResponse.status, 500);
  const { rows: calendarRows } = await pool.query<{
    google_calendar_account_email: string | null;
    google_calendar_refresh_token_encrypted: string | null;
    booking_provider: string;
  }>(`
    SELECT google_calendar_account_email, google_calendar_refresh_token_encrypted, booking_provider
    FROM jusoor_staff_members WHERE id = 27
  `);
  assert.deepEqual(calendarRows, [{
    google_calendar_account_email: "calendar@example.test",
    google_calendar_refresh_token_encrypted: calendarRefreshToken,
    booking_provider: "google_calendar",
  }]);
  assert.deepEqual((await pool.query(
    "SELECT id FROM jusoor_integration_disconnect_audit_events WHERE integration_type = 'mentor_google_calendar'",
  )).rows, []);

  const sheetsResponse = await nativeFetch(`${origin}/api/staff/google-sheets/19`, { method: "DELETE" });
  assert.equal(sheetsResponse.status, 503);
  assert.deepEqual((await pool.query(
    "SELECT program_id FROM jusoor_program_google_sheets_connections WHERE program_id = 19",
  )).rows, [{ program_id: 19 }]);
  assert.deepEqual((await pool.query(
    "SELECT id FROM jusoor_integration_disconnect_audit_events WHERE integration_type = 'program_google_sheets'",
  )).rows, []);

  globalThis.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;
  const zoomResponse = await nativeFetch(`${origin}/api/zoom/disconnect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(zoomResponse.status, 502);
  assert.deepEqual((await pool.query(
    "SELECT provider FROM jusoor_zoom_connections WHERE provider = 'zoom'",
  )).rows, [{ provider: "zoom" }]);
  assert.deepEqual((await pool.query(
    "SELECT id FROM jusoor_integration_disconnect_audit_events WHERE integration_type = 'shared_zoom'",
  )).rows, []);
  assert.deepEqual((await pool.query("SELECT id FROM jusoor_integration_disconnect_audit_events")).rows, []);
});
