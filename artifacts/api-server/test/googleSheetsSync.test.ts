import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer, type Server } from "node:http";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  APPLICATION_HEADERS,
  JUDGING_HEADERS,
  applicationSheetRow,
  createProgramSpreadsheet,
  ensureProgramSpreadsheetTabs,
  isValidGoogleSheetsSheetMappings,
  judgingResponseSheetRow,
  listGoogleSheetsWorkbooks,
  queueProgramGoogleSheetsSnapshot,
  rowRange,
  writeProgramSnapshotSnapshot,
} from "../src/lib/googleSheetsSync";
import { PROGRAM_SNAPSHOT_SHEETS } from "../src/lib/googleSheetsSnapshots";
import {
  db,
  DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
  programGoogleSheetsConnectionsTable,
  programGoogleSheetsDestinationHistoryTable,
  programGoogleSheetsSyncEventsTable,
  programsTable,
} from "@workspace/db";

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

test("workbook tab mappings must be unique and use valid Google Sheets names", () => {
  assert.equal(isValidGoogleSheetsSheetMappings(DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS), true);
  assert.equal(isValidGoogleSheetsSheetMappings({
    ...DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
    chats: "Applications",
  }), false);
  assert.equal(isValidGoogleSheetsSheetMappings({
    ...DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
    chats: "Private/chats",
  }), false);
});

test("Google Sheets workbook creates user-selected worksheet names and headers", async () => {
  const mappings = {
    applications: "Admissions 2027",
    judgingResponses: "Judge scores",
    businessTeam: "Business list",
    operations: "Program schedule",
    mentoringGrants: "Mentor grants",
    chats: "Private messages",
  };
  const calls: { path: string; options: { method: string; body?: unknown } }[] = [];
  const connector = {
    proxy: async (_service: string, path: string, options: { method: string; body?: unknown }) => {
      calls.push({ path, options });
      return calls.length === 1
        ? Response.json({ spreadsheetId: "sheet_12345678901234567890" })
        : Response.json({});
    },
  };
  await createProgramSpreadsheet("Spring 2027", connector as never, mappings);
  const createBody = calls[0]?.options.body as { sheets: { properties: { title: string } }[] };
  const headerBody = calls[1]?.options.body as { data: { range: string; values: string[][] }[] };
  assert.deepEqual(createBody.sheets.map(sheet => sheet.properties.title), Object.values(mappings));
  assert.equal(headerBody.data[0]?.range, "'Admissions 2027'!A1:O1");
  assert.equal(headerBody.data[1]?.range, "'Judge scores'!A1:J1");
  assert.equal(headerBody.data[5]?.range, "'Private messages'!A1:I1");
});

test("Drive workbook choices expose only spreadsheet metadata and preserve pagination", async () => {
  let pathSeen = "";
  let serviceSeen = "";
  const connector = {
    proxy: async (service: string, path: string) => {
      serviceSeen = service;
      pathSeen = path;
      return Response.json({
        files: [
          { id: "sheet_12345678901234567890", name: "Program data", webViewLink: "https://docs.google.com/spreadsheets/d/sheet_12345678901234567890/edit", modifiedTime: "2026-11-11T10:00:00Z" },
          { id: "ignored", mimeType: "text/plain" },
        ],
        nextPageToken: "page-next",
      });
    },
  };
  const result = await listGoogleSheetsWorkbooks({ search: "founder's data", pageToken: "cursor-next" }, connector as never);
  assert.equal(serviceSeen, "google-drive");
  assert.equal(new URLSearchParams(pathSeen.split("?")[1]).get("q"), "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and name contains 'founder\\'s data'");
  assert.equal(new URLSearchParams(pathSeen.split("?")[1]).get("pageToken"), "cursor-next");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.title, "Program data");
  assert.equal(result.nextPageToken, "page-next");
});

test("row-level exports write application and judging data to selected tabs", () => {
  const mappings = {
    applications: "Admissions 2027",
    judgingResponses: "Scores",
    businessTeam: "Businesses",
    operations: "Operations",
    mentoringGrants: "Mentor grants",
    chats: "Chats",
  };
  assert.equal(rowRange("application", 8, mappings), "'Admissions 2027'!A8:O8");
  assert.equal(rowRange("judging_response", 12, mappings), "'Scores'!A12:J12");
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

test("snapshot writes follow the configured worksheet mapping", async () => {
  const mappings = {
    applications: "Admissions",
    judgingResponses: "Scoring",
    businessTeam: "Business records",
    operations: "Sessions",
    mentoringGrants: "Mentor notes",
    chats: "Chat export",
  };
  const fake = createFakeSheetsConnector();
  PROGRAM_SNAPSHOT_SHEETS.forEach((sheet, index) => {
    const title = index === 0 ? mappings.businessTeam
      : index === 1 ? mappings.operations
        : index === 2 ? mappings.mentoringGrants : mappings.chats;
    fake.sheets.set(title, {
      sheetId: 100 + index,
      title,
      rowCount: 1000,
      values: [[...sheet.headers], ["old value"]],
    });
  });
  const snapshot = makeSnapshot(1, "mapped data");
  await writeProgramSnapshotSnapshot(spreadsheetId, snapshot, fake.connector as never, mappings);
  assert.deepEqual(fake.sheets.get(mappings.businessTeam)?.values[1]?.slice(0, snapshot[0]!.headers.length), snapshot[0]!.rows[0]);
  assert.deepEqual(fake.sheets.get(mappings.chats)?.values[1]?.slice(0, snapshot[3]!.headers.length), snapshot[3]!.rows[0]);
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

test("Google Sheets selection API enforces program access, replacement consent, and queue scope", async (t) => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const { default: googleSheetsRouter } = await import("../src/routes/googleSheets");
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
  const originalConnectorProxy = ReplitConnectors.prototype.proxy;

  type Connection = Record<string, any> & { programId: number; spreadsheetId: string };
  let staffProgramIds = [19];
  let existingConnection: Connection | undefined;
  const concurrentConnections = new Map<number, Connection>();
  const requestProgram = new AsyncLocalStorage<number>();
  let concurrentMode = false;
  let spreadsheetOwnerProgramId: number | undefined;
  let missingTabAfterCreation: string | undefined;
  let staffRole = "staff";
  let transactionCalls = 0;
  let connectorCalls: { service: string; path: string; method: string; body?: unknown }[] = [];
  let queuedProgramIds: number[] = [];
  let destinationHistoryRecords: Record<string, unknown>[] = [];
  let workbookLockAttempts = 0;
  let clearCount = 0;
  let clearGate: Promise<void> | undefined;
  let releaseClearGate: (() => void) | undefined;
  let clearEntered: (() => void) | undefined;
  let server: Server;

  const programRecord = { id: 19, name: "Spring Program", archivedAt: null };
  const makeConnection = (programId: number, spreadsheet: string): Connection => ({
    programId,
    spreadsheetId: spreadsheet,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheet}/edit`,
    spreadsheetTitle: "Spring Program records",
    sheetMappings: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
    exportBusinessTeam: true,
    exportOperations: true,
    exportMentoringGrants: true,
    exportChats: true,
    connectedAt: new Date("2026-11-11T10:00:00Z"),
    lastSyncedAt: null,
    lastError: null,
    nextApplicationRow: 2,
    nextJudgingResponseRow: 2,
  });

  function rowsFor(table: unknown, selection: Record<string, unknown> | undefined, joined: boolean): any[] {
    const currentProgramId = requestProgram.getStore() ?? 19;
    const currentConnection = concurrentMode
      ? concurrentConnections.get(currentProgramId)
      : existingConnection;
    if (table === programsTable) {
      if (joined) {
        return [{
          programId: currentProgramId,
          programName: programRecord.name,
          spreadsheetId: currentConnection?.spreadsheetId ?? null,
          spreadsheetUrl: currentConnection?.spreadsheetUrl ?? null,
          spreadsheetTitle: currentConnection?.spreadsheetTitle ?? null,
          sheetMappings: currentConnection?.sheetMappings ?? null,
          exportBusinessTeam: currentConnection?.exportBusinessTeam ?? null,
          exportOperations: currentConnection?.exportOperations ?? null,
          exportMentoringGrants: currentConnection?.exportMentoringGrants ?? null,
          exportChats: currentConnection?.exportChats ?? null,
          connectedAt: currentConnection?.connectedAt ?? null,
          lastSyncedAt: currentConnection?.lastSyncedAt ?? null,
          lastError: currentConnection?.lastError ?? null,
        }];
      }
      return [{ ...programRecord, id: currentProgramId }];
    }
    if (table === programGoogleSheetsConnectionsTable) {
      const selectedColumns = Object.keys(selection ?? {});
      if (selectedColumns.length === 1 && selectedColumns[0] === "programId") {
        if (concurrentMode) {
          const owner = [...concurrentConnections.values()]
            .find((connection) => connection.spreadsheetId === spreadsheetId);
          if (owner) return [{ programId: owner.programId }];
        }
        return spreadsheetOwnerProgramId === undefined ? [] : [{ programId: spreadsheetOwnerProgramId }];
      }
      return currentConnection
        ? [{ ...currentConnection, sheetMappings: { ...currentConnection.sheetMappings } }]
        : [];
    }
    if (table === programGoogleSheetsDestinationHistoryTable) return destinationHistoryRecords;
    return [];
  }

  function makeQuery(
    table?: unknown,
    selection?: Record<string, unknown>,
    joined = false,
  ): any {
    const query: any = {
      maxRows: undefined as number | undefined,
      from(nextTable: unknown) { return makeQuery(nextTable, selection, joined); },
      leftJoin() { return makeQuery(table, selection, true); },
      innerJoin() { return query; },
      where() { return query; },
      orderBy() { return query; },
      groupBy() { return query; },
      for() { return query; },
      limit(count: number) { query.maxRows = count; return query; },
      then(resolve: (rows: any[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(rowsFor(table, selection, joined).slice(0, query.maxRows)).then(resolve, reject);
      },
    };
    return query;
  }

  const testLocks = new Map<string, Promise<void>>();
  async function acquireTestLock(key: string): Promise<() => void> {
    const previous = testLocks.get(key) ?? Promise.resolve();
    let unlockCurrent!: () => void;
    const current = new Promise<void>((resolve) => { unlockCurrent = resolve; });
    const tail = previous.then(() => current);
    testLocks.set(key, tail);
    await previous;
    return () => {
      unlockCurrent();
      if (testLocks.get(key) === tail) testLocks.delete(key);
    };
  }

  function createTransaction(releases: (() => void)[]) {
    const tx: any = {
      execute: async (query: { toQuery?: (config: any) => { sql: string; params: unknown[] } }) => {
        const compiled = query.toQuery?.({
          escapeName: (name: string) => name,
          escapeParam: (index: number) => `$${index + 1}`,
          escapeString: (value: string) => `'${value}'`,
        });
        if (compiled?.sql.includes("pg_advisory_xact_lock")) {
          const lockKey = String(compiled.params[0] ?? "");
          if (lockKey.startsWith("program-google-sheets-workbook:")) workbookLockAttempts += 1;
          releases.push(await acquireTestLock(lockKey));
        }
      },
      select: (selection?: Record<string, unknown>) => makeQuery(undefined, selection),
      update: (table: unknown) => ({
        set(values: Record<string, unknown>) {
          if (table === programGoogleSheetsConnectionsTable) {
            const programId = requestProgram.getStore() ?? 19;
            const connection = concurrentMode ? concurrentConnections.get(programId) : existingConnection;
            if (connection) Object.assign(connection, values);
          }
          return {
            where() {
              const result: any = Promise.resolve();
              result.returning = async () => {
                const programId = requestProgram.getStore() ?? 19;
                const connection = concurrentMode ? concurrentConnections.get(programId) : existingConnection;
                return connection ? [connection] : [];
              };
              return result;
            },
          };
        },
      }),
      insert: (table: unknown) => ({
        values(values: Record<string, unknown> | Record<string, unknown>[]) {
          if (table === programGoogleSheetsConnectionsTable) {
            const programId = Number((values as Record<string, unknown>).programId);
            const connection = {
              ...makeConnection(programId, String((values as Record<string, unknown>).spreadsheetId)),
              ...(values as Record<string, unknown>),
            } as Connection;
            if (concurrentMode) concurrentConnections.set(programId, connection);
            else existingConnection = connection;
          }
          if (table === programGoogleSheetsSyncEventsTable) {
            const entries = Array.isArray(values) ? values : [values];
            queuedProgramIds.push(...entries.map((entry) => Number(entry.programId)));
          }
          if (table === programGoogleSheetsDestinationHistoryTable) {
            const entries = Array.isArray(values) ? values : [values];
            destinationHistoryRecords.push(...entries.map((entry, index) => ({
              ...entry,
              id: destinationHistoryRecords.length + index + 1,
              createdAt: new Date("2026-11-11T10:30:00Z"),
            })));
          }
          return {
            onConflictDoNothing: async () => undefined,
            onConflictDoUpdate: async () => undefined,
            returning: async () => {
              if (table !== programGoogleSheetsConnectionsTable) return [];
              const programId = requestProgram.getStore() ?? 19;
              const connection = concurrentMode ? concurrentConnections.get(programId) : existingConnection;
              return connection ? [connection] : [];
            },
          };
        },
      }),
    };
    return tx;
  }

  const mappingBody = (overrides: Record<string, string> = {}) => ({
    mode: "existing",
    spreadsheetId,
    confirmedOverwrite: true,
    sheetMappings: { ...DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS, ...overrides },
  });

  try {
    Object.defineProperty(db, "select", {
      configurable: true,
      writable: true,
      value: (selection?: Record<string, unknown>) => makeQuery(undefined, selection),
    });
    Object.defineProperty(db, "transaction", {
      configurable: true,
      writable: true,
      value: async (callback: (tx: any) => Promise<unknown>) => {
        transactionCalls += 1;
        const releases: (() => void)[] = [];
        try {
          return await callback(createTransaction(releases));
        } finally {
          for (const release of releases.reverse()) release();
        }
      },
    });
    ReplitConnectors.prototype.proxy = async function (service, path, options) {
      const method = options?.method ?? "GET";
      connectorCalls.push({ service, path, method, body: options?.body });
      if (concurrentMode && path.endsWith("/values:batchClear")) {
        clearCount += 1;
        clearEntered?.();
        await clearGate;
      }
      if (service === "google-drive") {
        return Response.json({ files: [{ id: spreadsheetId, name: "Spring workbook" }] });
      }
      if (method === "GET") {
        const titles = Object.values(DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS)
          .filter((title) => title !== missingTabAfterCreation);
        return Response.json(path.includes("properties(title)")
          ? {
            properties: { title: "Spring workbook" },
            sheets: titles.map((title, index) => ({ properties: { title, sheetId: index + 1 } })),
          }
          : { sheets: titles.map((title, index) => ({ properties: { title, sheetId: index + 1 } })) });
      }
      return Response.json({});
    };

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const programId = Number(req.originalUrl.match(/\/google-sheets\/(\d+)/)?.[1]);
      requestProgram.run(programId, () => {
        res.locals.staff = {
          id: 7,
          email: "staff@example.test",
          role: staffRole,
          programIds: staffProgramIds,
        };
        req.log = { error: () => undefined } as any;
        next();
      });
    });
    app.use("/api/staff/google-sheets", googleSheetsRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/api/staff/google-sheets`;
    const request = (path: string, method = "GET", body?: unknown) => fetch(`${origin}${path}`, {
      method,
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const reset = () => {
      staffProgramIds = [19];
      existingConnection = undefined;
      concurrentConnections.clear();
      concurrentMode = false;
      spreadsheetOwnerProgramId = undefined;
      missingTabAfterCreation = undefined;
      staffRole = "staff";
      transactionCalls = 0;
      connectorCalls = [];
      queuedProgramIds = [];
      destinationHistoryRecords = [];
      workbookLockAttempts = 0;
      clearCount = 0;
      clearGate = undefined;
      releaseClearGate = undefined;
      clearEntered = undefined;
    };

    await t.test("staff outside a program cannot list or link its workbooks", async () => {
      reset();
      staffProgramIds = [22];
      const list = await request("/19/workbooks");
      const tabs = await request(`/19/workbooks/${spreadsheetId}/tabs`);
      const link = await request("/19", "POST", mappingBody());
      assert.equal(list.status, 404);
      assert.equal(tabs.status, 404);
      assert.equal(link.status, 404);
      assert.equal(transactionCalls, 0);
      assert.deepEqual(connectorCalls, []);
      assert.deepEqual(queuedProgramIds, []);
    });

    await t.test("linking an existing workbook without consent cannot clear cells", async () => {
      reset();
      const body = { ...mappingBody(), confirmedOverwrite: false };
      const response = await request("/19", "POST", body);
      assert.equal(response.status, 400);
      assert.deepEqual(connectorCalls, []);
      assert.equal(transactionCalls, 0);
      assert.deepEqual(queuedProgramIds, []);
    });

    await t.test("a workbook linked to another program is rejected before clearing or queueing", async () => {
      reset();
      spreadsheetOwnerProgramId = 22;
      const response = await request("/19", "POST", mappingBody());
      assert.equal(response.status, 409);
      assert.equal(connectorCalls.some(({ path }) => path.endsWith("/values:batchClear")), false);
      assert.deepEqual(queuedProgramIds, []);
      assert.equal(existingConnection, undefined);
    });

    await t.test("concurrent programs cannot claim and clear the same workbook", async () => {
      reset();
      concurrentMode = true;
      staffProgramIds = [19, 22];
      let notifyClearEntered!: () => void;
      const firstClearStarted = new Promise<void>((resolve) => { notifyClearEntered = resolve; });
      clearEntered = notifyClearEntered;
      clearGate = new Promise<void>((resolve) => { releaseClearGate = resolve; });

      const firstRequest = request("/19", "POST", mappingBody());
      await firstClearStarted;
      const competingRequest = request("/22", "POST", mappingBody());

      for (let attempt = 0; workbookLockAttempts < 2 && attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const actualWorkbookLockAttempts = workbookLockAttempts;
      releaseClearGate?.();

      const [firstResponse, competingResponse] = await Promise.all([firstRequest, competingRequest]);
      assert.equal(actualWorkbookLockAttempts, 2, "both requests should attempt to lock the selected workbook");
      assert.equal(firstResponse.status, 201, await firstResponse.clone().text());
      assert.equal(competingResponse.status, 409, await competingResponse.clone().text());
      assert.equal(concurrentConnections.size, 1, "only one program may retain a connection to the workbook");
      assert.equal(clearCount, 1, "the rejected request must not clear worksheet values");
      assert.ok(queuedProgramIds.length > 0, "the winning program should receive its sync work");
      assert.deepEqual(new Set(queuedProgramIds), new Set([19]), "the rejected program must not receive sync work");
    });

    await t.test("a selected tab missing after provider setup is rejected without linking", async () => {
      reset();
      missingTabAfterCreation = "Unverified chat tab";
      const response = await request("/19", "POST", mappingBody({ chats: missingTabAfterCreation }));
      assert.equal(response.status, 400);
      assert.equal(connectorCalls.some(({ path }) => path.endsWith("/values:batchClear")), false);
      assert.equal(existingConnection, undefined);
      assert.deepEqual(queuedProgramIds, []);
    });

    await t.test("a validated selection queues sync work only for the authorized program", async () => {
      reset();
      const response = await request("/19", "POST", mappingBody());
      assert.equal(response.status, 201);
      assert.equal(existingConnection?.programId, 19);
      assert.ok(queuedProgramIds.length > 0);
      assert.deepEqual(new Set(queuedProgramIds), new Set([19]));
      const clearRequest = connectorCalls.find(({ path }) => path.endsWith("/values:batchClear"));
      assert.ok(clearRequest, "confirmed workbook selection should replace the selected managed ranges");
      assert.equal(destinationHistoryRecords.length, 1);
      assert.deepEqual({
        actorStaffId: destinationHistoryRecords[0]?.actorStaffId,
        actorEmail: destinationHistoryRecords[0]?.actorEmail,
        programId: destinationHistoryRecords[0]?.programId,
        previousSpreadsheetId: destinationHistoryRecords[0]?.previousSpreadsheetId,
        previousSheetMappings: destinationHistoryRecords[0]?.previousSheetMappings,
        newSpreadsheetId: destinationHistoryRecords[0]?.newSpreadsheetId,
        newSheetMappings: destinationHistoryRecords[0]?.newSheetMappings,
      }, {
        actorStaffId: 7,
        actorEmail: "staff@example.test",
        programId: 19,
        previousSpreadsheetId: null,
        previousSheetMappings: null,
        newSpreadsheetId: spreadsheetId,
        newSheetMappings: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
      });
      assert.equal(Object.keys(destinationHistoryRecords[0] ?? {}).some((key) => /contents|rows/i.test(key)), false);
      const refresh = await request("/19", "POST", mappingBody());
      assert.equal(refresh.status, 200);
      assert.equal(destinationHistoryRecords.length, 1, "refreshing an unchanged destination must not create a change event");
    });

    await t.test("changing the workbook and mappings records both destinations", async () => {
      reset();
      existingConnection = makeConnection(19, "old_sheet_12345678901234567890");
      existingConnection.spreadsheetTitle = "Previous workbook";
      const newMappings = {
        ...DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
        applications: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS.judgingResponses,
        judgingResponses: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS.applications,
      };
      const response = await request("/19", "POST", mappingBody(newMappings));
      assert.equal(response.status, 200);
      assert.equal(destinationHistoryRecords.length, 1);
      assert.equal(destinationHistoryRecords[0]?.previousSpreadsheetId, "old_sheet_12345678901234567890");
      assert.equal(destinationHistoryRecords[0]?.previousSpreadsheetTitle, "Previous workbook");
      assert.equal(destinationHistoryRecords[0]?.newSpreadsheetId, spreadsheetId);
      assert.deepEqual(destinationHistoryRecords[0]?.previousSheetMappings, DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS);
      assert.deepEqual(destinationHistoryRecords[0]?.newSheetMappings, newMappings);
    });

    await t.test("changing worksheet mappings on the existing workbook is recorded", async () => {
      reset();
      existingConnection = makeConnection(19, spreadsheetId);
      const newMappings = {
        ...DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
        applications: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS.judgingResponses,
        judgingResponses: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS.applications,
      };
      const response = await request("/19/sheet-mappings", "PATCH", {
        sheetMappings: newMappings,
        confirmedOverwrite: true,
      });
      assert.equal(response.status, 200);
      assert.equal(destinationHistoryRecords.length, 1);
      assert.equal(destinationHistoryRecords[0]?.previousSpreadsheetId, spreadsheetId);
      assert.equal(destinationHistoryRecords[0]?.newSpreadsheetId, spreadsheetId);
      assert.deepEqual(destinationHistoryRecords[0]?.previousSheetMappings, DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS);
      assert.deepEqual(destinationHistoryRecords[0]?.newSheetMappings, newMappings);
    });

    await t.test("destination history is only visible to coordinators", async () => {
      reset();
      destinationHistoryRecords = [{
        id: 1,
        programId: 19,
        programName: "Spring Program",
        actorStaffId: 7,
        actorEmail: "staff@example.test",
        previousSpreadsheetId: null,
        previousSpreadsheetTitle: null,
        previousSheetMappings: null,
        newSpreadsheetId: spreadsheetId,
        newSpreadsheetTitle: "Spring workbook",
        newSheetMappings: DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
        createdAt: new Date("2026-11-11T10:30:00Z"),
      }];
      assert.equal((await request("/19/destination-history")).status, 403);
      staffRole = "coordinator";
      const response = await request("/19/destination-history");
      assert.equal(response.status, 200);
      const history = await response.json() as Record<string, unknown>[];
      assert.equal(history.length, 1);
      assert.equal(history[0]?.actorEmail, "staff@example.test");
    });
  } finally {
    if (server!) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (originalSelect) Object.defineProperty(db, "select", originalSelect);
    else Reflect.deleteProperty(db, "select");
    if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
    else Reflect.deleteProperty(db, "transaction");
    ReplitConnectors.prototype.proxy = originalConnectorProxy;
  }
});
