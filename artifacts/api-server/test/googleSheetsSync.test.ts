import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPLICATION_HEADERS,
  JUDGING_HEADERS,
  applicationSheetRow,
  createProgramSpreadsheet,
  judgingResponseSheetRow,
} from "../src/lib/googleSheetsSync";

test("Google Sheets workbook has separate application and judging tabs and writes headers as raw values", async () => {
  const calls: { path: string; options: { method: string; body?: unknown } }[] = [];
  const connector = {
    proxy: async (_service: string, path: string, options: { method: string; body?: unknown }) => {
      calls.push({ path, options });
      return calls.length === 1
        ? new Response(JSON.stringify({ spreadsheetId: "sheet_12345678901234567890" }), { status: 200 })
        : new Response(JSON.stringify({}), { status: 200 });
    },
  };

  const result = await createProgramSpreadsheet("Spring 2027", connector as never);
  assert.equal(result.spreadsheetUrl, "https://docs.google.com/spreadsheets/d/sheet_12345678901234567890/edit");
  assert.match(result.title, /Spring 2027/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.path, "/v4/spreadsheets");
  const createBody = calls[0]?.options.body as {
    sheets: { properties: { title: string } }[];
  };
  assert.deepEqual(createBody.sheets.map((sheet) => sheet.properties.title), ["Applications", "Judging responses"]);
  assert.equal(calls[1]?.path, "/v4/spreadsheets/sheet_12345678901234567890/values:batchUpdate");
  const headerBody = calls[1]?.options.body as {
    valueInputOption: string;
    data: { range: string; values: string[][] }[];
  };
  assert.equal(headerBody.valueInputOption, "RAW");
  assert.deepEqual(headerBody.data.map((item) => item.values[0]), [APPLICATION_HEADERS, JUDGING_HEADERS]);
});

test("application exports have a stable column order and preserve untrusted text as plain values", () => {
  const row = applicationSheetRow({
    id: 41, programName: "Spring program", businessName: "Good Food", founderName: "Name",
    email: "founder@example.test", phone: null, industry: null, website: null,
    summary: "=HYPERLINK(\"https://example.test\")", supportNeeds: "Funding",
    status: "submitted", reviewNotes: null, businessId: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"), reviewedAt: null,
  });
  assert.equal(row.length, APPLICATION_HEADERS.length);
  assert.equal(row[8], '=HYPERLINK("https://example.test")');
  assert.equal(row[11], "");
  assert.equal(row[13], "2026-10-01T00:00:00.000Z");
});

test("judging responses include readable criterion and question labels without evaluating formulas", () => {
  const row = judgingResponseSheetRow({
    id: 2, formTitle: "Pitch day", businessName: "Studio", judgeName: "Guest",
    judgeEmail: "guest@example.test",
    criteria: [{ id: "impact", label: "Impact", description: "", maxScore: 5 }],
    questions: [{ id: "next", label: "Next step?", required: true }],
    scores: [{ criterionId: "impact", score: 5 }],
    answers: [{ questionId: "next", text: "=IMPORTXML(\"https://example.test\")" }],
    scoreTotal: 5, maxScore: 5, submittedAt: new Date("2026-10-22T12:00:00.000Z"),
  });
  assert.equal(row.length, JUDGING_HEADERS.length);
  assert.equal(row[5], JSON.stringify([{ criterion: "Impact", score: 5 }]));
  assert.equal(row[6], JSON.stringify([{ question: "Next step?", answer: '=IMPORTXML("https://example.test")' }]));
});

test("Google Sheets authorization failures are clear and never echo provider response bodies", async () => {
  const connector = {
    proxy: async () => new Response(JSON.stringify({ error: { message: "sensitive provider detail" } }), { status: 403 }),
  };
  await assert.rejects(
    createProgramSpreadsheet("Spring 2027", connector as never),
    (error: unknown) => error instanceof Error
      && error.message.includes("permission")
      && !error.message.includes("sensitive provider detail"),
  );
});
