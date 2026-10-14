import type { InsertStaffAssignmentAuditEvent } from "@workspace/db";

type AuditContext = Pick<
  InsertStaffAssignmentAuditEvent,
  | "programId"
  | "programName"
  | "actorStaffId"
  | "actorEmail"
  | "affectedStaffId"
  | "affectedAccountEmail"
  | "applicationId"
  | "affectedApplicationName"
>;

export function makeStaffRoleAuditEvent(
  context: AuditContext,
  previousRoles: string[],
  newRoles: string[],
): InsertStaffAssignmentAuditEvent | null {
  const previous = [...new Set(previousRoles)].sort();
  const next = [...new Set(newRoles)].sort();
  if (JSON.stringify(previous) === JSON.stringify(next)) return null;
  return {
    ...context,
    assignmentType: "staff_roles",
    previousValue: { roles: previous },
    newValue: { roles: next },
  };
}

export function makeBusinessTeamAuditEvent(
  context: AuditContext,
  previousBusiness: { id: number | null; name: string | null },
  newBusiness: { id: number | null; name: string | null },
): InsertStaffAssignmentAuditEvent | null {
  if (previousBusiness.id === newBusiness.id) return null;
  return {
    ...context,
    assignmentType: "business_team",
    previousValue: { businessId: previousBusiness.id, businessName: previousBusiness.name },
    newValue: { businessId: newBusiness.id, businessName: newBusiness.name },
  };
}
