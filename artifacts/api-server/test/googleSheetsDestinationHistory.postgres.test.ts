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
        new_spreadsheet_id, new_spreadsheet_title, new_sheet_mappings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [program.rows[0]!.id, "Spring Program", staff.rows[0]!.id, actorEmail, "sheet_retained_1234567890", "Spring workbook", JSON.stringify(mappings)],
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

    const response = await fetch(endpoint, { headers: { "x-test-role": "coordinator" } });
    assert.equal(response.status, 200, await response.clone().text());
    const history = await response.json() as Record<string, unknown>[];
    assert.equal(history.length, 1);
    assert.equal(history[0]?.actorStaffId, null);
    assert.equal(history[0]?.actorEmail, actorEmail);
    assert.equal(history[0]?.newSpreadsheetId, "sheet_retained_1234567890");
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
