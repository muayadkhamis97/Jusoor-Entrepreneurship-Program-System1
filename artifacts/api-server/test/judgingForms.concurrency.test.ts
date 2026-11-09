import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import express from "express";

const postgresRaceTestUrl = process.env.TEST_DATABASE_URL;
const schemaName = `judging_link_race_${randomUUID().replaceAll("-", "")}`;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "isolated-judging-race-test-key";
if (postgresRaceTestUrl) {
  const isolatedUrl = new URL(postgresRaceTestUrl);
  isolatedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
  process.env.DATABASE_URL = isolatedUrl.toString();
} else {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
}

const { pool } = await import("@workspace/db");
const { default: staffRouter } = await import("../src/routes/judgingForms");
const { default: publicRouter } = await import("../src/routes/publicJudgingForms");

let server: Server | undefined;

test("PostgreSQL serializes judging submissions and link replacement at cutover", {
  skip: postgresRaceTestUrl
    ? false
    : "Set TEST_DATABASE_URL to a dedicated PostgreSQL test database to run this isolated-schema concurrency test.",
}, async () => {
  assert.ok(postgresRaceTestUrl);
  await pool.query(`CREATE SCHEMA "${schemaName}"`);
  const schemaCheck = await pool.query<{ schema: string | null }>("SELECT current_schema() AS schema");
  assert.equal(schemaCheck.rows[0]?.schema, schemaName, "test connections must use only the isolated schema");

  await pool.query(`
    CREATE TABLE jusoor_programs (
      id integer PRIMARY KEY,
      name text NOT NULL,
      archived_at timestamptz
    );
    CREATE TABLE jusoor_businesses (
      id integer PRIMARY KEY,
      program_id integer NOT NULL REFERENCES jusoor_programs(id),
      business_name text NOT NULL
    );
    CREATE TABLE jusoor_staff_members (
      id integer PRIMARY KEY,
      email text NOT NULL UNIQUE
    );
    INSERT INTO jusoor_programs (id, name) VALUES (11, 'Race test program');
    INSERT INTO jusoor_businesses (id, program_id, business_name) VALUES (201, 11, 'Race test business');
    INSERT INTO jusoor_staff_members (id, email) VALUES (7, 'staff@example.test');
  `);

  for (const migrationPath of [
    "../../../lib/db/migrations/20261022_public_judging_forms.sql",
    "../../../lib/db/migrations/20261023_judging_form_link_history.sql",
    "../../../lib/db/migrations/20261028_judging_form_status_history.sql",
    "../../../lib/db/migrations/20261109_deployment_rate_limits.sql",
  ]) {
    await pool.query(readFileSync(new URL(migrationPath, import.meta.url), "utf8"));
  }
  await pool.query(`
    CREATE TABLE jusoor_program_google_sheets_connections (
      program_id integer PRIMARY KEY,
      next_application_row integer NOT NULL DEFAULT 2,
      next_judging_response_row integer NOT NULL DEFAULT 2
    );
    CREATE TABLE jusoor_program_google_sheets_sync_events (
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
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (program_id, source_type, source_id)
    );
  `);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.get("x-test-role")) {
      res.locals.staff = {
        id: 7,
        email: "staff@example.test",
        role: "staff",
        programIds: [11],
      };
    }
    next();
  });
  app.use("/public/judging-form", publicRouter);
  app.use("/staff/judging-forms", staffRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const call = (path: string, method = "GET", body?: unknown, staff = false) => fetch(`${origin}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(staff ? { "x-test-role": "staff" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const staffCall = (suffix: string, method = "GET", body?: unknown) =>
    call(`/staff/judging-forms${suffix}`, method, body, true);
  const guestCall = (token: string, method = "GET", body?: unknown) =>
    call(`/public/judging-form${method === "POST" ? "/responses" : ""}?token=${token}`, method, body);

  const definition = {
    programId: 11,
    title: "Link cutover race",
    instructions: "Evaluate the selected business.",
    businessIds: [201],
    criteria: [{ id: "10000000-0000-4000-8000-000000000001", label: "Impact", description: "Evidence", maxScore: 10 }],
    questions: [{ id: "20000000-0000-4000-8000-000000000001", label: "Recommendation", required: true }],
  };
  const created = await staffCall("", "POST", definition);
  assert.equal(created.status, 201);
  const form = await created.json() as { id: number };
  const opened = await staffCall(`/${form.id}/status`, "PATCH", { status: "open" });
  assert.equal(opened.status, 200);
  const oldToken = (await opened.json() as { shareToken: string }).shareToken;
  const blocker = await pool.connect();
  let blockerInTransaction = false;

  async function waitForBlockedQuery(fragment: string) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const { rows } = await pool.query<{ waiting: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND wait_event_type = 'Lock'
             AND query ILIKE $1
         ) AS waiting`,
        [`%${fragment}%`],
      );
      if (rows[0]?.waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`PostgreSQL did not show a request waiting on ${fragment}.`);
  }

  const assessment = (judgeEmail: string, clientSubmissionId = randomUUID()) => ({
    businessId: 201,
    judgeName: "Guest Judge",
    judgeEmail,
    scores: [{ criterionId: definition.criteria[0]!.id, score: 8 }],
    answers: [{ questionId: definition.questions[0]!.id, text: "Strong evidence" }],
    clientSubmissionId,
  });

  try {
    // Hold the same advisory lock used by a submission. The guest request gets
    // the form share lock first; replacement must wait until its assessment commits.
    await blocker.query("BEGIN");
    blockerInTransaction = true;
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", ["program-google-sheets:11"]);
    const submitBeforeCutover = guestCall(oldToken, "POST", assessment("first@example.test"));
    await waitForBlockedQuery("pg_advisory_xact_lock");
    const replaceAfterSubmission = staffCall(`/${form.id}/rotate-link`, "POST");
    await waitForBlockedQuery("for update");
    await blocker.query("COMMIT");
    blockerInTransaction = false;

    const [firstSubmission, firstReplacement] = await Promise.all([submitBeforeCutover, replaceAfterSubmission]);
    assert.equal(firstSubmission.status, 200);
    assert.equal(firstReplacement.status, 200);
    const replacementToken = (await firstReplacement.json() as { shareToken: string }).shareToken;
    assert.notEqual(replacementToken, oldToken);
    assert.equal((await guestCall(oldToken)).status, 404, "the old token must stop resolving after replacement commits");

    // A second staff rotation queues before the next old-token submission.
    // Once the lock is released, replacement commits first and the stale token is rejected.
    await blocker.query("BEGIN");
    blockerInTransaction = true;
    await blocker.query("SELECT id FROM program_judging_forms WHERE id = $1 FOR UPDATE", [form.id]);
    const replaceBeforeSubmission = staffCall(`/${form.id}/rotate-link`, "POST");
    await waitForBlockedQuery("for update");
    const submitAfterCutover = guestCall(replacementToken, "POST", assessment("late@example.test"));
    await waitForBlockedQuery("for share");
    await blocker.query("COMMIT");
    blockerInTransaction = false;

    const [secondReplacement, lateSubmission] = await Promise.all([replaceBeforeSubmission, submitAfterCutover]);
    assert.equal(secondReplacement.status, 200);
    assert.equal(lateSubmission.status, 404,
      "a submission queued behind the replacement must not use the replaced token");

    const currentToken = (await secondReplacement.json() as { shareToken: string }).shareToken;
    const duplicate = await guestCall(currentToken, "POST", assessment("FIRST@example.test"));
    assert.equal(duplicate.status, 409, "per-business judge uniqueness must hold after link replacement");
    const retry = await guestCall(currentToken, "POST", assessment("first@example.test", "00000000-0000-4000-8000-000000000001"));
    assert.equal(retry.status, 409, "a judge cannot submit a second assessment for the same business");

    const responses = await staffCall(`/${form.id}/responses`);
    assert.equal(responses.status, 200);
    const saved = await responses.json() as { responses: Array<{ judgeEmail: string; scoreTotal: number; answers: Array<{ text: string }> }> };
    assert.equal(saved.responses.length, 1, "the losing old-token submission must not create another response");
    assert.equal(saved.responses[0]?.judgeEmail, "first@example.test");
    assert.equal(saved.responses[0]?.scoreTotal, 8);
    assert.deepEqual(saved.responses[0]?.answers, [{ questionId: definition.questions[0]!.id, text: "Strong evidence" }]);

    const linkHistory = await staffCall(`/${form.id}/link-history`);
    assert.equal(linkHistory.status, 200);
    assert.equal((await linkHistory.json() as unknown[]).length, 2);
  } finally {
    if (blockerInTransaction) await blocker.query("ROLLBACK").catch(() => undefined);
    blocker.release();
  }
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) =>
    server!.close((error) => error ? reject(error) : resolve()));
  if (postgresRaceTestUrl) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await pool.end();
  }
});
