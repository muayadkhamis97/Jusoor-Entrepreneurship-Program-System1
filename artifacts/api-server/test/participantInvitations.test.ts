import assert from "node:assert/strict";
import test from "node:test";
import { db, participantInvitationsTable } from "@workspace/db";
import {
  getExpiredAdminInvitedApplicationIds,
  getParticipantInvitationStatus,
  isParticipantInvitationExpired,
} from "../src/lib/participantInvitations";

test("participant invitation expiry is inclusive at the deadline and rejects invalid dates", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");

  assert.equal(isParticipantInvitationExpired(new Date("2026-10-17T11:59:59.999Z"), now), true);
  assert.equal(isParticipantInvitationExpired(now, now), true);
  assert.equal(isParticipantInvitationExpired(new Date("2026-10-17T12:00:00.001Z"), now), false);
  assert.equal(isParticipantInvitationExpired(new Date(Number.NaN), now), true);
});

test("linked participants remain active while unlinked expired invitations are marked expired", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  const expired = new Date("2026-10-17T11:59:00.000Z");

  assert.equal(getParticipantInvitationStatus("clerk-user", expired, now), "active");
  assert.equal(getParticipantInvitationStatus(null, expired, now), "expired");
  assert.equal(getParticipantInvitationStatus(null, new Date("2026-10-18T12:00:00.000Z"), now), "pending");
});

test("expired application lookup is restricted to the matching invitation rows", async () => {
  const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
  let selectedTable: unknown;
  let queryText: unknown;

  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      const query = {
        from(table: unknown) {
          selectedTable = table;
          return query;
        },
        where(condition: unknown) {
          queryText = condition;
          return query;
        },
        then(resolve: (rows: { applicationId: number }[]) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve([{ applicationId: 11 }]).then(resolve, reject);
        },
      };
      return query;
    },
  });

  try {
    const expired = await getExpiredAdminInvitedApplicationIds([11, 12], new Date("2026-10-17T12:00:00Z"));
    assert.deepEqual([...expired], [11]);
    assert.equal(selectedTable, participantInvitationsTable);
    assert.ok(queryText);
  } finally {
    if (originalSelect) Object.defineProperty(db, "select", originalSelect);
    else Reflect.deleteProperty(db, "select");
  }
});
