import assert from "node:assert/strict";
import test from "node:test";
import { isValidProgramTimeZone } from "../src/lib/program-time-zone";

test("program time zones accept valid IANA identifiers", () => {
  assert.equal(isValidProgramTimeZone("Asia/Amman"), true);
  assert.equal(isValidProgramTimeZone("America/Los_Angeles"), true);
  assert.equal(isValidProgramTimeZone("UTC"), true);
});

test("program time zones reject invalid and oversized values", () => {
  assert.equal(isValidProgramTimeZone("Mars/Olympus_Mons"), false);
  assert.equal(isValidProgramTimeZone(""), false);
  assert.equal(isValidProgramTimeZone("x".repeat(101)), false);
  assert.equal(isValidProgramTimeZone("+05:00"), false);
  assert.equal(isValidProgramTimeZone("-03"), false);
  assert.equal(isValidProgramTimeZone(null), false);
});
