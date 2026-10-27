import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PROGRAM_GOOGLE_SHEETS_EXPORT_CATEGORIES,
  filterProgramSnapshotSheetsByCategories,
  PROGRAM_SNAPSHOT_SHEETS,
} from "../src/lib/googleSheetsSnapshots";

const snapshots = PROGRAM_SNAPSHOT_SHEETS.map(({ title, headers }) => ({
  title,
  headers,
  rows: [[title]],
}));

test("all four currently selected categories retain their snapshot rows by default", () => {
  const filtered = filterProgramSnapshotSheetsByCategories(snapshots, DEFAULT_PROGRAM_GOOGLE_SHEETS_EXPORT_CATEGORIES);
  assert.deepEqual(filtered.map(({ rows }) => rows.length), [1, 1, 1, 1]);
});

test("each category setting independently clears only its matching snapshot tab", () => {
  const filtered = filterProgramSnapshotSheetsByCategories(snapshots, {
    businessTeam: false,
    operations: true,
    mentoringGrants: false,
    chats: true,
  });

  assert.deepEqual(filtered.map(({ rows }) => rows.length), [0, 1, 0, 1]);
  assert.deepEqual(filtered.map(({ headers }) => headers), snapshots.map(({ headers }) => headers));
});
