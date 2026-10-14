import assert from "node:assert/strict";
import test from "node:test";
import { makeBusinessTeamAuditEvent, makeStaffRoleAuditEvent } from "../src/lib/staffAssignmentAudit";

const baseContext = {
  programId: 4,
  programName: "Spring founders",
  actorStaffId: 2,
  actorEmail: "admin@example.com",
  affectedStaffId: 8,
  affectedAccountEmail: "mentor@example.com",
  applicationId: null,
  affectedApplicationName: null,
};

test("staff role audit events retain actor, program, account, and sorted before/after roles", () => {
  assert.deepEqual(
    makeStaffRoleAuditEvent(baseContext, ["mentor"], ["judge", "trainer"]),
    {
      ...baseContext,
      assignmentType: "staff_roles",
      previousValue: { roles: ["mentor"] },
      newValue: { roles: ["judge", "trainer"] },
    },
  );
});

test("unchanged staff roles do not produce an audit event", () => {
  assert.equal(makeStaffRoleAuditEvent(baseContext, ["trainer", "mentor"], ["mentor", "trainer"]), null);
});

test("business team audit events capture prior and new business identities and avoid no-op events", () => {
  const context = {
    ...baseContext,
    affectedStaffId: null,
    affectedAccountEmail: null,
    applicationId: 91,
    affectedApplicationName: "Founder name",
  };
  assert.deepEqual(
    makeBusinessTeamAuditEvent(context, { id: 12, name: "Old business" }, { id: 17, name: "New business" }),
    {
      ...context,
      assignmentType: "business_team",
      previousValue: { businessId: 12, businessName: "Old business" },
      newValue: { businessId: 17, businessName: "New business" },
    },
  );
  assert.equal(makeBusinessTeamAuditEvent(context, { id: 12, name: "Old name" }, { id: 12, name: "Current name" }), null);
});
