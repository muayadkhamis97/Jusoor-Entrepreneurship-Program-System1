import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import express from "express";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.SESSION_SECRET = "isolated-judging-test-key-not-a-real-secret";
process.env.NODE_ENV = "test";
const { db, pool } = await import("@workspace/db");
const { default: staffRouter } = await import("../src/routes/judgingForms");
const { default: publicRouter } = await import("../src/routes/publicJudgingForms");
const { newJudgingToken, readJudgingToken, judgingTokenHash } = await import("../src/lib/judgingForms");
const criterionId = "10000000-0000-4000-8000-000000000001";
const questionId = "20000000-0000-4000-8000-000000000001";
const optionalId = "20000000-0000-4000-8000-000000000002";
const definition = {
  programId: 11, title: "Demo assessment", instructions: "Assess each selected business.",
  businessIds: [201, 202], criteria: [{ id: criterionId, label: "Impact", description: "Evidence of impact", maxScore: 10 }],
  questions: [{ id: questionId, label: "Main recommendation", required: true }, { id: optionalId, label: "Other notes", required: false }],
};
test("judging share tokens have entropy, authenticated encryption and a separate lookup hash", () => {
  const token = newJudgingToken();
  const clear = readJudgingToken(token.encrypted)!;
  assert.match(clear, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(judgingTokenHash(clear), token.hash);
  assert.ok(!token.encrypted.includes(clear));
  assert.equal(readJudgingToken(`${token.encrypted.slice(0, 20)}bad`), null);
  assert.notEqual(newJudgingToken().hash, token.hash);
});

describe("public judging forms with isolated PostgreSQL tables", { skip: !databaseAvailable }, () => {
  let client: Awaited<ReturnType<typeof pool.connect>>;
  let server: Server;
  let origin: string;
  let formId: number;
  let foreignId: number;
  let token: string;
  const submissionId = randomUUID();
  const assessment = {
    businessId: 201, judgeName: " Guest Judge ", judgeEmail: "Judge@EXAMPLE.test",
    scores: [{ criterionId, score: 0 }], answers: [{ questionId, text: " Useful next steps " }],
    clientSubmissionId: submissionId,
  };
  const originals = ["select", "insert", "update", "delete", "transaction"].map(key => [key, Object.getOwnPropertyDescriptor(db, key)] as const);
  before(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE jusoor_programs (id integer PRIMARY KEY, name text NOT NULL, archived_at timestamptz);
      CREATE TEMP TABLE jusoor_businesses (id integer PRIMARY KEY, program_id integer, business_name text);
      CREATE TEMP TABLE jusoor_staff_members (id integer PRIMARY KEY);
      INSERT INTO jusoor_programs VALUES (11,'Assigned program',NULL),(22,'Other program',NULL),(33,'Archived',now());
      INSERT INTO jusoor_businesses VALUES (201,11,'Business one'),(202,11,'Business two'),(203,22,'Other business'),(204,33,'Archived business');
      INSERT INTO jusoor_staff_members VALUES (7);
    `);
    const migration = readFileSync(new URL("../../../lib/db/migrations/20261022_public_judging_forms.sql", import.meta.url), "utf8")
      .replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "").replaceAll("CREATE TABLE ", "CREATE TEMP TABLE ");
    await client.query(migration);
    const isolated = drizzle(client);
    for (const key of ["select", "insert", "update", "delete"] as const) Object.defineProperty(db, key, { configurable: true, value: isolated[key].bind(isolated) });
    Object.defineProperty(db, "transaction", { configurable: true, value: async (callback: (tx: typeof isolated) => Promise<unknown>) => {
      await client.query("SAVEPOINT judging_request");
      try {
        const result = await callback(isolated);
        await client.query("RELEASE SAVEPOINT judging_request");
        return result;
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT judging_request");
        throw error;
      }
    } });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const role = req.get("x-test-role");
      if (role) res.locals.staff = { id: 7, role, programIds: [11] };
      next();
    });
    app.use("/public/judging-form", publicRouter);
    app.use("/staff/judging-forms", staffRouter);
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
  function request(path: string, method = "GET", body?: unknown, role?: string) {
    return fetch(`${origin}${path}`, { method, headers: { "content-type": "application/json", ...(role ? { "x-test-role": role } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  const staff = (suffix = "", method = "GET", body?: unknown, role = "staff") => request(`/staff/judging-forms${suffix}`, method, body, role);
  const guest = (method = "GET", body?: unknown, link = token) => request(`/public/judging-form${method === "POST" ? "/responses" : ""}?token=${link}`, method, body);

  test("staff can create only in assigned active programs and must define valid selected businesses and fields", async () => {
    for (const input of [
      { ...definition, businessIds: [203] }, { ...definition, businessIds: [201, 201] },
      { ...definition, title: "  " }, { ...definition, criteria: [], questions: [] },
      { ...definition, criteria: [...definition.criteria, ...definition.criteria] },
      { ...definition, criteria: [{ ...definition.criteria[0], maxScore: 1.5 }] },
    ]) assert.equal((await staff("", "POST", input)).status, 400);
    assert.equal((await staff("", "POST", { ...definition, programId: 22, businessIds: [203] })).status, 403);
    assert.equal((await staff("", "POST", { ...definition, programId: 33, businessIds: [204] })).status, 403);
    const foreign = await staff("", "POST", { ...definition, programId: 22, businessIds: [203] }, "coordinator");
    assert.equal(foreign.status, 201);
    foreignId = (await foreign.json()).id;
    const response = await staff("", "POST", definition);
    assert.equal(response.status, 201);
    const form = await response.json();
    formId = form.id;
    assert.equal(form.status, "draft");
    assert.equal(form.shareToken, null);
    assert.equal(form.responseCount, 0);
    const stored = await client.query("SELECT share_token_enc FROM program_judging_forms WHERE id=$1", [formId]);
    token = readJudgingToken(stored.rows[0].share_token_enc)!;
    assert.equal((await staff(`/${formId}/rotate-link`, "POST")).status, 409, "draft links cannot be replaced before publishing");
    assert.equal((await guest()).status, 404, "drafts are not public even if their token is known");
    assert.equal((await staff(`/${formId}`, "PATCH", { ...definition, title: "Revised assessment" })).status, 200);
    assert.equal((await staff(`/${formId}`, "PATCH", { ...definition, programId: 22 })).status, 400);
  });
  test("opening publishes selected businesses without sign-in, but never judge contacts or responses", async () => {
    const opened = await staff(`/${formId}/status`, "PATCH", { status: "open" });
    assert.equal(opened.status, 200);
    assert.equal((await opened.json()).shareToken, token);
    const publicResponse = await guest();
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get("cache-control"), "no-store");
    const form = await publicResponse.json();
    assert.deepEqual(form.businesses.map((business: any) => business.id), [201, 202]);
    for (const field of ["responses", "judgeEmail", "shareToken", "shareTokenEnc", "createdByStaffId", "responseCount"]) assert.ok(!(field in form));
    assert.equal((await staff(`/${formId}`, "PATCH", definition)).status, 409);
    assert.equal((await guest("GET", undefined, "bad-token")).status, 404);
    assert.equal((await request(`/public/judging-form/${formId}/responses`)).status, 404);
  });
  test("guest submissions require name, email, every scoring value and all required written answers", async () => {
    for (const changes of [
      { judgeName: "" }, { judgeName: "   " }, { judgeEmail: "" }, { judgeEmail: "invalid" },
      { scores: [] }, { scores: [{ criterionId, score: 11 }] }, { scores: [{ criterionId, score: -1 }] },
      { scores: [{ criterionId, score: 1 }, { criterionId, score: 2 }] },
      { answers: [] }, { answers: [{ questionId, text: "  " }] },
      { answers: [{ questionId: randomUUID(), text: "Unknown question" }] },
      { businessId: 203 }, { clientSubmissionId: "invalid" },
    ]) assert.equal((await guest("POST", { ...assessment, ...changes })).status, 400, JSON.stringify(changes));
    const rows = await client.query("SELECT count(*)::integer AS count FROM program_judging_responses");
    assert.equal(rows.rows[0].count, 0);
  });
  test("each email can assess each selected business once, with server-computed scores and safe retries", async () => {
    const first = await guest("POST", { ...assessment, scoreTotal: 999, judgeStaffId: 7 });
    assert.equal(first.status, 200);
    const receipt = await first.json();
    assert.equal(receipt.received, true);
    assert.equal(receipt.scoreTotal, 0, "a deliberate zero score is valid, not missing");
    assert.equal(receipt.maxScore, 10);
    assert.ok(!("judgeEmail" in receipt));
    assert.equal((await guest("POST", assessment)).status, 200);
    assert.equal((await guest("POST", { ...assessment, scores: [{ criterionId, score: 5 }] })).status, 409);
    assert.equal((await guest("POST", { ...assessment, clientSubmissionId: randomUUID() })).status, 409);
    assert.equal((await guest("POST", { ...assessment, businessId: 202, clientSubmissionId: randomUUID(), scores: [{ criterionId, score: 8 }] })).status, 200);
    const page = await (await staff(`/${formId}/responses`)).json();
    assert.equal(page.responses.length, 2);
    assert.equal(page.responses[0].judgeEmail, "judge@example.test");
    assert.equal(page.responses[0].judgeName, "Guest Judge");
    assert.equal(page.responses[0].answers[0].text, "Useful next steps");
    assert.equal((await (await staff(`/${formId}`)).json()).responseCount, 2);
  });
  test("authorized staff can replace an open form link without changing its rubric or submitted assessments", async () => {
    const previousToken = token;
    const before = await (await staff(`/${formId}`)).json();
    const rotated = await staff(`/${formId}/rotate-link`, "POST");
    assert.equal(rotated.status, 200);
    const after = await rotated.json();
    token = after.shareToken;
    assert.notEqual(token, previousToken);
    assert.equal(after.title, before.title);
    assert.deepEqual(after.criteria, before.criteria);
    assert.deepEqual(after.questions, before.questions);
    assert.deepEqual(after.businesses, before.businesses);
    assert.equal(after.responseCount, 2);
    assert.equal((await guest("GET", undefined, previousToken)).status, 404);
    assert.equal((await guest("POST", assessment, previousToken)).status, 404);
    assert.equal((await guest()).status, 200);
    const responses = await (await staff(`/${formId}/responses`)).json();
    assert.equal(responses.responses.length, 2);
    assert.equal((await guest("POST", { ...assessment, clientSubmissionId: randomUUID() })).status, 409,
      "existing per-business judge uniqueness still applies with the replacement link");
  });
  test("staff response privacy is enforced on list, details, status, editing and pagination", async () => {
    assert.ok((await (await staff()).json()).every((form: any) => form.programId === 11));
    for (const [suffix, method, body] of [
      [`/${foreignId}`, "GET", undefined], [`/${foreignId}/responses`, "GET", undefined],
      [`/${foreignId}`, "PATCH", definition], [`/${foreignId}/status`, "PATCH", { status: "closed" }],
    ] as const) assert.equal((await staff(suffix, method, body)).status, 404);
    assert.equal((await staff(`/${foreignId}/rotate-link`, "POST")).status, 404);
    assert.equal((await staff(`/${foreignId}/rotate-link`, "POST", undefined, "coordinator")).status, 200,
      "Admin can replace links across programs");
    for (const role of ["judge", "mentor", "trainer"]) {
      assert.equal((await staff("", "GET", undefined, role)).status, 403);
      assert.equal((await staff("", "POST", definition, role)).status, 403);
      assert.equal((await staff(`/${formId}/rotate-link`, "POST", undefined, role)).status, 403);
    }
    assert.equal((await request(`/staff/judging-forms/${formId}/responses`)).status, 403);
    assert.equal((await staff(`/${formId}/responses?beforeId=1.5`)).status, 400);
    await client.query(`INSERT INTO program_judging_responses(form_id,business_id,business_name,judge_name,judge_email,scores,answers,score_total,max_score,client_submission_id,payload_hash)
      SELECT $1,201,'Business one','Guest '||n,'guest'||n||'@example.test',$2::jsonb,$3::jsonb,5,10,md5('judging-fixture-'||n)::uuid,'fixture-only' FROM generate_series(1,55) n`,
    [formId, JSON.stringify([{ criterionId, score: 5 }]), JSON.stringify([{ questionId, text: "Recommendation" }])]);
    const first = await (await staff(`/${formId}/responses`)).json();
    assert.equal(first.responses.length, 50);
    const second = await (await staff(`/${formId}/responses?beforeId=${first.nextBeforeId}`)).json();
    assert.equal(second.responses.length, 7);
    assert.equal(second.nextBeforeId, null);
    assert.ok(second.responses.every((row: any) => row.id < first.nextBeforeId));
    assert.equal((await (await staff(`/${formId}`)).json()).responseCount, 57);
  });
  test("closing blocks new assessments, preserves retry receipts and never unlocks scoring rules", async () => {
    assert.equal((await staff(`/${formId}/status`, "PATCH", { status: "closed" })).status, 200);
    assert.equal((await guest()).status, 410);
    assert.equal((await guest("POST", { ...assessment, judgeEmail: "other@example.test", clientSubmissionId: randomUUID() })).status, 410);
    const previousToken = token;
    const rotated = await staff(`/${formId}/rotate-link`, "POST");
    assert.equal(rotated.status, 200);
    token = (await rotated.json()).shareToken;
    assert.notEqual(token, previousToken);
    assert.equal((await guest("GET", undefined, previousToken)).status, 404);
    assert.equal((await guest("POST", assessment, previousToken)).status, 404);
    assert.equal((await guest()).status, 410, "a replacement link is unavailable while the form is closed");
    assert.equal((await guest("POST", { ...assessment, judgeEmail: "new@example.test", clientSubmissionId: randomUUID() })).status, 410);
    assert.equal((await guest("POST", assessment)).status, 200);
    assert.equal((await staff(`/${formId}`, "PATCH", definition)).status, 409);
    assert.equal((await staff(`/${formId}/status`, "PATCH", { status: "open" })).status, 200);
    await client.query("DELETE FROM jusoor_businesses WHERE id=201");
    assert.equal((await (await staff(`/${formId}`)).json()).responseCount, 57, "historical assessment snapshots survive removed businesses");
    assert.equal((await guest("POST", { ...assessment, judgeEmail: "removed@example.test", clientSubmissionId: randomUUID() })).status, 400);
    await client.query("UPDATE jusoor_programs SET archived_at=now() WHERE id=11");
    assert.equal((await guest()).status, 404);
    assert.equal((await guest("POST", assessment)).status, 404);
    assert.equal((await staff(`/${formId}/responses`)).status, 404);
  });
});
