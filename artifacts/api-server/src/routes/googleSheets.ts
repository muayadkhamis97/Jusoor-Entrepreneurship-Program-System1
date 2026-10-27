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
  ensureProgramSpreadsheetTabs,
  GoogleSheetsError,
  lockGoogleSheetsProgram,
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
      if (existing) {
        await ensureProgramSpreadsheetTabs(existing.spreadsheetId);
        await queueProgramGoogleSheetsSnapshot(tx, programId, true);
        return { connection: existing, created: false };
      }
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
      exportCategories: {
        businessTeam: result.connection.exportBusinessTeam,
        operations: result.connection.exportOperations,
        mentoringGrants: result.connection.exportMentoringGrants,
        chats: result.connection.exportChats,
      },
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
