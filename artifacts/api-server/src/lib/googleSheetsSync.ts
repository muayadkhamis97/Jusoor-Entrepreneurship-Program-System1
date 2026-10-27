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

type ConnectorClient = Pick<ReplitConnectors, "proxy">;
type SheetsExecutor = Pick<typeof db, "select" | "insert" | "update">;
type SourceType = "application" | "judging_response" | "program_snapshot";
type GoogleSheetsResponse = Awaited<ReturnType<ConnectorClient["proxy"]>>;

export class GoogleSheetsError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GoogleSheetsError";
  }
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

export async function createProgramSpreadsheet(
  programName: string,
  connectors: ConnectorClient = new ReplitConnectors(),
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const title = `${programName.slice(0, 180)} — Program records`;
  const created = await requestJson(connectors, "/v4/spreadsheets", "POST", {
    properties: { title },
    sheets: [
      { properties: { title: APPLICATIONS_SHEET, gridProperties: { frozenRowCount: 1, hideGridlines: true } } },
      { properties: { title: JUDGING_RESPONSES_SHEET, gridProperties: { frozenRowCount: 1, hideGridlines: true } } },
      ...PROGRAM_SNAPSHOT_SHEETS.map(({ title }) => ({
        properties: { title, gridProperties: { frozenRowCount: 1, hideGridlines: true } },
      })),
    ],
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
    data: [
      { range: `${APPLICATIONS_SHEET}!A1:O1`, values: [APPLICATION_HEADERS] },
      { range: `'${JUDGING_RESPONSES_SHEET}'!A1:J1`, values: [JUDGING_HEADERS] },
      ...PROGRAM_SNAPSHOT_SHEETS.map(({ title, headers }) => ({
        range: `'${title}'!A1:${String.fromCharCode(64 + headers.length)}1`,
        values: [headers],
      })),
    ],
  });

  return { spreadsheetId, spreadsheetUrl, title };
}

export async function ensureProgramSpreadsheetTabs(
  spreadsheetId: string,
  connectors: ConnectorClient = new ReplitConnectors(),
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
  const missing = PROGRAM_SNAPSHOT_SHEETS.filter(({ title }) => !existingTitles.has(title));
  if (!missing.length) return;
  await requestJson(connectors, googleSheetsPath(spreadsheetId, ":batchUpdate"), "POST", {
    requests: missing.map(({ title }) => ({
      addSheet: { properties: { title, gridProperties: { frozenRowCount: 1, hideGridlines: true } } },
    })),
  });
  await requestJson(connectors, googleSheetsPath(spreadsheetId, "/values:batchUpdate"), "POST", {
    valueInputOption: "RAW",
    data: missing.map(({ title, headers }) => ({
      range: `'${title}'!A1:${String.fromCharCode(64 + headers.length)}1`,
      values: [headers],
    })),
  });
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

function rowRange(sourceType: SourceType, row: number): string {
  if (sourceType === "program_snapshot") throw new Error("Snapshot events do not use row-level ranges.");
  return sourceType === "application" ? `${APPLICATIONS_SHEET}!A${row}:O${row}` : `'${JUDGING_RESPONSES_SHEET}'!A${row}:J${row}`;
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
  for (const event of events) {
    if (event.sourceType === "program_snapshot") continue;
    const values = event.sourceType === "application"
      ? await loadApplicationRow(event.sourceId, event.programId)
      : await loadJudgingResponseRow(event.sourceId, event.programId);
    if (!values) {
      throw new GoogleSheetsError("A queued source record is no longer available. The platform record is unchanged.");
    }
    entries.push({ range: rowRange(event.sourceType, event.sheetRow), values: [values] });
  }
  if (snapshots.length) {
    await ensureProgramSpreadsheetTabs(events[0]!.spreadsheetId, connectors);
    const sheets = await loadProgramSnapshotSheets(snapshots[0]!.programId);
    const ranges = PROGRAM_SNAPSHOT_SHEETS.map(({ title, headers }) => `'${title}'!A2:${String.fromCharCode(64 + headers.length)}`);
    await requestJson(connectors, googleSheetsPath(events[0]!.spreadsheetId, "/values:batchClear"), "POST", { ranges });
    for (const sheet of sheets) {
      entries.push({
        range: `'${sheet.title}'!A1:${String.fromCharCode(64 + sheet.headers.length)}${sheet.rows.length + 1}`,
        values: [[...sheet.headers], ...sheet.rows],
      });
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
