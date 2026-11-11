import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  CreateProgramGoogleSheetsConnectionBody,
  GetProgramGoogleSheetsDestinationHistoryParams,
  GetProgramGoogleSheetsDestinationHistoryResponse,
  ListProgramGoogleSheetsWorkbookTabsParams,
  ListProgramGoogleSheetsWorkbookTabsResponse,
  ListProgramGoogleSheetsWorkbooksParams,
  ListProgramGoogleSheetsWorkbooksQueryParams,
  ListProgramGoogleSheetsWorkbooksResponse,
  UpdateProgramGoogleSheetsSheetMappingsBody,
} from "@workspace/api-zod";
import {
  db,
  DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
  integrationDisconnectAuditEventsTable,
  programsTable,
  programGoogleSheetsConnectionsTable,
  programGoogleSheetsDestinationHistoryTable,
  programGoogleSheetsSyncEventsTable,
  type ProgramGoogleSheetsSheetMappings,
} from "@workspace/db";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import {
  clearProgramSpreadsheetData,
  createProgramSpreadsheet,
  ensureProgramSpreadsheetTabs,
  getProgramSpreadsheetInfo,
  GoogleSheetsError,
  isValidGoogleSheetsSheetMappings,
  lockGoogleSheetsProgram,
  listGoogleSheetsWorkbooks,
  listProgramSpreadsheetTabs,
  queueProgramGoogleSheetsBackfill,
  queueProgramGoogleSheetsSnapshot,
  retryFailedGoogleSheetsEvents,
} from "../lib/googleSheetsSync";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";

const router = Router();
type ExportCategories = {
  businessTeam: boolean;
  operations: boolean;
  mentoringGrants: boolean;
  chats: boolean;
};

const defaultExportCategories: ExportCategories = {
  businessTeam: true,
  operations: true,
  mentoringGrants: true,
  chats: true,
};

function parseExportCategories(value: unknown): ExportCategories | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = ["businessTeam", "operations", "mentoringGrants", "chats"];
  if (Object.keys(record).length !== keys.length || keys.some((key) => typeof record[key] !== "boolean")) return null;
  return {
    businessTeam: record.businessTeam as boolean,
    operations: record.operations as boolean,
    mentoringGrants: record.mentoringGrants as boolean,
    chats: record.chats as boolean,
  };
}

function routeError(res: import("express").Response, error: unknown): void {
  const status = error instanceof GoogleSheetsError && error.status
    ? ([400, 404, 409].includes(error.status) ? error.status : 502)
    : 503;
  const message = error instanceof GoogleSheetsError
    ? error.message
    : "Google Sheets settings could not be saved. The platform records are unchanged.";
  res.status(status).json({ error: message });
}

function normalizeSheetMappings(mappings: ProgramGoogleSheetsSheetMappings): ProgramGoogleSheetsSheetMappings {
  return Object.fromEntries(
    Object.entries(mappings).map(([key, title]) => [key, title.trim()]),
  ) as ProgramGoogleSheetsSheetMappings;
}

function requireProgramScope(programIdValue: unknown): number | null {
  const programId = Number(programIdValue);
  return Number.isSafeInteger(programId) && programId > 0 ? programId : null;
}

function validateMappingsExist(
  mappings: ProgramGoogleSheetsSheetMappings,
  tabs: { title: string }[],
): void {
  const titles = new Set(tabs.map((tab) => tab.title));
  const missing = Object.values(mappings).filter((title) => !titles.has(title));
  if (missing.length) {
    throw new GoogleSheetsError(
      `Choose worksheet tabs that already exist in this spreadsheet. Missing: ${missing.join(", ")}.`,
      400,
    );
  }
}

async function visibleProgramSheetStatuses(staff: StaffAccess) {
  const programIds = await activeProgramIdsFor(staff);
  if (!programIds.length) return [];
  const rows = await db.select({
    programId: programsTable.id,
    programName: programsTable.name,
    spreadsheetId: programGoogleSheetsConnectionsTable.spreadsheetId,
    spreadsheetUrl: programGoogleSheetsConnectionsTable.spreadsheetUrl,
    spreadsheetTitle: programGoogleSheetsConnectionsTable.spreadsheetTitle,
    sheetMappings: programGoogleSheetsConnectionsTable.sheetMappings,
    exportBusinessTeam: programGoogleSheetsConnectionsTable.exportBusinessTeam,
    exportOperations: programGoogleSheetsConnectionsTable.exportOperations,
    exportMentoringGrants: programGoogleSheetsConnectionsTable.exportMentoringGrants,
    exportChats: programGoogleSheetsConnectionsTable.exportChats,
    connectedAt: programGoogleSheetsConnectionsTable.connectedAt,
    lastSyncedAt: programGoogleSheetsConnectionsTable.lastSyncedAt,
    lastError: programGoogleSheetsConnectionsTable.lastError,
  }).from(programsTable)
    .leftJoin(programGoogleSheetsConnectionsTable, eq(
      programGoogleSheetsConnectionsTable.programId,
      programsTable.id,
    ))
    .where(inArray(programsTable.id, programIds))
    .orderBy(programsTable.name);
  const counts = await db.select({
    programId: programGoogleSheetsSyncEventsTable.programId,
    status: programGoogleSheetsSyncEventsTable.status,
    count: sql<number>`count(*)::int`,
  }).from(programGoogleSheetsSyncEventsTable)
    .where(inArray(programGoogleSheetsSyncEventsTable.programId, programIds))
    .groupBy(programGoogleSheetsSyncEventsTable.programId, programGoogleSheetsSyncEventsTable.status);
  const countByProgram = new Map<number, { pendingCount: number; failedCount: number }>();
  for (const row of counts) {
    const count = countByProgram.get(row.programId) ?? { pendingCount: 0, failedCount: 0 };
    if (row.status === "pending" || row.status === "processing") count.pendingCount += row.count;
    if (row.status === "failed") count.failedCount += row.count;
    countByProgram.set(row.programId, count);
  }
  return rows.map((row) => {
    const count = countByProgram.get(row.programId) ?? { pendingCount: 0, failedCount: 0 };
    const status = !row.spreadsheetId
      ? "not_connected"
      : row.lastError || count.failedCount > 0
        ? "needs_attention"
        : count.pendingCount > 0
          ? "syncing"
          : "connected";
    return {
      ...row,
      ...count,
      status,
      exportCategories: row.spreadsheetId ? {
        businessTeam: row.exportBusinessTeam,
        operations: row.exportOperations,
        mentoringGrants: row.exportMentoringGrants,
        chats: row.exportChats,
      } : defaultExportCategories,
      sheetMappings: row.sheetMappings ?? DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS,
    };
  });
}

router.get("/", async (_req, res): Promise<void> => {
  try {
    res.json(await visibleProgramSheetStatuses(res.locals.staff as StaffAccess));
  } catch (error) {
    _req.log.error({ err: error }, "Google Sheets status could not be loaded");
    res.status(503).json({ error: "Google Sheets status could not be loaded." });
  }
});

router.get("/:programId/destination-history", requireCoordinator, async (req, res): Promise<void> => {
  const params = GetProgramGoogleSheetsDestinationHistoryParams.safeParse(req.params);
  if (!params.success || !requireProgramScope(params.data.programId)) {
    res.status(400).json({ error: "Invalid program id." });
    return;
  }
  try {
    const [program] = await db.select({ id: programsTable.id })
      .from(programsTable)
      .where(eq(programsTable.id, params.data.programId))
      .limit(1);
    if (!program) {
      res.status(404).json({ error: "Program not found." });
      return;
    }
    const history = await db.select().from(programGoogleSheetsDestinationHistoryTable)
      .where(eq(programGoogleSheetsDestinationHistoryTable.programId, params.data.programId))
      .orderBy(desc(programGoogleSheetsDestinationHistoryTable.createdAt), desc(programGoogleSheetsDestinationHistoryTable.id));
    res.json(GetProgramGoogleSheetsDestinationHistoryResponse.parse(history));
  } catch (error) {
    req.log.error({ err: error, programId: params.data.programId }, "Google Sheets destination history could not be loaded");
    res.status(503).json({ error: "Google Sheets destination history could not be loaded." });
  }
});

router.get("/:programId/workbooks", async (req, res): Promise<void> => {
  const params = ListProgramGoogleSheetsWorkbooksParams.safeParse(req.params);
  const query = ListProgramGoogleSheetsWorkbooksQueryParams.safeParse(req.query);
  const staff = res.locals.staff as StaffAccess;
  if (!params.success || !query.success || !(await canAccessActiveProgram(staff, params.data.programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  try {
    const workbooks = await listGoogleSheetsWorkbooks({
      search: query.data.q,
      pageToken: query.data.pageToken,
    });
    res.json(ListProgramGoogleSheetsWorkbooksResponse.parse(workbooks));
  } catch (error) {
    req.log.error({ err: error, programId: params.data.programId }, "Google Drive spreadsheets could not be listed");
    routeError(res, error);
  }
});

router.get("/:programId/workbooks/:spreadsheetId/tabs", async (req, res): Promise<void> => {
  const params = ListProgramGoogleSheetsWorkbookTabsParams.safeParse(req.params);
  const staff = res.locals.staff as StaffAccess;
  if (!params.success || !(await canAccessActiveProgram(staff, params.data.programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  try {
    const tabs = await listProgramSpreadsheetTabs(params.data.spreadsheetId);
    res.json(ListProgramGoogleSheetsWorkbookTabsResponse.parse(tabs));
  } catch (error) {
    req.log.error({ err: error, programId: params.data.programId }, "Google Sheets worksheet tabs could not be listed");
    routeError(res, error);
  }
});

router.post("/:programId", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programId = requireProgramScope(req.params.programId);
  if (!programId || !(await canAccessActiveProgram(staff, programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }

  const hasBody = Boolean(req.body && typeof req.body === "object" && Object.keys(req.body).length > 0);
  const parsedBody = hasBody ? CreateProgramGoogleSheetsConnectionBody.safeParse(req.body) : null;
  if (parsedBody && !parsedBody.success) {
    res.status(400).json({ error: "Choose a workbook type and all six destination worksheet tabs." });
    return;
  }
  const selection = parsedBody?.success ? parsedBody.data : undefined;
  const requestedMappings = selection?.sheetMappings
    ? normalizeSheetMappings(selection.sheetMappings)
    : DEFAULT_PROGRAM_GOOGLE_SHEETS_SHEET_MAPPINGS;
  if (!isValidGoogleSheetsSheetMappings(requestedMappings)) {
    res.status(400).json({ error: "Choose six different worksheet names, each between 1 and 100 characters." });
    return;
  }
  if (selection?.mode === "existing" && (!selection.spreadsheetId || selection.confirmedOverwrite !== true)) {
    res.status(400).json({ error: "Confirm that the selected worksheet data can be replaced before linking this spreadsheet." });
    return;
  }
  if (selection?.mode === "create" && selection.spreadsheetId) {
    res.status(400).json({ error: "A new workbook cannot include an existing spreadsheet ID." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize setup across concurrent requests/instances so one program cannot
      // accidentally receive multiple workbooks from a double click or retry.
      await lockGoogleSheetsProgram(tx, programId);
      const [existing] = await tx.select().from(programGoogleSheetsConnectionsTable)
        .where(eq(programGoogleSheetsConnectionsTable.programId, programId)).limit(1);
      if (existing && !selection) {
        await ensureProgramSpreadsheetTabs(existing.spreadsheetId, undefined, existing.sheetMappings);
        await queueProgramGoogleSheetsSnapshot(tx, programId, true);
        return { connection: existing, created: false };
      }
      const [program] = await tx.select({ id: programsTable.id, name: programsTable.name })
        .from(programsTable).where(and(eq(programsTable.id, programId), sql`${programsTable.archivedAt} IS NULL`))
        .limit(1);
      if (!program) throw new GoogleSheetsError("Program not found.", 404);

      let spreadsheet: { spreadsheetId: string; spreadsheetUrl: string; title: string };
      if (selection?.mode === "existing") {
        await ensureProgramSpreadsheetTabs(selection.spreadsheetId!, undefined, requestedMappings);
        const info = await getProgramSpreadsheetInfo(selection.spreadsheetId!, undefined);
        validateMappingsExist(requestedMappings, info.tabs);
        spreadsheet = {
          spreadsheetId: selection.spreadsheetId!,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(selection.spreadsheetId!)}/edit`,
          title: info.title,
        };
        const [alreadyLinked] = await tx.select({
          programId: programGoogleSheetsConnectionsTable.programId,
        }).from(programGoogleSheetsConnectionsTable)
          .where(eq(programGoogleSheetsConnectionsTable.spreadsheetId, spreadsheet.spreadsheetId))
          .limit(1);
        if (alreadyLinked && alreadyLinked.programId !== programId) {
          throw new GoogleSheetsError("This spreadsheet is already linked to another program.", 409);
        }
        const destinationChanged = existing?.spreadsheetId !== spreadsheet.spreadsheetId
          || JSON.stringify(existing.sheetMappings) !== JSON.stringify(requestedMappings);
        if (destinationChanged) {
          await clearProgramSpreadsheetData(spreadsheet.spreadsheetId, requestedMappings);
        }
      } else {
        spreadsheet = await createProgramSpreadsheet(program.name, undefined, requestedMappings);
      }

      let connection = existing;
      if (connection) {
        const [updated] = await tx.update(programGoogleSheetsConnectionsTable).set({
          spreadsheetId: spreadsheet.spreadsheetId,
          spreadsheetUrl: spreadsheet.spreadsheetUrl,
          spreadsheetTitle: spreadsheet.title,
          sheetMappings: requestedMappings,
          nextApplicationRow: 2,
          nextJudgingResponseRow: 2,
          lastError: null,
          updatedAt: new Date(),
        }).where(eq(programGoogleSheetsConnectionsTable.programId, programId)).returning();
        connection = updated;
      } else {
        const [created] = await tx.insert(programGoogleSheetsConnectionsTable).values({
          programId,
          spreadsheetId: spreadsheet.spreadsheetId,
          spreadsheetUrl: spreadsheet.spreadsheetUrl,
          spreadsheetTitle: spreadsheet.title,
          sheetMappings: requestedMappings,
          connectedByStaffId: staff.id,
        }).returning();
        connection = created;
      }
      const destinationChanged = existing?.spreadsheetId !== spreadsheet.spreadsheetId
        || JSON.stringify(existing?.sheetMappings ?? null) !== JSON.stringify(requestedMappings);
      if (destinationChanged) {
        await tx.insert(programGoogleSheetsDestinationHistoryTable).values({
          programId,
          programName: program.name,
          actorStaffId: staff.id,
          actorEmail: staff.email,
          previousSpreadsheetId: existing?.spreadsheetId ?? null,
          previousSpreadsheetTitle: existing?.spreadsheetTitle ?? null,
          previousSheetMappings: existing?.sheetMappings ?? null,
          newSpreadsheetId: spreadsheet.spreadsheetId,
          newSpreadsheetTitle: spreadsheet.title,
          newSheetMappings: requestedMappings,
        });
      }
      await queueProgramGoogleSheetsBackfill(tx, programId);
      await queueProgramGoogleSheetsSnapshot(tx, programId, true);
      return { connection: connection!, created: !existing };
    });
    const statuses = await visibleProgramSheetStatuses(staff);
    const status = statuses.find((item) => item.programId === programId);
    res.status(result.created ? 201 : 200).json(status ?? {
      programId,
      spreadsheetId: result.connection.spreadsheetId,
      spreadsheetUrl: result.connection.spreadsheetUrl,
      spreadsheetTitle: result.connection.spreadsheetTitle,
      sheetMappings: result.connection.sheetMappings,
      connectedAt: result.connection.connectedAt,
      lastSyncedAt: result.connection.lastSyncedAt,
      lastError: result.connection.lastError,
      pendingCount: 0,
      failedCount: 0,
      status: "connected",
      exportCategories: {
        businessTeam: result.connection.exportBusinessTeam,
        operations: result.connection.exportOperations,
        mentoringGrants: result.connection.exportMentoringGrants,
        chats: result.connection.exportChats,
      },
    });
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.status && [400, 404, 409].includes(error.status)) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: error, programId }, "Google Sheets connection could not be created");
    routeError(res, error);
  }
});

router.patch("/:programId/categories", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programId = Number(req.params.programId);
  if (!Number.isSafeInteger(programId) || programId <= 0 || !(await canAccessActiveProgram(staff, programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  const exportCategories = parseExportCategories(req.body?.exportCategories);
  if (!exportCategories) {
    res.status(400).json({ error: "Choose a true or false value for each export category." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await lockGoogleSheetsProgram(tx, programId);
      const [connection] = await tx.select({
        exportBusinessTeam: programGoogleSheetsConnectionsTable.exportBusinessTeam,
      }).from(programGoogleSheetsConnectionsTable)
        .where(eq(programGoogleSheetsConnectionsTable.programId, programId))
        .limit(1);
      if (!connection) throw new GoogleSheetsError("Program workbook not found.", 404);

      await tx.update(programGoogleSheetsConnectionsTable).set({
        exportBusinessTeam: exportCategories.businessTeam,
        exportOperations: exportCategories.operations,
        exportMentoringGrants: exportCategories.mentoringGrants,
        exportChats: exportCategories.chats,
        updatedAt: new Date(),
      }).where(eq(programGoogleSheetsConnectionsTable.programId, programId));

      if (!connection.exportBusinessTeam && exportCategories.businessTeam) {
        await queueProgramGoogleSheetsBackfill(tx, programId);
      } else {
        await queueProgramGoogleSheetsSnapshot(tx, programId, true);
      }
    });
    const statuses = await visibleProgramSheetStatuses(staff);
    res.json(statuses.find((item) => item.programId === programId) ?? {
      programId,
      exportCategories,
    });
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.status === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    req.log.error({ err: error, programId }, "Google Sheets export categories could not be saved");
    routeError(res, error);
  }
});

router.patch("/:programId/sheet-mappings", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programId = requireProgramScope(req.params.programId);
  if (!programId || !(await canAccessActiveProgram(staff, programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  const parsed = UpdateProgramGoogleSheetsSheetMappingsBody.safeParse(req.body);
  if (!parsed.success || parsed.data.confirmedOverwrite !== true
    || !isValidGoogleSheetsSheetMappings(parsed.data.sheetMappings)) {
    res.status(400).json({ error: "Confirm replacement of the selected worksheet data and choose six different tab names." });
    return;
  }
  const sheetMappings = normalizeSheetMappings(parsed.data.sheetMappings);
  if (!isValidGoogleSheetsSheetMappings(sheetMappings)) {
    res.status(400).json({ error: "Choose six different worksheet names, each between 1 and 100 characters." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await lockGoogleSheetsProgram(tx, programId);
      const [connection] = await tx.select({
        spreadsheetId: programGoogleSheetsConnectionsTable.spreadsheetId,
        spreadsheetTitle: programGoogleSheetsConnectionsTable.spreadsheetTitle,
        sheetMappings: programGoogleSheetsConnectionsTable.sheetMappings,
      }).from(programGoogleSheetsConnectionsTable)
        .where(eq(programGoogleSheetsConnectionsTable.programId, programId))
        .limit(1);
      if (!connection) throw new GoogleSheetsError("Program workbook not found.", 404);
      await ensureProgramSpreadsheetTabs(connection.spreadsheetId, undefined, sheetMappings);
      const info = await getProgramSpreadsheetInfo(connection.spreadsheetId);
      validateMappingsExist(sheetMappings, info.tabs);
      const changed = JSON.stringify(connection.sheetMappings) !== JSON.stringify(sheetMappings);
      if (changed) {
        await clearProgramSpreadsheetData(connection.spreadsheetId, sheetMappings);
      }
      await tx.update(programGoogleSheetsConnectionsTable).set({
        sheetMappings,
        spreadsheetTitle: info.title,
        nextApplicationRow: 2,
        nextJudgingResponseRow: 2,
        lastError: null,
        updatedAt: new Date(),
      }).where(eq(programGoogleSheetsConnectionsTable.programId, programId));
      if (changed) {
        const [program] = await tx.select({ name: programsTable.name })
          .from(programsTable)
          .where(eq(programsTable.id, programId))
          .limit(1);
        if (!program) throw new GoogleSheetsError("Program not found.", 404);
        await tx.insert(programGoogleSheetsDestinationHistoryTable).values({
          programId,
          programName: program.name,
          actorStaffId: staff.id,
          actorEmail: staff.email,
          previousSpreadsheetId: connection.spreadsheetId,
          previousSpreadsheetTitle: connection.spreadsheetTitle,
          previousSheetMappings: connection.sheetMappings,
          newSpreadsheetId: connection.spreadsheetId,
          newSpreadsheetTitle: info.title,
          newSheetMappings: sheetMappings,
        });
      }
      await queueProgramGoogleSheetsBackfill(tx, programId);
      await queueProgramGoogleSheetsSnapshot(tx, programId, true);
    });
    const statuses = await visibleProgramSheetStatuses(staff);
    res.json(statuses.find((item) => item.programId === programId) ?? { programId, status: "connected", sheetMappings });
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.status && [400, 404, 409].includes(error.status)) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: error, programId }, "Google Sheets worksheet mappings could not be saved");
    routeError(res, error);
  }
});

router.delete("/:programId", requireCoordinator, async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programId = Number(req.params.programId);
  if (!Number.isSafeInteger(programId) || programId <= 0) {
    res.status(400).json({ error: "Invalid program id." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await lockGoogleSheetsProgram(tx, programId);
      const [connection] = await tx.select({ programId: programGoogleSheetsConnectionsTable.programId })
        .from(programGoogleSheetsConnectionsTable)
        .where(eq(programGoogleSheetsConnectionsTable.programId, programId))
        .limit(1);
      if (!connection) throw new GoogleSheetsError("Program workbook not found.", 404);
      const [program] = await tx.select({ name: programsTable.name })
        .from(programsTable)
        .where(eq(programsTable.id, programId))
        .limit(1);
      if (!program) throw new GoogleSheetsError("Program not found.", 404);
      await tx.delete(programGoogleSheetsConnectionsTable)
        .where(eq(programGoogleSheetsConnectionsTable.programId, programId));
      await tx.insert(integrationDisconnectAuditEventsTable).values({
        integrationType: "program_google_sheets",
        initiatorType: "admin",
        actorStaffId: staff.id,
        actorEmail: staff.email,
        affectedStaffId: null,
        affectedAccountEmail: null,
        programId,
        programName: program.name,
      });
    });
    req.log.info({ programId }, "Coordinator unlinked a program Google Sheets workbook");
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.status === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    req.log.error({ err: error, programId }, "Google Sheets workbook could not be disconnected");
    routeError(res, error);
  }
});

router.post("/:programId/sync", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programId = Number(req.params.programId);
  if (!Number.isSafeInteger(programId) || programId <= 0 || !(await canAccessActiveProgram(staff, programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  try {
    await retryFailedGoogleSheetsEvents(programId);
    const statuses = await visibleProgramSheetStatuses(staff);
    res.json(statuses.find((item) => item.programId === programId) ?? { programId, status: "not_connected" });
  } catch (error) {
    routeError(res, error);
  }
});

export default router;
