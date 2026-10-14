import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageProgramAssignments,
  resolveProgramSpecialistRoles,
} from "../src/lib/programAssignmentAuthorization";

test("admins can manage active programs regardless of assignment list", () => {
  assert.equal(canManageProgramAssignments("coordinator", [], 12, true), true);
});

test("project staff can manage only active programs assigned to them", () => {
  assert.equal(canManageProgramAssignments("staff", [12, 18], 12, true), true);
  assert.equal(canManageProgramAssignments("staff", [12, 18], 13, true), false);
  assert.equal(canManageProgramAssignments("staff", [12], 12, false), false);
});

test("specialists cannot use the program staff assignment surface", () => {
  assert.equal(canManageProgramAssignments("trainer", [12], 12, true), false);
  assert.equal(canManageProgramAssignments("mentor", [12], 12, true), false);
  assert.equal(canManageProgramAssignments("judge", [12], 12, true), false);
});

test("explicit per-program specialist roles do not inherit the primary role elsewhere", () => {
  assert.deepEqual(
    resolveProgramSpecialistRoles("trainer", [12, 13], [
      { programId: 12, role: "trainer" },
      { programId: 12, role: "mentor" },
    ], true),
    [
      { programId: 12, role: "trainer" },
      { programId: 12, role: "mentor" },
    ],
  );
});

test("legacy primary-role access is used only before the role table exists", () => {
  assert.deepEqual(
    resolveProgramSpecialistRoles("trainer", [12, 13], [], false),
    [
      { programId: 12, role: "trainer" },
      { programId: 13, role: "trainer" },
    ],
  );
  assert.deepEqual(resolveProgramSpecialistRoles("trainer", [12, 13], [], true), []);
});
