import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  db,
  programBrandingTable,
  programsTable,
  staffMembersTable,
  staffProgramAssignmentsTable,
  staffProgramRolesTable,
} = await import("@workspace/db");
const { default: staffRouter } = await import("../src/routes/staff");

type StaffMember = {
  id: number;
  email: string;
  role: "coordinator" | "staff" | "trainer" | "mentor" | "judge";
  status: "invited" | "active";
  invitationEmailStatus: "pending" | "delivered" | "failed" | null;
  createdAt: Date;
};

const staffMembers: StaffMember[] = [];
const staffAssignments: { staffId: number; programId: number; assignedByStaffId: number }[] = [];
const insertAttempts: unknown[] = [];
let nextStaffId = 1;
let server: Server;
const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
const originalUpdate = Object.getOwnPropertyDescriptor(db, "update");
const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
const originalConnectorProxy = ReplitConnectors.prototype.proxy;

let connectorCalls: { path: string; method?: string; body?: unknown }[] = [];
let sendMessageIds: string[] = [];
let successfulDeliveries: string[] = [];
let failNextSend = true;

function missingRoleTable(): Error & { code: string } {
  return Object.assign(
    new Error('relation "jusoor_staff_program_roles" does not exist'),
    { code: "42P01" },
  );
}

function rowsFor(table: unknown): Record<string, unknown>[] {
  if (table === programBrandingTable) {
    return [{
      brandName: "Program Hub",
      logoUrl: null,
      primaryColor: "#28665a",
      accentColor: "#d98a46",
    }];
  }
  if (table === programsTable) return [{ id: 4, name: "Spring founders", archivedAt: null }];
  if (table === staffMembersTable) return staffMembers;
  if (table === staffProgramAssignmentsTable) return staffAssignments;
  if (table === staffProgramRolesTable) throw missingRoleTable();
  return [];
}

function queryFor(table: unknown) {
  const query = {
    from(nextTable: unknown) {
      table = nextTable;
      return query;
    },
    where() {
      return query;
    },
    orderBy() {
      return query;
    },
    limit() {
      return Promise.resolve(rowsFor(table));
    },
    then(
      resolve: (rows: Record<string, unknown>[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) {
      try {
        return Promise.resolve(rowsFor(table)).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    },
  };
  return query;
}

async function postRetryInvitation(staffId: number): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/staff/${staffId}/retry-invitation-email`, {
    method: "POST",
  });
}

async function postResendInvitation(staffId: number, body: unknown): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/staff/${staffId}/resend-invitation-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function resetState() {
  staffMembers.length = 0;
  staffAssignments.length = 0;
  insertAttempts.length = 0;
  connectorCalls = [];
  sendMessageIds = [];
  successfulDeliveries = [];
  nextStaffId = 1;
  failNextSend = true;
}

before(async () => {
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => queryFor(undefined),
  });
  Object.defineProperty(db, "update", {
    configurable: true,
    writable: true,
    value: (table: unknown) => ({
      set(values: Record<string, unknown>) {
        return {
          where() {
            return {
              returning: async () => {
                const rows = rowsFor(table);
                for (const row of rows) Object.assign(row, values);
                return rows;
              },
            };
          },
        };
      },
    }),
  });
  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: any) => Promise<unknown>) => callback({
      insert(table: unknown) {
        return {
          values(values: unknown) {
            if (table === staffMembersTable) {
              insertAttempts.push(values);
              return {
                onConflictDoNothing() {
                  return {
                    returning: async () => {
                      const value = values as Omit<StaffMember, "id" | "createdAt">;
                      if (staffMembers.some(member => member.email === value.email)) return [];
                      const member: StaffMember = {
                        ...value,
                        id: nextStaffId++,
                        createdAt: new Date("2026-10-17T12:00:00.000Z"),
                      };
                      staffMembers.push(member);
                      return [member];
                    },
                  };
                },
              };
            }
            if (table === staffProgramAssignmentsTable) {
              staffAssignments.push(...values as typeof staffAssignments);
            }
            return Promise.resolve([]);
          },
        };
      },
    }),
  });

  ReplitConnectors.prototype.proxy = async function (_connector, path, options) {
    connectorCalls.push({ path, method: options?.method, body: options?.body });
    if (path.endsWith("/profile")) {
      return new Response(JSON.stringify({ emailAddress: "platform@example.test" }));
    }
    if (path.includes("/messages?")) {
      return new Response(JSON.stringify({}));
    }
    if (path.endsWith("/messages/send")) {
      assert.ok(
        staffMembers[0]?.invitationEmailStatus === "pending" ||
          staffMembers[0]?.invitationEmailStatus === "delivered" ||
          staffMembers[0]?.invitationEmailStatus === null,
        "new invitations are pending while explicit resends preserve the recorded status",
      );
      const raw = (options?.body as { raw: string }).raw;
      const decoded = Buffer.from(raw, "base64url").toString("utf8");
      const messageId = decoded.match(/^Message-ID: <([^>]+)>/m)?.[1];
      assert.ok(messageId);
      sendMessageIds.push(messageId);
      if (failNextSend) {
        failNextSend = false;
        return new Response(JSON.stringify({ error: "temporary send failure" }), { status: 503 });
      }
      successfulDeliveries.push(messageId);
      return new Response(JSON.stringify({ id: "delivered-message" }));
    }
    throw new Error(`Unexpected Gmail request: ${path}`);
  };

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.staff = { id: 2, email: "admin@example.test", role: "coordinator" };
    next();
  });
  app.use("/api", staffRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  if (originalSelect) Object.defineProperty(db, "select", originalSelect);
  else Reflect.deleteProperty(db, "select");
  if (originalUpdate) Object.defineProperty(db, "update", originalUpdate);
  else Reflect.deleteProperty(db, "update");
  if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
  else Reflect.deleteProperty(db, "transaction");
  ReplitConnectors.prototype.proxy = originalConnectorProxy;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

async function postInvitation(body: unknown): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/staff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("program-staff invitation survives a missing specialist-role table and retries after email failure", async () => {
  resetState();

  const invite = {
    email: "Program.Staff@example.test",
    role: "staff",
    programIds: [4],
  };
  const firstResponse = await postInvitation(invite);
  assert.equal(firstResponse.status, 503);
  assert.match((await firstResponse.json()).error, /access was saved.*could not be sent/i);
  assert.equal(staffMembers.length, 1);
  assert.equal(staffMembers[0]?.email, "program.staff@example.test");
  assert.equal(staffMembers[0]?.invitationEmailStatus, "failed");
  assert.deepEqual(staffAssignments, [{ staffId: 1, programId: 4, assignedByStaffId: 2 }]);

  const listAfterFailure = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/staff`);
  assert.equal(listAfterFailure.status, 200);
  assert.equal((await listAfterFailure.json())[0].invitationEmailStatus, "failed");

  const retryResponse = await postRetryInvitation(1);
  assert.equal(retryResponse.status, 200, JSON.stringify({
    response: await retryResponse.clone().json(),
    connectorCalls,
    sendMessageIds,
    failNextSend,
  }));
  const result = await retryResponse.json();
  assert.equal(result.id, 1);
  assert.equal(result.role, "staff");
  assert.equal(result.invitationEmailStatus, "delivered");
  assert.deepEqual(result.programIds, [4]);
  assert.equal(staffMembers.length, 1, "retry must reuse the existing staff-access row");
  assert.equal(insertAttempts.length, 1, "retrying email must not create another staff-access row");
  assert.equal(
    connectorCalls.filter(call => call.path.endsWith("/messages/send")).length,
    2,
    "the failed delivery is retried once",
  );
  assert.equal(successfulDeliveries.length, 1, "only one invitation is delivered successfully");
  assert.equal(sendMessageIds.length, 2);
  assert.equal(sendMessageIds[0], sendMessageIds[1], "retry must reuse the same delivery identity");
  assert.equal(successfulDeliveries[0], sendMessageIds[0]);
  const lookupCalls = connectorCalls.filter(call => call.path.includes("/messages?"));
  assert.equal(lookupCalls.length, 2);

  const duplicateInviteResponse = await postInvitation(invite);
  assert.equal(duplicateInviteResponse.status, 200);
  assert.equal((await duplicateInviteResponse.json()).invitationEmailStatus, "delivered");
  assert.equal(staffMembers.length, 1);
  assert.equal(
    connectorCalls.filter(call => call.path.endsWith("/messages/send")).length,
    2,
    "repeating a delivered invitation must not send another message",
  );
});

test("specialist-role invitation clearly reports the missing role schema before saving access", async () => {
  resetState();

  const response = await postInvitation({
    email: "mentor@example.test",
    role: "mentor",
    programIds: [4],
  });

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /program role database update/i);
  assert.equal(staffMembers.length, 0);
  assert.equal(insertAttempts.length, 0);
  assert.equal(connectorCalls.length, 0);
});

test("Admin can resend a delivered staff invitation without changing access status", async () => {
  resetState();
  failNextSend = false;
  staffMembers.push({
    id: 8,
    email: "mentor@example.test",
    role: "mentor",
    status: "invited",
    invitationEmailStatus: "delivered",
    createdAt: new Date("2026-10-17T12:00:00.000Z"),
  });

  const response = await postResendInvitation(8, {
    requestId: "3e1346e6-b86f-4b7a-8f2a-521932ea1cc0",
  });
  const result = await response.json();

  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.invitationEmailStatus, "delivered");
  assert.equal(staffMembers[0]?.invitationEmailStatus, "delivered");
  assert.equal(sendMessageIds.length, 1);
  assert.equal(successfulDeliveries.length, 1);
  assert.match(sendMessageIds[0] ?? "", /^[0-9a-f]{64}@platform\.invalid$/);
});

test("Admin can resend a legacy staff invitation without a recorded delivery status", async () => {
  resetState();
  failNextSend = false;
  staffMembers.push({
    id: 9,
    email: "legacy.staff@example.test",
    role: "staff",
    status: "invited",
    invitationEmailStatus: null,
    createdAt: new Date("2026-10-17T12:00:00.000Z"),
  });

  const response = await postResendInvitation(9, {
    requestId: "a7fb6a6b-3f8b-4615-91a9-5290b7682a21",
  });
  const result = await response.json();

  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.invitationEmailStatus, null);
  assert.equal(successfulDeliveries.length, 1);
});
