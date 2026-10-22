// Development-only test data. Never imported by the application.
// Create: pnpm --filter @workspace/api-server exec tsx test/fixtures/publicJudgingBrowser.ts
// Cleanup: same command with --cleanup. Metadata stays outside the workspace.
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { newJudgingToken, readJudgingToken } from "../../src/lib/judgingForms";

const path = "/tmp/program-judging-browser.json";
type Fixture = { programId: number; programName: string; formId: number; businessIds: number[]; path: string };
const client = await pool.connect();
try {
  await client.query("BEGIN");
  if (process.argv.includes("--cleanup")) {
    const fixture: Fixture = JSON.parse(await readFile(path, "utf8"));
    const owner = await client.query("SELECT id FROM jusoor_programs WHERE id=$1 AND name=$2 FOR UPDATE", [fixture.programId, fixture.programName]);
    if (owner.rowCount !== 1) throw new Error("Fixture program identity does not match; no cleanup performed.");
    const others = await client.query("SELECT id FROM program_judging_forms WHERE program_id=$1 AND id<>$2", [fixture.programId, fixture.formId]);
    if (others.rowCount) throw new Error("Unexpected forms exist in fixture program; no cleanup performed.");
    await client.query("DELETE FROM program_judging_forms WHERE id=$1 AND program_id=$2", [fixture.formId, fixture.programId]);
    await client.query("DELETE FROM jusoor_businesses WHERE id=ANY($1::integer[]) AND program_id=$2", [fixture.businessIds, fixture.programId]);
    await client.query("DELETE FROM jusoor_programs WHERE id=$1 AND name=$2", [fixture.programId, fixture.programName]);
    await client.query("COMMIT");
    await unlink(path);
    console.log("Temporary judging browser data removed.");
  } else {
    const programName = `Browser test judging ${randomUUID()}`;
    const program = await client.query("INSERT INTO jusoor_programs(name) VALUES($1) RETURNING id", [programName]);
    const programId = program.rows[0].id as number;
    const businesses = await client.query(`INSERT INTO jusoor_businesses(program_id,business_name,founder_name,email)
      VALUES($1,'Test business A','Synthetic founder','browser-a@example.test'),($1,'Test business B','Synthetic founder','browser-b@example.test') RETURNING id,business_name`, [programId]);
    const token = newJudgingToken();
    const criteria = [{ id: randomUUID(), label: "Impact", description: "Assess the evidence presented.", maxScore: 10 }];
    const questions = [{ id: randomUUID(), label: "Main recommendation", required: true }, { id: randomUUID(), label: "Other notes", required: false }];
    const form = await client.query(`INSERT INTO program_judging_forms(program_id,title,instructions,criteria,questions,status,share_token_hash,share_token_enc,published_at)
      VALUES($1,'Guest judging browser check','Assess each business separately. This is temporary test data.',$2::jsonb,$3::jsonb,'open',$4,$5,now()) RETURNING id`,
    [programId, JSON.stringify(criteria), JSON.stringify(questions), token.hash, token.encrypted]);
    const formId = form.rows[0].id as number;
    for (const business of businesses.rows) await client.query("INSERT INTO program_judging_form_businesses(form_id,business_id,business_name) VALUES($1,$2,$3)", [formId, business.id, business.business_name]);
    const fixture: Fixture = { programId, programName, formId, businessIds: businesses.rows.map(row => row.id), path: `/judging#${readJudgingToken(token.encrypted)}` };
    await client.query("COMMIT");
    await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
    console.log("Temporary judging browser data ready; metadata in /tmp/program-judging-browser.json.");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
