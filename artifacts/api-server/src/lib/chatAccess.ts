import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { applicationsTable, businessesTable, db, participantBusinessMembershipsTable, programsTable } from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import { activeProgramIdsFor } from "./programScope";

export type ChatActor = { kind: "staff"; staff: StaffAccess } | { kind: "participant"; participant: ParticipantAccess };
export type ChatTarget = { programId: number; programName: string; kind: "private" | "business"; targetId: number; name: string };
export type ChatExecutor = Pick<typeof db, "select" | "selectDistinct" | "insert" | "update">;

export function chatActorKey(actor: ChatActor): string {
  return actor.kind === "staff" ? `staff:${actor.staff.id}` : `participant:${actor.participant.userId}`;
}

export function targetForThread(
  targets: readonly ChatTarget[],
  thread: { programId: number; kind: string; participantId: number | null; businessId: number | null },
): ChatTarget | undefined {
  return targets.find(target => target.programId === thread.programId && target.kind === thread.kind
    && target.targetId === (thread.kind === "private" ? thread.participantId : thread.businessId));
}

// Re-evaluate current acceptance, active program assignments and business
// membership for every operation. Thread creation never grants lasting access.
export async function chatTargets(actor: ChatActor, executor: ChatExecutor = db): Promise<ChatTarget[]> {
  const activeIds = actor.kind === "staff" ? await activeProgramIdsFor(actor.staff) : null;
  if (activeIds?.length === 0) return [];
  const privateRows = await executor.select({
    id: applicationsTable.id, name: applicationsTable.founderName,
    programId: programsTable.id, programName: programsTable.name,
  }).from(applicationsTable)
    .innerJoin(programsTable, eq(applicationsTable.programId, programsTable.id))
    .where(and(
      eq(applicationsTable.status, "accepted"),
      isNotNull(applicationsTable.clerkUserId),
      isNull(programsTable.archivedAt),
      actor.kind === "participant"
        ? eq(applicationsTable.clerkUserId, actor.participant.userId)
        : inArray(programsTable.id, activeIds!),
    ));
  const businessRows = actor.kind === "staff"
    ? await executor.select({ id: businessesTable.id, name: businessesTable.businessName, programId: programsTable.id, programName: programsTable.name })
      .from(businessesTable).innerJoin(programsTable, eq(businessesTable.programId, programsTable.id))
      .where(and(isNull(programsTable.archivedAt), inArray(programsTable.id, activeIds!)))
    : await executor.selectDistinct({
      id: businessesTable.id, name: businessesTable.businessName,
      programId: programsTable.id, programName: programsTable.name,
    }).from(applicationsTable)
      .leftJoin(participantBusinessMembershipsTable, eq(participantBusinessMembershipsTable.applicationId, applicationsTable.id))
      .innerJoin(businessesTable, and(
        eq(businessesTable.programId, applicationsTable.programId),
        or(
          eq(businessesTable.id, applicationsTable.businessId),
          and(isNull(applicationsTable.businessId), eq(businessesTable.id, participantBusinessMembershipsTable.businessId)),
        ),
      ))
      .innerJoin(programsTable, eq(programsTable.id, applicationsTable.programId))
      .where(and(
        eq(applicationsTable.clerkUserId, actor.participant.userId),
        eq(applicationsTable.status, "accepted"), isNull(programsTable.archivedAt),
      ));
  return [
    ...privateRows.map(row => ({ programId: row.programId, programName: row.programName, kind: "private" as const, targetId: row.id, name: row.name })),
    ...businessRows.map(row => ({ programId: row.programId, programName: row.programName, kind: "business" as const, targetId: row.id, name: row.name })),
  ];
}
