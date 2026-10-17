import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import type { RequestHandler } from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  db,
  applicationsTable,
  participantInvitationsTable,
  sessionsTable,
  sessionInteractiveActivitiesTable,
} = await import("@workspace/db");
const { createApp } = await import("../src/app");
const { createRequireParticipant } = await import("../src/middlewares/participantAccess");

type Row = Record<string, unknown>;
let server: Server;
let currentEnrollment: Row | null = null;
let sessionProgramId = 8;
let hasExpiredInvitation = false;
let applicationSelectCount = 0;
let linkedDuringRequest = false;
let restoreSelect: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;

function rowsFor(selection: unknown, table: unknown): Row[] {
  if (table === applicationsTable) {
    if (selection && typeof selection === "object" && Object.keys(selection).length === 1 && "id" in selection) {
      applicationSelectCount += 1;
      if (applicationSelectCount === 1) return [{ id: 5 }];
      return linkedDuringRequest ? [{ id: 5 }] : [];
    }
    return currentEnrollment?.status === "accepted" && currentEnrollment.programId === sessionProgramId
      ? [currentEnrollment]
      : [];
  }
  if (table === participantInvitationsTable) {
    return hasExpiredInvitation ? [{ applicationId: 5 }] : [];
  }
  if (table === sessionsTable) {
    return [{ id: 71, programId: sessionProgramId, status: "scheduled", title: "Session" }];
  }
  if (table === sessionInteractiveActivitiesTable) return [];
  return [];
}

function replaceDbMethod(
  name: "select" | "update",
  replacement: (...args: never[]) => unknown,
): () => void {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, {
    configurable: true,
    writable: true,
    value: replacement,
  });
  return () => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  };
}

const noOpClerkMiddleware: RequestHandler = (_req, _res, next) => next();
const testParticipantAccess = createRequireParticipant(
  (req) => req.header("x-test-user"),
  async () => "founder@example.com",
);

before(async () => {
  restoreSelect = replaceDbMethod("select", ((selection: unknown) => {
    let selectedTable: unknown;
    const query = {
      from(table: unknown) {
        selectedTable = table;
        return query;
      },
      where() { return query; },
      orderBy() { return query; },
      limit(limit: number) {
        return Promise.resolve(rowsFor(selection, selectedTable).slice(0, limit));
      },
      then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rowsFor(selection, selectedTable)).then(resolve, reject);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  restoreUpdate = replaceDbMethod("update", (() => {
    const query = {
      set() { return query; },
      where() {
        linkedDuringRequest = true;
        return query;
      },
      then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve([]).then(resolve, reject);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  server = createServer(createApp({
    authenticationMiddleware: noOpClerkMiddleware,
    participantMiddleware: testParticipantAccess,
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

beforeEach(() => {
  currentEnrollment = {
    id: 5,
    businessId: 100,
    programId: 8,
    status: "accepted",
  };
  sessionProgramId = 8;
  hasExpiredInvitation = false;
  applicationSelectCount = 0;
  linkedDuringRequest = false;
});

after(async () => {
  restoreSelect?.();
  restoreUpdate?.();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function requestActivities(userId?: string) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/participant/sessions/71/interactive-activities`, {
    headers: userId ? { "x-test-user": userId } : {},
  });
}

test("the production app composition rejects anonymous session interaction requests", async () => {
  const response = await requestActivities();
  const body = await response.text();
  assert.equal(response.status, 401, body);
});

test("the production app composition allows an accepted participant in the session program", async () => {
  const response = await requestActivities("accepted-user");
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.deepEqual(JSON.parse(body), { activities: [] });
});

test("the production app composition rejects an unaccepted applicant", async () => {
  currentEnrollment = { id: 5, businessId: 100, programId: 8, status: "pending" };
  const response = await requestActivities("unaccepted-user");
  const body = await response.text();
  assert.equal(response.status, 403, body);
});

test("the production app composition rejects an accepted participant from another program", async () => {
  sessionProgramId = 9;
  const response = await requestActivities("cross-program-user");
  const body = await response.text();
  assert.equal(response.status, 403, body);
});

test("expired admin invitations are not linked during verified-email participant sign-in", async () => {
  hasExpiredInvitation = true;
  const response = await requestActivities("expired-invite-user");
  const body = await response.text();

  assert.equal(response.status, 403, body);
  assert.equal(linkedDuringRequest, false, "an expired invitation must not be attached to the account");
});
