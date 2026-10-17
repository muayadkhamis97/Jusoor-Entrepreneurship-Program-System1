import { and, inArray, lte } from "drizzle-orm";
import { db, participantInvitationsTable } from "@workspace/db";

export function isParticipantInvitationExpired(expiresAt: Date, now = new Date()): boolean {
  const expiry = expiresAt.getTime();
  return !Number.isFinite(expiry) || expiry <= now.getTime();
}

export function getParticipantInvitationStatus(
  clerkUserId: string | null,
  expiresAt: Date,
  now = new Date(),
): "pending" | "active" | "expired" {
  if (clerkUserId) return "active";
  return isParticipantInvitationExpired(expiresAt, now) ? "expired" : "pending";
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
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "42P01"
    ) return new Set();
    throw error;
  }
}

export async function getExpiredAdminInvitedApplicationIds(
  applicationIds: number[],
  now = new Date(),
): Promise<Set<number>> {
  if (!applicationIds.length) return new Set();
  try {
    const records = await db.select({ applicationId: participantInvitationsTable.applicationId })
      .from(participantInvitationsTable)
      .where(and(
        inArray(participantInvitationsTable.applicationId, applicationIds),
        lte(participantInvitationsTable.expiresAt, now),
      ));
    return new Set(records.map(({ applicationId }) => applicationId));
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "42P01"
    ) return new Set();
    throw error;
  }
}
