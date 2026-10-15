import assert from "node:assert/strict";
import { test } from "node:test";
import { filterAssignedTrainerPrograms } from "../src/lib/trainer-programs";

test("trainer program labels are limited to program ids already authorized for the trainer", () => {
  const assignedPrograms = filterAssignedTrainerPrograms([12, 31], [
    { id: 12, name: "Jusoor Growth Lab 2026" },
    { id: 22, name: "Unassigned Program" },
    { id: 31, name: "Women in Tech Cohort" },
  ]);
  assert.deepEqual(assignedPrograms, [
    { id: 12, name: "Jusoor Growth Lab 2026" },
    { id: 31, name: "Women in Tech Cohort" },
  ]);
});
