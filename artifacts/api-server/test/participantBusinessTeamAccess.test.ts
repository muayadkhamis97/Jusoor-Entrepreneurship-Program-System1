import assert from "node:assert/strict";
import test from "node:test";
import { participantBusinessTeamMembers } from "../src/lib/participantBusinessTeamAccess";

test("team roster includes only same-program members and returns no private fields", () => {
  const members = participantBusinessTeamMembers(
    { businessId: 7, programId: 4 },
    [
      { applicationId: 11, programId: 4, primaryBusinessId: null, membershipBusinessId: 7, founderName: "Amina", clerkUserId: "user-1" },
      { applicationId: 12, programId: 4, primaryBusinessId: 7, membershipBusinessId: null, founderName: "Sami", clerkUserId: "user-2" },
      { applicationId: 13, programId: 5, primaryBusinessId: null, membershipBusinessId: 7, founderName: "Other program", clerkUserId: "user-3" },
      { applicationId: 14, programId: 4, primaryBusinessId: 8, membershipBusinessId: 7, founderName: "Different business", clerkUserId: "user-4" },
    ],
    "user-1",
  );

  assert.deepEqual(members, [
    { founderName: "Amina", isYou: true },
    { founderName: "Sami", isYou: false },
  ]);
  assert.deepEqual(Object.keys(members[0]).sort(), ["founderName", "isYou"]);
});
