import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPLICATION_HEADERS,
  JUDGING_HEADERS,
  applicationSheetRow,
  createProgramSpreadsheet,
  ensureProgramSpreadsheetTabs,
  judgingResponseSheetRow,
  queueProgramGoogleSheetsSnapshot,
  writeProgramSnapshotSnapshot,
} from "../src/lib/googleSheetsSync";
import { PROGRAM_SNAPSHOT_SHEETS } from "../src/lib/googleSheetsSnapshots";

const spreadsheetId = "sheet_12345678901234567890";

function makeSnapshot(rowCount: number, cellText = "synthetic test data") {
  return PROGRAM_SNAPSHOT_SHEETS.map((sheet, index) => ({
    title: sheet.title,
    headers: sheet.headers,
    rows: Array.from({ length: index === 0 ? rowCount : 2 }, (_, row) =>
      sheet.headers.map((_, column) => column === 0 ? `${index}-${row}` : cellText)),
  }));
}

function createFakeSheetsConnector(options: { failValuesAt?: number; failCommitOnce?: boolean } = {}) {
  type FakeSheet = {
    sheetId: number;
    title: string;
    rowCount: number;
    values: (string | number)[][];
  };
  const sheets = new Map<string, FakeSheet>();
  PROGRAM_SNAPSHOT_SHEETS.forEach((sheet, index) => sheets.set(sheet.title, {
    sheetId: index + 1,
    title: sheet.title,
    rowCount: 1000,
    values: [
      [...sheet.headers, "Coordinator-owned column"],
      ["old snapshot", "", "", "", "", "", "", "", "", "", "keep this"],
      ["stale row", "", "", "", "", "", "", "", "", "", "also keep"],
    ],
  }));
  const calls: { path: string; body?: any; bytes: number }[] = [];
  let nextSheetId = 5;
  let valuesCalls = 0;
  let failValuesAt = options.failValuesAt;
  let failCommitOnce = options.failCommitOnce ?? false;

  const connector = {
    proxy: async (_service: string, path: string, request: { method: string; body?: any }) => {
      const body = request.body ?? {};
      calls.push({ path, body, bytes: Buffer.byteLength(JSON.stringify(body), "utf8") });
      if (request.method === "GET") {
        return Response.json({
          sheets: [...sheets.values()].map(({ sheetId, title, rowCount }) => ({
            properties: { sheetId, title, gridProperties: { rowCount } },
          })),
        });
      }
      if (path.endsWith("/values:batchUpdate")) {
        valuesCalls++;
        if (failValuesAt === valuesCalls) {
          failValuesAt = undefined;
          return Response.json({ error: "synthetic interruption" }, { status: 503 });
        }
        for (const entry of body.data ?? []) {
          const match = /^'([^']+)'!A(\d+):[A-Z]+(\d+)$/.exec(entry.range);
          assert.ok(match, `unexpected staging range: ${entry.range}`);
          const sheet = sheets.get(match[1]!);
          assert.ok(sheet, `missing staging tab ${match[1]}`);
          const start = Number(match[2]) - 1;
          for (const [index, row] of entry.values.entries()) {
            sheet.values[start + index] = [...row];
          }
        }
        return Response.json({});
      }
      if (path.endsWith(":batchUpdate")) {
        const requests = body.requests ?? [];
        if (requests.every((request: any) => request.addSheet)) {
          const replies = requests.map((request: any) => {
            const properties = request.addSheet.properties;
            const sheet: FakeSheet = {
              sheetId: nextSheetId++,
              title: properties.title,
              rowCount: properties.gridProperties.rowCount,
              values: [],
            };
            sheets.set(sheet.title, sheet);
            return { addSheet: { properties: { sheetId: sheet.sheetId } } };
          });
          return Response.json({ replies });
        }
        if (failCommitOnce && requests.some((request: any) => request.copyPaste)) {
          failCommitOnce = false;
          return Response.json({ error: "synthetic commit interruption" }, { status: 503 });
        }

        // Apply the commit to a copy first, as the Sheets batchUpdate endpoint
        // guarantees that a failed batch does not partially modify target tabs.
        const draft = new Map([...sheets].map(([title, sheet]) => [title, {
          ...sheet,
          values: sheet.values.map((row) => [...row]),
        }]));
        const idToSheet = (id: number) => [...draft.values()].find((sheet) => sheet.sheetId === id)!;
        for (const request of requests) {
          if (request.updateSheetProperties) {
            const target = idToSheet(request.updateSheetProperties.properties.sheetId);
            target.rowCount = request.updateSheetProperties.properties.gridProperties.rowCount;
          } else if (request.copyPaste) {
            const source = idToSheet(request.copyPaste.source.sheetId);
            const target = idToSheet(request.copyPaste.destination.sheetId);
            const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } =
              request.copyPaste.source;
            for (let rowIndex = startRowIndex; rowIndex < endRowIndex; rowIndex++) {
              const row = target.values[rowIndex] ?? [];
              for (let column = startColumnIndex; column < endColumnIndex; column++) {
                row[column] = source.values[rowIndex]?.[column] ?? "";
              }
              target.values[rowIndex] = row;
            }
          } else if (request.repeatCell) {
            const { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } =
              request.repeatCell.range;
            const target = idToSheet(sheetId);
            for (let rowIndex = startRowIndex; rowIndex < endRowIndex; rowIndex++) {
              const row = target.values[rowIndex] ?? [];
              for (let column = startColumnIndex; column < endColumnIndex; column++) row[column] = "";
              target.values[rowIndex] = row;
            }
          } else if (request.deleteSheet) {
            const target = idToSheet(request.deleteSheet.sheetId);
            draft.delete(target.title);
          }
        }
        sheets.clear();
        for (const [title, sheet] of draft) sheets.set(title, sheet);
        return Response.json({});
      }
      throw new Error(`Unexpected fake Sheets request: ${path}`);
    },
  };

  return { connector, calls, sheets };
}

test("Google Sheets workbook has all selected program tabs and writes headers as raw values", async () => {
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
  assert.deepEqual(createBody.sheets.map((sheet) => sheet.properties.title), [
    "Applications", "Judging responses", ...PROGRAM_SNAPSHOT_SHEETS.map((sheet) => sheet.title),
  ]);
  assert.equal(calls[1]?.path, "/v4/spreadsheets/sheet_12345678901234567890/values:batchUpdate");
  const headerBody = calls[1]?.options.body as {
    valueInputOption: string;
    data: { range: string; values: string[][] }[];
  };
  assert.equal(headerBody.valueInputOption, "RAW");
  assert.deepEqual(headerBody.data.map((item) => item.values[0]), [
    APPLICATION_HEADERS, JUDGING_HEADERS, ...PROGRAM_SNAPSHOT_SHEETS.map((sheet) => sheet.headers),
  ]);
});

test("an interrupted staging write leaves the previous snapshot visible and retry publishes it", async () => {
  const fake = createFakeSheetsConnector({ failValuesAt: 1 });
  const original = fake.sheets.get(PROGRAM_SNAPSHOT_SHEETS[0].title)!.values.map((row) => [...row]);
  const snapshot = makeSnapshot(1, "new synthetic snapshot");

  await assert.rejects(
    writeProgramSnapshotSnapshot(spreadsheetId, snapshot, fake.connector as never),
    /temporarily unavailable/,
  );
  assert.deepEqual(fake.sheets.get(PROGRAM_SNAPSHOT_SHEETS[0].title)!.values, original);

  await writeProgramSnapshotSnapshot(spreadsheetId, snapshot, fake.connector as never);
  const published = fake.sheets.get(PROGRAM_SNAPSHOT_SHEETS[0].title)!.values;
  assert.deepEqual(published[0], [...snapshot[0]!.headers, "Coordinator-owned column"]);
  assert.deepEqual(published[1]!.slice(0, snapshot[0]!.headers.length), snapshot[0]!.rows[0]);
  assert.equal(published[1]![snapshot[0]!.headers.length], "keep this");
  assert.equal(published[2]![0], "");
  assert.equal(published[2]![snapshot[0]!.headers.length], "also keep");
  assert.equal([...fake.sheets.keys()].filter((title) => title.startsWith("__jusoor_snapshot_stage_")).length, 0);
});

test("an interrupted atomic publish leaves every prior tab intact until retry", async () => {
  const fake = createFakeSheetsConnector({ failCommitOnce: true });
  const original = PROGRAM_SNAPSHOT_SHEETS.map(({ title }) =>
    fake.sheets.get(title)!.values.map((row) => [...row]));
  const snapshot = makeSnapshot(2, "replacement data");

  await assert.rejects(
    writeProgramSnapshotSnapshot(spreadsheetId, snapshot, fake.connector as never),
    /temporarily unavailable/,
  );
  assert.deepEqual(
    PROGRAM_SNAPSHOT_SHEETS.map(({ title }) => fake.sheets.get(title)!.values),
    original,
  );

  await writeProgramSnapshotSnapshot(spreadsheetId, snapshot, fake.connector as never);
  assert.deepEqual(
    fake.sheets.get(PROGRAM_SNAPSHOT_SHEETS[0].title)!.values[1]!.slice(0, snapshot[0]!.headers.length),
    snapshot[0]!.rows[0],
  );
});

test("large snapshot exports stay below Google request limits and use bounded value batches", async () => {
  const fake = createFakeSheetsConnector();
  const snapshot = makeSnapshot(900, "x".repeat(12_000));
  await writeProgramSnapshotSnapshot(spreadsheetId, snapshot, fake.connector as never);

  const valueCalls = fake.calls.filter(({ path }) => path.endsWith("/values:batchUpdate"));
  assert.ok(valueCalls.length > 1, "large snapshots should be split into multiple provider calls");
  assert.ok(valueCalls.every(({ bytes }) => bytes <= 5 * 1024 * 1024));
  const rangeCounts = valueCalls.map(({ body }) => body.data.length);
  assert.ok(rangeCounts.every((count: number) => count <= 100));
  const published = fake.sheets.get(PROGRAM_SNAPSHOT_SHEETS[0].title)!.values;
  assert.equal(published[900]![0], "0-899");
});

test("existing workbooks gain only missing category tabs and repeated setup is a no-op", async () => {
  const calls: { path: string; body: unknown }[] = [];
  let titles = ["Applications", "Judging responses", PROGRAM_SNAPSHOT_SHEETS[0].title];
  const connector = {
    proxy: async (_service: string, path: string, options: { method: string; body?: unknown }) => {
      calls.push({ path, body: options.body });
      if (options.method === "GET") {
        return new Response(JSON.stringify({ sheets: titles.map(title => ({ properties: { title } })) }));
      }
      if (path.endsWith(":batchUpdate") && !path.includes("/values")) {
        titles = [...titles, ...PROGRAM_SNAPSHOT_SHEETS.slice(1).map(sheet => sheet.title)];
      }
      return new Response("{}");
    },
  };
  await ensureProgramSpreadsheetTabs("sheet_12345678901234567890", connector as never);
  assert.equal(calls.length, 3);
  const changes = calls[1]!.body as { requests: { addSheet: { properties: { title: string } } }[] };
  assert.deepEqual(changes.requests.map(change => change.addSheet.properties.title),
    PROGRAM_SNAPSHOT_SHEETS.slice(1).map(sheet => sheet.title));
  await ensureProgramSpreadsheetTabs("sheet_12345678901234567890", connector as never);
  assert.equal(calls.length, 4);
});

test("ordinary platform writes do not enable expanded exports for an existing workbook", async () => {
  let writes = 0;
  const query = { from() { return this; }, where() { return this; }, limit: async () => [] };
  const executor = {
    select: () => query,
    insert: () => { writes++; throw new Error("Unexpected export enablement"); },
    update: () => { writes++; throw new Error("Unexpected export enablement"); },
  };
  await queueProgramGoogleSheetsSnapshot(executor as never, 7);
  assert.equal(writes, 0);
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
