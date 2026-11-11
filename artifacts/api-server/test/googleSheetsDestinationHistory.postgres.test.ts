import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import express from "express";

const postgresTestUrl = process.env.TEST_DATABASE_URL;
const schemaName = `sheets_history_route_${randomUUID().replaceAll("-", "")}`;

test("coordinators can read destination history after its staff account is removed", {
  skip: !postgresTestUrl && "Set TEST_DATABASE_URL to a disposable PostgreSQL database.",
  timeout: 30_000,
}, async () => {
  assert.ok(postgresTestUrl);
  const requireFromDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
  const { Client } = requireFromDb("pg") as {
    Client: new (options: { connectionString: string }) => {
      connect(): Promise<void>;
      query(query: string): Promise<unknown>;
      end(): Promise<void>;
    };
  };
  const adminClient = new Client({ connectionString: postgresTestUrl });
  let pool: typeof import("@workspace/db").pool | undefined;
  let server: Server | undefined;
  let schemaCreated = false;

  try {
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;

    const isolatedUrl = new URL(postgresTestUrl);
    isolatedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
    process.env.DATABASE_URL = isolatedUrl.toString();
    process.env.NODE_ENV = "test";

    const database = await import("@workspace/db");
    pool = database.pool;
    const schemaCheck = await pool.query<{ schema: string | null }>("SELECT current_schema() AS schema");
    assert.equal(schemaCheck.rows[0]?.schema, schemaName);

    await pool.query(`
      CREATE TABLE jusoor_staff_members (
        id serial PRIMARY KEY,
        email text NOT NULL UNIQUE
      );
      CREATE TABLE jusoor_programs (
        id serial PRIMARY KEY,
        name text NOT NULL
      );
    `);
    const migration = await readFile(
      new URL("../../../lib/db/migrations/20261111_google_sheets_destination_history.sql", import.meta.url),
      "utf8",
    );
    await pool.query(migration);

    const program = await pool.query<{ id: number }>(
      "INSERT INTO jusoor_programs (name) VALUES ($1) RETURNING id",
      ["Spring Program"],
    );
    const actorEmail = "removed-staff@example.test";
    const staff = await pool.query<{ id: number }>(
      "INSERT INTO jusoor_staff_members (email) VALUES ($1) RETURNING id",
      [actorEmail],
    );
    const mappings = {
      applications: "Applications",
      judgingResponses: "Judging responses",
      businessTeam: "Businesses and teams",
      operations: "Programs sessions attendance",
      mentoringGrants: "Mentor support grants",
      chats: "Staff and participant chats",
    };
    await pool.query(
      `INSERT INTO jusoor_program_google_sheets_destination_history (
        program_id, program_name, actor_staff_id, actor_email,
        new_spreadsheet_id, new_spreadsheet_title, new_sheet_mappings, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [program.rows[0]!.id, "Spring Program", staff.rows[0]!.id, actorEmail, "sheet_retained_1234567890", "Spring workbook", JSON.stringify(mappings), "2026-11-11T10:30:00.123456Z"],
    );
    await pool.query(
      `INSERT INTO jusoor_program_google_sheets_destination_history (
        program_id, program_name, actor_staff_id, actor_email,
        new_spreadsheet_id, new_spreadsheet_title, new_sheet_mappings, created_at
      ) VALUES
        ($1, $2, $3, $4, $5, $6, $7::jsonb, $8),
        ($1, $2, $3, $4, $9, $6, $7::jsonb, $8)`,
      [program.rows[0]!.id, "Spring Program", staff.rows[0]!.id, actorEmail, "sheet_retained_1234567891", "Spring workbook", JSON.stringify(mappings), "2026-11-11T10:30:00.123456Z", "sheet_retained_1234567892"],
    );
    await pool.query("DELETE FROM jusoor_staff_members WHERE id = $1", [staff.rows[0]!.id]);

    const { default: googleSheetsRouter } = await import("../src/routes/googleSheets");
    const app = express();
    app.use((req, res, next) => {
      const role = req.get("x-test-role") === "coordinator" ? "coordinator" : "staff";
      res.locals.staff = { id: 7, email: "requester@example.test", role };
      Object.assign(req, { log: { error: () => undefined } });
      next();
    });
    app.use("/api/staff/google-sheets", googleSheetsRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/api/staff/google-sheets/${program.rows[0]!.id}/destination-history`;
    const denied = await fetch(endpoint);
    assert.equal(denied.status, 403, "non-coordinators must not read destination history");

    const response = await fetch(`${endpoint}?limit=2`, { headers: { "x-test-role": "coordinator" } });
    assert.equal(response.status, 200, await response.clone().text());
    const firstPage = await response.json() as {
      items: Record<string, unknown>[];
      nextCursor: string | null;
    };
    assert.deepEqual(firstPage.items.map((item) => item.id), [3, 2],
      "same-timestamp events must use descending IDs as a deterministic tie-breaker");
    assert.equal(firstPage.items[0]?.actorStaffId, null);
    assert.equal(firstPage.items[0]?.actorEmail, actorEmail);
    assert.equal(firstPage.items[0]?.newSpreadsheetId, "sheet_retained_1234567892");
    assert.ok(firstPage.nextCursor);

    const secondPageResponse = await fetch(
      `${endpoint}?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      { headers: { "x-test-role": "coordinator" } },
    );
    assert.equal(secondPageResponse.status, 200, await secondPageResponse.clone().text());
    const secondPage = await secondPageResponse.json() as {
      items: Record<string, unknown>[];
      nextCursor: string | null;
    };
    assert.deepEqual(secondPage.items.map((item) => item.id), [1],
      "the microsecond-precision cursor must not skip the final tied event");
    assert.equal(secondPage.items[0]?.newSpreadsheetId, "sheet_retained_1234567890");
    assert.equal(secondPage.nextCursor, null);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    if (pool) await pool.end();
    if (schemaCreated) await adminClient.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminClient.end();
  }
});
