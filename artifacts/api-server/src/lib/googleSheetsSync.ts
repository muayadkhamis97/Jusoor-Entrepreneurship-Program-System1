import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, asc, eq, inArray, lte, notExists, or, sql } from "drizzle-orm";
import {
  applicationsTable,
  db,
  judgingFormsTable,
  judgingResponsesTable,
  participantInvitationsTable,
  programGoogleSheetsConnectionsTable,
  programGoogleSheetsSyncEventsTable,
  programsTable,
  DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
  type ProgramGoogleSheetsSheetMappings,
  type JudgingCriterionConfig,
  type JudgingQuestionConfig,
} from "@workspace/db";
import { logger } from "./logger";
import { loadProgramSnapshotSheets, PROGRAM_SNAPSHOT_SHEETS } from "./googleSheetsSnapshots";

export const APPLICATIONS_SHEET = "Applications";
export const JUDGING_RESPONSES_SHEET = "Judging responses";
export const APPLICATION_HEADERS = [
  "Application ID", "Program", "Business", "Applicant", "Email", "Phone",
  "Industry", "Website", "Business summary", "Support needs", "Status",
  "Review notes", "Business record ID", "Submitted at", "Reviewed at",
] as const;
export const JUDGING_HEADERS = [
  "Response ID", "Form", "Business", "Judge name", "Judge email",
  "Scores", "Written responses", "Total score", "Maximum score", "Submitted at",
] as const;

const SNAPSHOT_MAPPING_KEYS = ["businessTeam", "operations", "mentoringGrants", "chats"] as const;
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

type ConnectorClient = Pick<ReplitConnectors, "proxy">;
type SheetsExecutor = Pick<typeof db, "select" | "insert" | "update">;
type SourceType = "application" | "judging_response" | "program_snapshot";
type GoogleSheetsResponse = Awaited<ReturnType<ConnectorClient["proxy"]>>;
type SnapshotSheetValues = {
  title: string;
  headers: readonly string[];
  rows: (string | number)[][];
};

const MAX_SHEETS_REQUEST_BYTES = 5 * 1024 * 1024;
const MAX_SHEETS_VALUE_RANGES = 100;
const MAX_ROWS_PER_SHEETS_RANGE = 250;
const SNAPSHOT_STAGE_PREFIX = "__jusoor_snapshot_stage_";
let snapshotStageSequence = 0;

export class GoogleSheetsError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GoogleSheetsError";
  }
}

export function isValidGoogleSheetsSheetMappings(value: unknown): value is ProgramGoogleSheetsSheetMappings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS);
  if (Object.keys(record).length !== keys.length) return false;
  const titles: string[] = [];
  for (const key of keys) {
    const title = record[key];
    if (typeof title !== "string" || !title.trim() || title.length > 100
      || /[\[\]:*?\/\\\u0000-\u001f]/u.test(title)) return false;
    titles.push(title.trim());
  }
  return new Set(titles.map((title) => title.toLocaleLowerCase())).size === keys.length;
}

function snapshotDestinationKey(index: number): typeof SNAPSHOT_MAPPING_KEYS[number] {
  const key = SNAPSHOT_MAPPING_KEYS[index];
  if (!key) throw new GoogleSheetsError("The program snapshot does not match the configured worksheet tabs.");
  return key;
}

function workbookSheetDefinitions(mappings: ProgramGoogleSheetsSheetMappings) {
  return [
    { title: mappings.applications, headers: APPLICATION_HEADERS },
    { title: mappings.judgingResponses, headers: JUDGING_HEADERS },
    ...PROGRAM_SNAPSHOT_SHEETS.map((sheet, index) => ({
      title: mappings[snapshotDestinationKey(index)],
      headers: sheet.headers,
    })),
  ];
}

export async function lockGoogleSheetsProgram(
  executor: Pick<typeof db, "execute">,
  programId: number,
): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`program-google-sheets:${programId}`})::bigint)`);
}

export function applicationSheetRow(application: {
  id: number; programName: string; businessName: string; founderName: string;
  email: string; phone: string | null; industry: string | null; website: string | null;
  summary: string; supportNeeds: string; status: string; reviewNotes: string | null;
  businessId: number | null; createdAt: Date; reviewedAt: Date | null;
}): (string | number)[] {
  return [
    application.id, application.programName, application.businessName, application.founderName,
    application.email, application.phone ?? "", application.industry ?? "", application.website ?? "",
    application.summary, application.supportNeeds, application.status, application.reviewNotes ?? "",
    application.businessId ?? "", application.createdAt.toISOString(), application.reviewedAt?.toISOString() ?? "",
  ];
}

export function judgingResponseSheetRow(response: {
  id: number; formTitle: string; businessName: string; judgeName: string; judgeEmail: string;
  criteria: JudgingCriterionConfig[]; questions: JudgingQuestionConfig[];
  scores: { criterionId: string; score: number }[]; answers: { questionId: string; text: string }[];
  scoreTotal: number; maxScore: number; submittedAt: Date;
}): (string | number)[] {
  const criteria = new Map(response.criteria.map((criterion) => [criterion.id, criterion.label]));
  const questions = new Map(response.questions.map((question) => [question.id, question.label]));
  return [
    response.id, response.formTitle, response.businessName, response.judgeName, response.judgeEmail,
    JSON.stringify(response.scores.map((score) => ({
      criterion: criteria.get(score.criterionId) ?? "Criterion",
      score: score.score,
    }))),
    JSON.stringify(response.answers.map((answer) => ({
      question: questions.get(answer.questionId) ?? "Question",
      answer: answer.text,
    }))),
    response.scoreTotal, response.maxScore, response.submittedAt.toISOString(),
  ];
}

function googleSheetsPath(spreadsheetId: string, suffix: string): string {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(spreadsheetId)) {
    throw new GoogleSheetsError("Google Sheets returned an invalid spreadsheet ID.");
  }
  return `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${suffix}`;
}

function columnLabel(columnCount: number): string {
  let remainder = columnCount;
  let label = "";
  while (remainder > 0) {
    remainder--;
    label = String.fromCharCode(65 + remainder % 26) + label;
    remainder = Math.floor(remainder / 26);
  }
  return label;
}

function quotedSheetTitle(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function snapshotValueRanges(
  sheets: SnapshotSheetValues[],
  stageTitles: string[],
): { range: string; values: (string | number)[][] }[] {
  const ranges: { range: string; values: (string | number)[][] }[] = [];
  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index]!;
    const title = stageTitles[index]!;
    const values = [[...sheet.headers], ...sheet.rows];
    let start = 0;
    while (start < values.length) {
      let end = Math.min(values.length, start + MAX_ROWS_PER_SHEETS_RANGE);
      let entry: { range: string; values: (string | number)[][] };
      while (true) {
        entry = {
          range: `${quotedSheetTitle(title)}!A${start + 1}:${columnLabel(sheet.headers.length)}${end}`,
          values: values.slice(start, end),
        };
        const body = { valueInputOption: "RAW", data: [entry] };
        if (Buffer.byteLength(JSON.stringify(body), "utf8") <= MAX_SHEETS_REQUEST_BYTES) break;
        if (end - start <= 1) {
          throw new GoogleSheetsError("A Google Sheets snapshot row exceeds the provider request limit.");
        }
        end = start + Math.max(1, Math.floor((end - start) / 2));
      }
      ranges.push(entry);
      start = end;
    }
  }
  return ranges;
}

function snapshotValueBatches(
  ranges: { range: string; values: (string | number)[][] }[],
): { valueInputOption: string; data: { range: string; values: (string | number)[][] }[] }[] {
  const batches: { valueInputOption: string; data: { range: string; values: (string | number)[][] }[] }[] = [];
  let data: { range: string; values: (string | number)[][] }[] = [];
  for (const range of ranges) {
    const candidate = [...data, range];
    const body = { valueInputOption: "RAW", data: candidate };
    if (data.length && (
      candidate.length > MAX_SHEETS_VALUE_RANGES
      || Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_SHEETS_REQUEST_BYTES
    )) {
      batches.push({ valueInputOption: "RAW", data });
      data = [range];
    } else {
      data = candidate;
    }
    if (Buffer.byteLength(JSON.stringify({ valueInputOption: "RAW", data }), "utf8") > MAX_SHEETS_REQUEST_BYTES) {
      throw new GoogleSheetsError("A Google Sheets snapshot request exceeds the provider request limit.");
    }
  }
  if (data.length) batches.push({ valueInputOption: "RAW", data });
  return batches;
}

function sheetMetadata(value: Record<string, unknown>): {
  title: string;
  sheetId: number;
  rowCount: number;
}[] {
  if (!Array.isArray(value.sheets)) return [];
  return value.sheets.flatMap((sheet) => {
    if (typeof sheet !== "object" || sheet === null || !("properties" in sheet)) return [];
    const properties = sheet.properties;
    if (typeof properties !== "object" || properties === null) return [];
    const { title, sheetId, gridProperties } = properties as {
      title?: unknown;
      sheetId?: unknown;
      gridProperties?: { rowCount?: unknown };
    };
    if (typeof title !== "string" || typeof sheetId !== "number") return [];
    return [{
      title,
      sheetId,
      rowCount: typeof gridProperties?.rowCount === "number" ? gridProperties.rowCount : 1000,
    }];
  });
}

async function requestJson(
  connectors: ConnectorClient,
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: object,
): Promise<Record<string, unknown>> {
  let response: GoogleSheetsResponse;
  try {
    response = await connectors.proxy("google-sheet", path, { method, ...(body ? { body } : {}) });
  } catch {
    throw new GoogleSheetsError("Google Sheets could not be reached. Check the project Google connection and retry.");
  }
  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new GoogleSheetsError(
        "The connected Google account needs permission to create or edit this spreadsheet. Check its access in Google, then retry.",
        status,
      );
    }
    if (status === 429 || status >= 500) {
      throw new GoogleSheetsError(`Google Sheets is temporarily unavailable (HTTP ${status}). The data remains saved in the platform.`);
    }
    throw new GoogleSheetsError(`Google Sheets rejected the request (HTTP ${status}). The data remains saved in the platform.`, status);
  }
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid response");
    return value as Record<string, unknown>;
  } catch {
    throw new GoogleSheetsError("Google Sheets returned an unreadable response.");
  }
}

async function requestDriveJson(
  connectors: ConnectorClient,
  path: string,
): Promise<Record<string, unknown>> {
  let response: GoogleSheetsResponse;
  try {
    response = await connectors.proxy("google-drive", path, { method: "GET" });
  } catch {
    throw new GoogleSheetsError("Google Drive could not be reached. Check the connected Google account and retry.");
  }
  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new GoogleSheetsError("The connected Google account cannot list spreadsheets. Check its Drive access and retry.", status);
    }
    throw new GoogleSheetsError(
      status === 429 || status >= 500
        ? `Google Drive is temporarily unavailable (HTTP ${status}).`
        : `Google Drive rejected the request (HTTP ${status}).`,
      status,
    );
  }
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid response");
    return value as Record<string, unknown>;
  } catch {
    throw new GoogleSheetsError("Google Drive returned an unreadable response.");
  }
}

export async function listGoogleSheetsWorkbooks(
  input: { search?: string; pageToken?: string },
  connectors: ConnectorClient = new ReplitConnectors(),
): Promise<{
  items: { spreadsheetId: string; title: string; url: string; modifiedAt: string | null }[];
  nextPageToken: string | null;
}> {
  const escapedSearch = input.search?.trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
  const query = [
    `mimeType = '${SPREADSHEET_MIME_TYPE}'`,
    "trashed = false",
    ...(escapedSearch ? [`name contains '${escapedSearch}'`] : []),
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    fields: "nextPageToken,files(id,name,webViewLink,modifiedTime)",
    pageSize: "100",
    orderBy: "modifiedTime desc",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (input.pageToken) params.set("pageToken", input.pageToken);
  const response = await requestDriveJson(connectors, `/drive/v3/files?${params.toString()}`);
  const files = Array.isArray(response.files) ? response.files : [];
  const items = files.flatMap((file) => {
    if (typeof file !== "object" || file === null) return [];
    const item = file as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.name !== "string") return [];
    return [{
      spreadsheetId: item.id,
      title: item.name,
      url: typeof item.webViewLink === "string"
        ? item.webViewLink
        : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(item.id)}/edit`,
      modifiedAt: typeof item.modifiedTime === "string" ? item.modifiedTime : null,
    }];
  });
  return {
    items,
    nextPageToken: typeof response.nextPageToken === "string" ? response.nextPageToken : null,
  };
}

export async function listProgramSpreadsheetTabs(
  spreadsheetId: string,
  connectors: ConnectorClient = new ReplitConnectors(),
): Promise<{ title: string; sheetId: number }[]> {
  return (await getProgramSpreadsheetInfo(spreadsheetId, connectors)).tabs;
}

export async function getProgramSpreadsheetInfo(
  spreadsheetId: string,
  connectors: ConnectorClient = new ReplitConnectors(),
): Promise<{ title: string; tabs: { title: string; sheetId: number }[] }> {
  const metadata = await requestJson(
    connectors,
    googleSheetsPath(spreadsheetId, "?fields=properties(title),sheets(properties(sheetId,title))"),
    "GET",
  );
  if (typeof metadata.properties !== "object" || metadata.properties === null
    || !("title" in metadata.properties) || typeof metadata.properties.title !== "string") {
    throw new GoogleSheetsError("Google Sheets did not return the selected spreadsheet title.");
  }
  return {
    title: metadata.properties.title,
    tabs: sheetMetadata(metadata).map(({ title, sheetId }) => ({ title, sheetId })),
  };
}

export async function createProgramSpreadsheet(
  programName: string,
  connectors: ConnectorClient = new ReplitConnectors(),
  mappings: ProgramGoogleSheetsSheetMappings = DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const title = `${programName.slice(0, 180)} — Program records`;
  const created = await requestJson(connectors, "/v4/spreadsheets", "POST", {
    properties: { title },
    sheets: workbookSheetDefinitions(mappings).map(({ title: sheetTitle }) => ({
      properties: { title: sheetTitle, gridProperties: { frozenRowCount: 1, hideGridlines: true } },
    })),
  });
  if (typeof created.spreadsheetId !== "string") {
    throw new GoogleSheetsError("Google Sheets did not return a spreadsheet ID. Check Google Drive before retrying.");
  }
  const spreadsheetId = created.spreadsheetId;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(spreadsheetId)) {
    throw new GoogleSheetsError("Google Sheets returned an invalid spreadsheet ID.");
  }
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  await requestJson(connectors, googleSheetsPath(spreadsheetId, "/values:batchUpdate"), "POST", {
    valueInputOption: "RAW",
    data: workbookSheetDefinitions(mappings).map(({ title: sheetTitle, headers }) => ({
      range: `${quotedSheetTitle(sheetTitle)}!A1:${columnLabel(headers.length)}1`,
      values: [headers],
    })),
  });

  return { spreadsheetId, spreadsheetUrl, title };
}

export async function ensureProgramSpreadsheetTabs(
  spreadsheetId: string,
  connectors: ConnectorClient = new ReplitConnectors(),
  mappings: ProgramGoogleSheetsSheetMappings = DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
): Promise<void> {
  const metadata = await requestJson(
    connectors,
    googleSheetsPath(spreadsheetId, "?fields=sheets(properties(title))"),
    "GET",
  );
  const existingTitles = new Set(
    Array.isArray(metadata.sheets)
      ? metadata.sheets.flatMap((sheet) => {
        if (typeof sheet !== "object" || sheet === null || !("properties" in sheet)) return [];
        const properties = sheet.properties;
        return typeof properties === "object" && properties !== null && "title" in properties && typeof properties.title === "string"
          ? [properties.title]
          : [];
      })
      : [],
  );
  const missing = workbookSheetDefinitions(mappings).filter(({ title }) => !existingTitles.has(title));
  if (!missing.length) return;
  await requestJson(connectors, googleSheetsPath(spreadsheetId, ":batchUpdate"), "POST", {
    requests: missing.map(({ title }) => ({
      addSheet: { properties: { title, gridProperties: { frozenRowCount: 1, hideGridlines: true } } },
    })),
  });
  await requestJson(connectors, googleSheetsPath(spreadsheetId, "/values:batchUpdate"), "POST", {
    valueInputOption: "RAW",
    data: missing.map(({ title, headers }) => ({
      range: `${quotedSheetTitle(title)}!A1:${columnLabel(headers.length)}1`,
      values: [headers],
    })),
  });
}

export async function clearProgramSpreadsheetData(
  spreadsheetId: string,
  mappings: ProgramGoogleSheetsSheetMappings,
  connectors: ConnectorClient = new ReplitConnectors(),
): Promise<void> {
  const ranges = [
    `${quotedSheetTitle(mappings.applications)}!A:O`,
    `${quotedSheetTitle(mappings.judgingResponses)}!A:J`,
    ...PROGRAM_SNAPSHOT_SHEETS.map((sheet, index) => (
      `${quotedSheetTitle(mappings[snapshotDestinationKey(index)])}!A:${columnLabel(sheet.headers.length)}`
    )),
  ];
  await requestJson(
    connectors,
    googleSheetsPath(spreadsheetId, "/values:batchClear"),
    "POST",
    { ranges },
  );
  await requestJson(
    connectors,
    googleSheetsPath(spreadsheetId, "/values:batchUpdate"),
    "POST",
    {
      valueInputOption: "RAW",
      data: workbookSheetDefinitions(mappings).map(({ title, headers }) => ({
        range: `${quotedSheetTitle(title)}!A1:${columnLabel(headers.length)}1`,
        values: [headers],
      })),
    },
  );
}

export async function queueGoogleSheetsEvent(
  executor: SheetsExecutor,
  input: { programId: number; sourceType: SourceType; sourceId: number },
): Promise<void> {
  const [existing] = await executor.select({
    id: programGoogleSheetsSyncEventsTable.id,
    status: programGoogleSheetsSyncEventsTable.status,
    revision: programGoogleSheetsSyncEventsTable.revision,
  }).from(programGoogleSheetsSyncEventsTable)
    .where(and(
      eq(programGoogleSheetsSyncEventsTable.programId, input.programId),
      eq(programGoogleSheetsSyncEventsTable.sourceType, input.sourceType),
      eq(programGoogleSheetsSyncEventsTable.sourceId, input.sourceId),
    ))
    .limit(1).for("update");
  const now = new Date();
  if (existing) {
    await executor.update(programGoogleSheetsSyncEventsTable).set({
      revision: existing.revision + 1,
      status: existing.status === "processing" ? "processing" : "pending",
      attempts: existing.status === "processing" ? undefined : 0,
      nextAttemptAt: now,
      lastError: null,
      updatedAt: now,
    }).where(eq(programGoogleSheetsSyncEventsTable.id, existing.id));
    return;
  }

  const [connection] = await executor.select({
    programId: programGoogleSheetsConnectionsTable.programId,
    nextApplicationRow: programGoogleSheetsConnectionsTable.nextApplicationRow,
    nextJudgingResponseRow: programGoogleSheetsConnectionsTable.nextJudgingResponseRow,
  }).from(programGoogleSheetsConnectionsTable)
    .where(eq(programGoogleSheetsConnectionsTable.programId, input.programId))
    .limit(1).for("update");
  // Exporting is optional; writes to a program without a workbook remain valid.
  if (!connection) return;

  const isSnapshot = input.sourceType === "program_snapshot";
  const sheetRow = isSnapshot
    ? 2
    : input.sourceType === "application"
      ? connection.nextApplicationRow
      : connection.nextJudgingResponseRow;
  if (!isSnapshot) {
    await executor.update(programGoogleSheetsConnectionsTable).set({
      ...(input.sourceType === "application"
        ? { nextApplicationRow: sheetRow + 1 }
        : { nextJudgingResponseRow: sheetRow + 1 }),
      updatedAt: now,
    }).where(eq(programGoogleSheetsConnectionsTable.programId, input.programId));
  }
  await executor.insert(programGoogleSheetsSyncEventsTable).values({
    programId: input.programId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sheetRow,
    status: "pending",
    revision: 1,
    attempts: 0,
    nextAttemptAt: now,
  }).onConflictDoNothing();
}

export async function queueProgramGoogleSheetsSnapshot(
  executor: SheetsExecutor,
  programId: number,
  initialize = false,
): Promise<void> {
  // Existing workbooks opt in through "Sync all data" before their additional
  // tabs (including private conversations) are populated.
  if (!initialize) {
    const [enabled] = await executor.select({ id: programGoogleSheetsSyncEventsTable.id })
      .from(programGoogleSheetsSyncEventsTable).where(and(
        eq(programGoogleSheetsSyncEventsTable.programId, programId),
        eq(programGoogleSheetsSyncEventsTable.sourceType, "program_snapshot"),
      )).limit(1);
    if (!enabled) return;
  }
  await queueGoogleSheetsEvent(executor, { programId, sourceType: "program_snapshot", sourceId: programId });
}

async function insertBackfill(
  executor: SheetsExecutor,
  programId: number,
  sourceType: SourceType,
  sourceIds: number[],
): Promise<void> {
  if (!sourceIds.length) return;
  const [connection] = await executor.select({
    nextApplicationRow: programGoogleSheetsConnectionsTable.nextApplicationRow,
    nextJudgingResponseRow: programGoogleSheetsConnectionsTable.nextJudgingResponseRow,
  }).from(programGoogleSheetsConnectionsTable)
    .where(eq(programGoogleSheetsConnectionsTable.programId, programId))
    .limit(1).for("update");
  if (!connection) return;

  const nextRow = sourceType === "application" ? connection.nextApplicationRow : connection.nextJudgingResponseRow;
  await executor.update(programGoogleSheetsConnectionsTable).set({
    ...(sourceType === "application"
      ? { nextApplicationRow: nextRow + sourceIds.length }
      : { nextJudgingResponseRow: nextRow + sourceIds.length }),
    updatedAt: new Date(),
  }).where(eq(programGoogleSheetsConnectionsTable.programId, programId));

  for (let offset = 0; offset < sourceIds.length; offset += 500) {
    const values = sourceIds.slice(offset, offset + 500).map((sourceId, index) => ({
      programId,
      sourceType,
      sourceId,
      sheetRow: nextRow + offset + index,
      status: "pending",
      revision: 1,
      attempts: 0,
      nextAttemptAt: new Date(),
    }));
    await executor.insert(programGoogleSheetsSyncEventsTable).values(values).onConflictDoUpdate({
      target: [
        programGoogleSheetsSyncEventsTable.programId,
        programGoogleSheetsSyncEventsTable.sourceType,
        programGoogleSheetsSyncEventsTable.sourceId,
      ],
      set: {
        sheetRow: sql`excluded.sheet_row`,
        status: sql`CASE WHEN ${programGoogleSheetsSyncEventsTable.status} = 'processing' THEN 'processing' ELSE 'pending' END`,
        revision: sql`${programGoogleSheetsSyncEventsTable.revision} + 1`,
        nextAttemptAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      },
    });
  }
}

export async function queueProgramGoogleSheetsBackfill(
  executor: SheetsExecutor,
  programId: number,
): Promise<void> {
  const applications = await executor.select({ id: applicationsTable.id })
    .from(applicationsTable)
    .where(and(
      eq(applicationsTable.programId, programId),
      notExists(executor.select({ id: participantInvitationsTable.applicationId })
        .from(participantInvitationsTable)
        .where(eq(participantInvitationsTable.applicationId, applicationsTable.id))),
    ))
    .orderBy(asc(applicationsTable.id));
  const responses = await executor.select({ id: judgingResponsesTable.id })
    .from(judgingResponsesTable)
    .innerJoin(judgingFormsTable, eq(judgingFormsTable.id, judgingResponsesTable.formId))
    .where(eq(judgingFormsTable.programId, programId))
    .orderBy(asc(judgingResponsesTable.id));
  await insertBackfill(executor, programId, "application", applications.map(({ id }) => id));
  await insertBackfill(executor, programId, "judging_response", responses.map(({ id }) => id));
  await queueProgramGoogleSheetsSnapshot(executor, programId, true);
}

async function loadApplicationRow(sourceId: number, programId: number) {
  const [row] = await db.select({
    id: applicationsTable.id,
    programName: programsTable.name,
    businessName: applicationsTable.businessName,
    founderName: applicationsTable.founderName,
    email: applicationsTable.email,
    phone: applicationsTable.phone,
    industry: applicationsTable.industry,
    website: applicationsTable.website,
    summary: applicationsTable.summary,
    supportNeeds: applicationsTable.supportNeeds,
    status: applicationsTable.status,
    reviewNotes: applicationsTable.reviewNotes,
    businessId: applicationsTable.businessId,
    createdAt: applicationsTable.createdAt,
    reviewedAt: applicationsTable.reviewedAt,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(programsTable.id, applicationsTable.programId))
    .where(and(
      eq(applicationsTable.id, sourceId),
      eq(applicationsTable.programId, programId),
      notExists(db.select({ id: participantInvitationsTable.applicationId })
        .from(participantInvitationsTable)
        .where(eq(participantInvitationsTable.applicationId, applicationsTable.id))),
    ))
    .limit(1);
  if (!row) return null;
  return applicationSheetRow(row);
}

async function loadJudgingResponseRow(sourceId: number, programId: number) {
  const [row] = await db.select({
    id: judgingResponsesTable.id,
    formTitle: judgingFormsTable.title,
    businessName: judgingResponsesTable.businessName,
    judgeName: judgingResponsesTable.judgeName,
    judgeEmail: judgingResponsesTable.judgeEmail,
    criteria: judgingFormsTable.criteria,
    questions: judgingFormsTable.questions,
    scores: judgingResponsesTable.scores,
    answers: judgingResponsesTable.answers,
    scoreTotal: judgingResponsesTable.scoreTotal,
    maxScore: judgingResponsesTable.maxScore,
    submittedAt: judgingResponsesTable.submittedAt,
  }).from(judgingResponsesTable)
    .innerJoin(judgingFormsTable, eq(judgingFormsTable.id, judgingResponsesTable.formId))
    .where(and(eq(judgingResponsesTable.id, sourceId), eq(judgingFormsTable.programId, programId)))
    .limit(1);
  return row ? judgingResponseSheetRow(row) : null;
}

export function rowRange(
  sourceType: Exclude<SourceType, "program_snapshot">,
  row: number,
  mappings: ProgramGoogleSheetsSheetMappings,
): string {
  const title = sourceType === "application" ? mappings.applications : mappings.judgingResponses;
  const lastColumn = sourceType === "application" ? "O" : "J";
  return `${quotedSheetTitle(title)}!A${row}:${lastColumn}${row}`;
}

type ClaimedEvent = {
  id: number;
  programId: number;
  spreadsheetId: string;
  sourceType: SourceType;
  sourceId: number;
  sheetRow: number;
  revision: number;
  attempts: number;
};

async function claimBatch(limit: number): Promise<ClaimedEvent[]> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const staleClaim = new Date(now.getTime() - 10 * 60 * 1000);
    const candidates = await tx.select({
      id: programGoogleSheetsSyncEventsTable.id,
      programId: programGoogleSheetsSyncEventsTable.programId,
      sourceType: programGoogleSheetsSyncEventsTable.sourceType,
      sourceId: programGoogleSheetsSyncEventsTable.sourceId,
      sheetRow: programGoogleSheetsSyncEventsTable.sheetRow,
      revision: programGoogleSheetsSyncEventsTable.revision,
      attempts: programGoogleSheetsSyncEventsTable.attempts,
      spreadsheetId: programGoogleSheetsConnectionsTable.spreadsheetId,
    }).from(programGoogleSheetsSyncEventsTable)
      .innerJoin(programGoogleSheetsConnectionsTable, eq(
        programGoogleSheetsConnectionsTable.programId,
        programGoogleSheetsSyncEventsTable.programId,
      ))
      .where(or(
        and(
          eq(programGoogleSheetsSyncEventsTable.status, "pending"),
          lte(programGoogleSheetsSyncEventsTable.nextAttemptAt, now),
        ),
        and(
          eq(programGoogleSheetsSyncEventsTable.status, "processing"),
          lte(programGoogleSheetsSyncEventsTable.claimedAt, staleClaim),
        ),
      ))
      .orderBy(asc(programGoogleSheetsSyncEventsTable.nextAttemptAt), asc(programGoogleSheetsSyncEventsTable.id))
      .limit(limit)
      .for("update", { of: programGoogleSheetsSyncEventsTable, skipLocked: true });
    if (!candidates.length) return [];

    await tx.update(programGoogleSheetsSyncEventsTable).set({
      status: "processing",
      claimedAt: now,
      attempts: sql`${programGoogleSheetsSyncEventsTable.attempts} + 1`,
      updatedAt: now,
    }).where(inArray(programGoogleSheetsSyncEventsTable.id, candidates.map(({ id }) => id)));

    return candidates.map((event) => ({
      ...event,
      sourceType: event.sourceType === "application"
        ? "application"
        : event.sourceType === "judging_response" ? "judging_response" : "program_snapshot",
      attempts: event.attempts + 1,
    }));
  });
}

async function writeBatch(
  events: ClaimedEvent[],
  connectors: ConnectorClient,
): Promise<void> {
  const entries: { range: string; values: (string | number)[][] }[] = [];
  const snapshots = events.filter((event) => event.sourceType === "program_snapshot");
  const [exportSettings] = await db.select({
    businessTeam: programGoogleSheetsConnectionsTable.exportBusinessTeam,
    operations: programGoogleSheetsConnectionsTable.exportOperations,
    mentoringGrants: programGoogleSheetsConnectionsTable.exportMentoringGrants,
    chats: programGoogleSheetsConnectionsTable.exportChats,
    sheetMappings: programGoogleSheetsConnectionsTable.sheetMappings,
  }).from(programGoogleSheetsConnectionsTable)
    .where(eq(programGoogleSheetsConnectionsTable.programId, events[0]!.programId))
    .limit(1);
  const businessTeamEnabled = exportSettings?.businessTeam ?? true;
  const mappings = exportSettings?.sheetMappings ?? DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS;
  await ensureProgramSpreadsheetTabs(events[0]!.spreadsheetId, connectors, mappings);
  for (const event of events) {
    if (event.sourceType === "program_snapshot") continue;
    if (!businessTeamEnabled) continue;
    const values = event.sourceType === "application"
      ? await loadApplicationRow(event.sourceId, event.programId)
      : await loadJudgingResponseRow(event.sourceId, event.programId);
    if (!values) {
      throw new GoogleSheetsError("A queued source record is no longer available. The platform record is unchanged.");
    }
    entries.push({ range: rowRange(event.sourceType, event.sheetRow, mappings), values: [values] });
  }
  if (snapshots.length) {
    const categories = exportSettings ?? {
      businessTeam: true,
      operations: true,
      mentoringGrants: true,
      chats: true,
    };
    const sheets = await loadProgramSnapshotSheets(snapshots[0]!.programId, categories);
    await writeProgramSnapshotSnapshot(events[0]!.spreadsheetId, sheets, connectors, mappings);
    if (!businessTeamEnabled) {
      await requestJson(
        connectors,
        googleSheetsPath(events[0]!.spreadsheetId, "/values:batchClear"),
        "POST",
        { ranges: [
          `${quotedSheetTitle(mappings.applications)}!A2:O`,
          `${quotedSheetTitle(mappings.judgingResponses)}!A2:J`,
        ] },
      );
    }
  }
  if (!entries.length) return;
  await requestJson(
    connectors,
    googleSheetsPath(events[0]!.spreadsheetId, "/values:batchUpdate"),
    "POST",
    { valueInputOption: "RAW", data: entries },
  );
}

/**
 * Writes complete snapshots to hidden staging tabs first, then publishes all
 * managed ranges with one atomic spreadsheets.batchUpdate request. Until that
 * final request succeeds, readers continue to see the prior snapshot.
 */
export async function writeProgramSnapshotSnapshot(
  spreadsheetId: string,
  sheets: SnapshotSheetValues[],
  connectors: ConnectorClient = new ReplitConnectors(),
  mappings: ProgramGoogleSheetsSheetMappings = DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
): Promise<void> {
  if (sheets.length !== PROGRAM_SNAPSHOT_SHEETS.length
    || sheets.some((sheet, index) => sheet.title !== PROGRAM_SNAPSHOT_SHEETS[index]?.title)) {
    throw new GoogleSheetsError("The program snapshot does not match the configured workbook tabs.");
  }

  const metadataResponse = await requestJson(
    connectors,
    googleSheetsPath(spreadsheetId, "?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))"),
    "GET",
  );
  const existing = sheetMetadata(metadataResponse);
  const byTitle = new Map(existing.map((sheet) => [sheet.title, sheet]));
  const targetSheets = sheets.map((sheet, index) => {
    const title = mappings[snapshotDestinationKey(index)];
    const target = byTitle.get(title);
    if (!target) throw new GoogleSheetsError(`The Google Sheets tab “${title}” is unavailable.`);
    return target;
  });

  const stageTitles = sheets.map((_, index) => {
    snapshotStageSequence = (snapshotStageSequence + 1) % 1_000_000;
    return `${SNAPSHOT_STAGE_PREFIX}${Date.now()}_${snapshotStageSequence}_${index}`;
  });
  const stageRows = sheets.map((sheet) => sheet.rows.length + 1);
  const stageResponse = await requestJson(connectors, googleSheetsPath(spreadsheetId, ":batchUpdate"), "POST", {
    requests: sheets.map((sheet, index) => ({
      addSheet: {
        properties: {
          title: stageTitles[index],
          hidden: true,
          gridProperties: {
            rowCount: Math.max(1000, stageRows[index]!),
            columnCount: sheet.headers.length,
          },
        },
      },
    })),
  });
  const stageSheetIds = Array.isArray(stageResponse.replies)
    ? stageResponse.replies.flatMap((reply) => {
      if (typeof reply !== "object" || reply === null || !("addSheet" in reply)) return [];
      const added = reply.addSheet;
      if (typeof added !== "object" || added === null || !("properties" in added)) return [];
      const properties = added.properties;
      return typeof properties === "object" && properties !== null
        && "sheetId" in properties && typeof properties.sheetId === "number"
        ? [properties.sheetId]
        : [];
    })
    : [];
  // Some connectors omit batchUpdate replies. Resolve IDs by the unique staging
  // names so the update can still use the same atomic publish operation.
  let resolvedStageIds = stageSheetIds;
  if (resolvedStageIds.length !== sheets.length) {
    const stagedMetadata = await requestJson(
      connectors,
      googleSheetsPath(spreadsheetId, "?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))"),
      "GET",
    );
    const stagedByTitle = new Map(sheetMetadata(stagedMetadata).map((sheet) => [sheet.title, sheet.sheetId]));
    resolvedStageIds = stageTitles.flatMap((title) => {
      const id = stagedByTitle.get(title);
      return id === undefined ? [] : [id];
    });
  }
  if (resolvedStageIds.length !== sheets.length) {
    throw new GoogleSheetsError("Google Sheets did not confirm all temporary snapshot tabs.");
  }

  try {
    const valueRanges = snapshotValueRanges(sheets, stageTitles);
    for (const batch of snapshotValueBatches(valueRanges)) {
      await requestJson(
        connectors,
        googleSheetsPath(spreadsheetId, "/values:batchUpdate"),
        "POST",
        batch,
      );
    }

    const requests: object[] = [];
    for (let index = 0; index < sheets.length; index++) {
      const target = targetSheets[index]!;
      const sheet = sheets[index]!;
      const rowCount = stageRows[index]!;
      if (rowCount > target.rowCount) {
        requests.push({
          updateSheetProperties: {
            properties: { sheetId: target.sheetId, gridProperties: { rowCount } },
            fields: "gridProperties.rowCount",
          },
        });
      }
      requests.push({
        copyPaste: {
          source: {
            sheetId: resolvedStageIds[index],
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: sheet.headers.length,
          },
          destination: {
            sheetId: target.sheetId,
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: sheet.headers.length,
          },
          pasteType: "PASTE_VALUES",
        },
      });
      if (target.rowCount > rowCount) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: target.sheetId,
              startRowIndex: rowCount,
              endRowIndex: target.rowCount,
              startColumnIndex: 0,
              endColumnIndex: sheet.headers.length,
            },
            cell: {},
            fields: "userEnteredValue",
          },
        });
      }
    }
    requests.push(...resolvedStageIds.map((sheetId) => ({ deleteSheet: { sheetId } })));
    await requestJson(connectors, googleSheetsPath(spreadsheetId, ":batchUpdate"), "POST", { requests });
  } catch (error) {
    // The published tabs were not touched unless the atomic commit succeeded.
    // Remove our temporary tabs when possible; retries remain safe if Google is
    // currently unavailable and cleanup itself cannot reach the provider.
    try {
      await requestJson(connectors, googleSheetsPath(spreadsheetId, ":batchUpdate"), "POST", {
        requests: resolvedStageIds.map((sheetId) => ({ deleteSheet: { sheetId } })),
      });
    } catch {
      // Preserve the original provider error for the queued retry.
    }
    throw error;
  }
}

async function markBatchFailed(events: ClaimedEvent[], error: unknown): Promise<void> {
  const now = new Date();
  const message = error instanceof GoogleSheetsError
    ? error.message
    : "Google Sheets could not be updated. The platform records are unchanged.";
  await db.transaction(async (tx) => {
    for (const event of events) {
      const terminal = event.attempts >= 6;
      const retryDelayMs = Math.min(5 * 60_000, 15_000 * 2 ** (event.attempts - 1));
      await tx.update(programGoogleSheetsSyncEventsTable).set({
        status: terminal ? "failed" : "pending",
        claimedAt: null,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs),
        lastError: message,
        updatedAt: now,
      }).where(and(
        eq(programGoogleSheetsSyncEventsTable.id, event.id),
        eq(programGoogleSheetsSyncEventsTable.status, "processing"),
      ));
      await tx.update(programGoogleSheetsConnectionsTable).set({
        lastError: message,
        updatedAt: now,
      }).where(eq(programGoogleSheetsConnectionsTable.programId, event.programId));
    }
  });
}

async function markBatchSucceeded(events: ClaimedEvent[]): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const event of events) {
      const [current] = await tx.select({
        revision: programGoogleSheetsSyncEventsTable.revision,
      }).from(programGoogleSheetsSyncEventsTable)
        .where(eq(programGoogleSheetsSyncEventsTable.id, event.id))
        .limit(1).for("update");
      if (!current) continue;
      await tx.update(programGoogleSheetsSyncEventsTable).set({
        status: current.revision === event.revision ? "synced" : "pending",
        claimedAt: null,
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
        updatedAt: now,
      }).where(eq(programGoogleSheetsSyncEventsTable.id, event.id));
      await tx.update(programGoogleSheetsConnectionsTable).set({
        lastSyncedAt: now,
        updatedAt: now,
      }).where(eq(programGoogleSheetsConnectionsTable.programId, event.programId));
    }
    const remainingFailures = await tx.select({
      programId: programGoogleSheetsSyncEventsTable.programId,
    }).from(programGoogleSheetsSyncEventsTable)
      .where(and(
        inArray(programGoogleSheetsSyncEventsTable.programId, [...new Set(events.map(({ programId }) => programId))]),
        eq(programGoogleSheetsSyncEventsTable.status, "failed"),
      ));
    const failedPrograms = new Set(remainingFailures.map(({ programId }) => programId));
    for (const programId of new Set(events.map(({ programId }) => programId))) {
      if (!failedPrograms.has(programId)) {
        await tx.update(programGoogleSheetsConnectionsTable).set({
          lastError: null,
          updatedAt: now,
        }).where(eq(programGoogleSheetsConnectionsTable.programId, programId));
      }
    }
  });
}

export async function processGoogleSheetsSyncBatch(
  connectors: ConnectorClient = new ReplitConnectors(),
  limit = 3,
): Promise<number> {
  const events = await claimBatch(limit);
  if (!events.length) return 0;
  const groups = new Map<string, ClaimedEvent[]>();
  for (const event of events) {
    const key = `${event.programId}:${event.spreadsheetId}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  let processed = 0;
  for (const group of groups.values()) {
    try {
      await writeBatch(group, connectors);
      await markBatchSucceeded(group);
      processed += group.length;
    } catch (error) {
      await markBatchFailed(group, error);
      logger.warn({
        programId: group[0]?.programId,
        events: group.length,
        status: error instanceof GoogleSheetsError ? error.status : undefined,
      }, "Google Sheets records need attention");
    }
  }
  return processed;
}

export async function retryFailedGoogleSheetsEvents(programId: number): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [connection] = await tx.select({ programId: programGoogleSheetsConnectionsTable.programId })
      .from(programGoogleSheetsConnectionsTable)
      .where(eq(programGoogleSheetsConnectionsTable.programId, programId))
      .limit(1);
  if (!connection) throw new GoogleSheetsError("Connect a Google spreadsheet for this program first.", 404);
    await tx.update(programGoogleSheetsSyncEventsTable).set({
      status: "pending",
      attempts: 0,
      claimedAt: null,
      nextAttemptAt: now,
      lastError: null,
      updatedAt: now,
    }).where(and(
      eq(programGoogleSheetsSyncEventsTable.programId, programId),
      inArray(programGoogleSheetsSyncEventsTable.status, ["failed", "pending"]),
    ));
    await tx.update(programGoogleSheetsConnectionsTable).set({
      lastError: null,
      updatedAt: now,
    }).where(eq(programGoogleSheetsConnectionsTable.programId, programId));
  });
}

let workerRunning = false;
let nextSnapshotRefreshAt = Date.now() + 5 * 60_000;
export async function refreshEnabledProgramSnapshots(): Promise<void> {
  const enabled = await db.select({ programId: programGoogleSheetsSyncEventsTable.programId })
    .from(programGoogleSheetsSyncEventsTable)
    .innerJoin(programGoogleSheetsConnectionsTable,
      eq(programGoogleSheetsSyncEventsTable.programId, programGoogleSheetsConnectionsTable.programId))
    .innerJoin(programsTable, eq(programGoogleSheetsSyncEventsTable.programId, programsTable.id))
    .where(and(
      eq(programGoogleSheetsSyncEventsTable.sourceType, "program_snapshot"),
      eq(programGoogleSheetsSyncEventsTable.status, "synced"),
    ));
  for (const { programId } of enabled) {
    await db.transaction((tx) => queueProgramGoogleSheetsSnapshot(tx, programId));
  }
}

export function startGoogleSheetsSyncWorker(): void {
  const tick = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      if (Date.now() >= nextSnapshotRefreshAt) {
        await refreshEnabledProgramSnapshots();
        nextSnapshotRefreshAt = Date.now() + 5 * 60_000;
      }
      await processGoogleSheetsSyncBatch();
    } catch (error) {
      logger.warn({ err: error }, "Google Sheets sync worker is unavailable; form submissions remain in the platform.");
    } finally {
      workerRunning = false;
    }
  };
  void tick();
  setInterval(() => void tick(), 10_000).unref();
}
