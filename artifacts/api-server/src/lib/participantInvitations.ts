import { inArray } from "drizzle-orm";
import { db, participantInvitationsTable } from "@workspace/db";

function isMissingInvitationTable(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "42P01",
  );
}

export async function getAdminInvitedApplicationIds(applicationIds?: number[]): Promise<Set<number>> {
  if (applicationIds && applicationIds.length === 0) return new Set();
  try {
    const records = applicationIds
      ? await db.select({ applicationId: participantInvitationsTable.applicationId })
        .from(participantInvitationsTable)
        .where(inArray(participantInvitationsTable.applicationId, applicationIds))
      : await db.select({ applicationId: participantInvitationsTable.applicationId })
        .from(participantInvitationsTable);
    return new Set(records.map(({ applicationId }) => applicationId));
  } catch (error) {
    if (isMissingInvitationTable(error)) return new Set();
    throw error;
  }
}
