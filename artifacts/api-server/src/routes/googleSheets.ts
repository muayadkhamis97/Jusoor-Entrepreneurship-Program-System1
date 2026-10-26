import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  integrationDisconnectAuditEventsTable,
  programsTable,
  programGoogleSheetsConnectionsTable,
  programGoogleSheetsSyncEventsTable,
} from "@workspace/db";
import { activeProgramIdsFor, canAccessActiveProgram } from "../lib/programScope";
import {
  createProgramSpreadsheet,
  GoogleSheetsError,
  lockGoogleSheetsProgram,
  queueProgramGoogleSheetsBackfill,
  retryFailedGoogleSheetsEvents,
} from "../lib/googleSheetsSync";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";

const router = Router();

function routeError(res: import("express").Response, error: unknown): void {
  const status = error instanceof GoogleSheetsError && error.status
    ? (error.status === 404 ? 404 : 502)
    : 503;
  const message = error instanceof GoogleSheetsError
    ? error.message
    : "Google Sheets settings could not be saved. The platform records are unchanged.";
  res.status(status).json({ error: message });
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
    return { ...row, ...count, status };
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

router.post("/:programId", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const programId = Number(req.params.programId);
  if (!Number.isSafeInteger(programId) || programId <= 0 || !(await canAccessActiveProgram(staff, programId))) {
    res.status(404).json({ error: "Program not found." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize setup across concurrent requests/instances so one program cannot
      // accidentally receive multiple workbooks from a double click or retry.
      await lockGoogleSheetsProgram(tx, programId);
      const [existing] = await tx.select().from(programGoogleSheetsConnectionsTable)
        .where(eq(programGoogleSheetsConnectionsTable.programId, programId)).limit(1);
      if (existing) return { connection: existing, created: false };
      const [program] = await tx.select({ id: programsTable.id, name: programsTable.name })
        .from(programsTable).where(and(eq(programsTable.id, programId), sql`${programsTable.archivedAt} IS NULL`))
        .limit(1);
      if (!program) throw new GoogleSheetsError("Program not found.", 404);

      const spreadsheet = await createProgramSpreadsheet(program.name);
      const [connection] = await tx.insert(programGoogleSheetsConnectionsTable).values({
        programId,
        spreadsheetId: spreadsheet.spreadsheetId,
        spreadsheetUrl: spreadsheet.spreadsheetUrl,
        spreadsheetTitle: spreadsheet.title,
        connectedByStaffId: staff.id,
      }).returning();
      await queueProgramGoogleSheetsBackfill(tx, programId);
      return { connection: connection!, created: true };
    });
    const statuses = await visibleProgramSheetStatuses(staff);
    const status = statuses.find((item) => item.programId === programId);
    res.status(result.created ? 201 : 200).json(status ?? {
      programId,
      spreadsheetId: result.connection.spreadsheetId,
      spreadsheetUrl: result.connection.spreadsheetUrl,
      spreadsheetTitle: result.connection.spreadsheetTitle,
      connectedAt: result.connection.connectedAt,
      lastSyncedAt: result.connection.lastSyncedAt,
      lastError: result.connection.lastError,
      pendingCount: 0,
      failedCount: 0,
      status: "connected",
    });
  } catch (error) {
    if (error instanceof GoogleSheetsError && error.status === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    req.log.error({ err: error, programId }, "Google Sheets connection could not be created");
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
