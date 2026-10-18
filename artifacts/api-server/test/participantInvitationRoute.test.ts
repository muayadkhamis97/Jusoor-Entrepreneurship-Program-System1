import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  applicationsTable,
  businessesTable,
  db,
  participantBusinessMembershipsTable,
  participantInvitationsTable,
  programBrandingTable,
  programsTable,
} = await import("@workspace/db");
const { default: participantInvitationsRouter } = await import("../src/routes/participantInvitations");

const business = {
  id: 21,
  programId: 8,
  businessName: "Northwind",
  industry: "Food",
};
let server: Server;
let selectedBusinessId = business.id;
let businessAvailable = true;
let invitationSchemaMissing = false;
let duplicateApplication = false;
let existingInvitationMissing = false;
let applicationValues: Record<string, unknown> | undefined;
let membershipValues: Record<string, unknown> | undefined;
let invitationValues: Record<string, unknown> | undefined;
let sentMessages: string[] = [];
const originalSelect = Object.getOwnPropertyDescriptor(db, "select");
const originalTransaction = Object.getOwnPropertyDescriptor(db, "transaction");
const originalConnectorProxy = ReplitConnectors.prototype.proxy;

before(async () => {
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      let table: unknown;
      const query = {
        from(nextTable: unknown) {
          table = nextTable;
          return query;
        },
        innerJoin() {
          return query;
        },
        where() {
          return query;
        },
        for() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit() {
          if (table === participantInvitationsTable && invitationSchemaMissing) {
            return Promise.reject(Object.assign(new Error("missing invitation table"), { code: "42P01" }));
          }
          return Promise.resolve(rowsFor(table));
        },
        then(resolve: (rows: Record<string, unknown>[]) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve(rowsFor(table)).then(resolve, reject);
        },
      };
      return query;
    },
  });

  Object.defineProperty(db, "transaction", {
    configurable: true,
    writable: true,
    value: async (callback: (tx: any) => Promise<unknown>) => callback({
      select() {
        let table: unknown;
        const query = {
          from(nextTable: unknown) {
            table = nextTable;
            return query;
          },
          where() {
            return query;
          },
          limit() {
            return query;
          },
          for() {
            return query;
          },
          then(resolve: (rows: Record<string, unknown>[]) => unknown, reject?: (error: unknown) => unknown) {
            return Promise.resolve(rowsForTransaction(table)).then(resolve, reject);
          },
        };
        return query;
      },
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            return {
              where() {
                if (table === participantInvitationsTable && invitationValues) {
                  invitationValues = { ...invitationValues, ...values };
                }
                return {
                  returning: async () => [{
                    createdAt: invitationValues?.createdAt,
                    expiresAt: invitationValues?.expiresAt,
                  }],
                };
              },
            };
          },
        };
      },
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            if (table === applicationsTable) {
              applicationValues = values;
              return {
                onConflictDoNothing() {
                  return {
                    returning: async () => duplicateApplication ? [] : [{
                      id: 51,
                      email: values.email,
                      participantName: values.founderName,
                      programId: values.programId,
                      businessId: values.businessId,
                      createdAt: values.createdAt,
                    }],
                  };
                },
              };
            }
            if (table === participantBusinessMembershipsTable) {
              membershipValues = values;
              return { onConflictDoNothing: async () => undefined };
            }
            if (table === participantInvitationsTable) {
              invitationValues = values;
              return {
                returning: async () => [{
                  createdAt: values.createdAt,
                  expiresAt: values.expiresAt,
                }],
              };
            }
            throw new Error("Unexpected insert target.");
          },
        };
      },
    }),
  });

  ReplitConnectors.prototype.proxy = async function (_connector, path, options) {
    if (path.endsWith("/profile")) {
      return new Response(JSON.stringify({ emailAddress: "platform@example.test" }));
    }
    if (path.includes("/messages?")) {
      const query = new URL(`https://test.invalid${path}`).searchParams.get("q") ?? "";
      const messageId = query.match(/rfc822msgid:([^\s]+)/)?.[1];
      const alreadySent = messageId && sentMessages.some(message => message.includes(`Message-ID: <${messageId}>`));
      return new Response(JSON.stringify({ messages: alreadySent ? [{ id: "sent" }] : [] }));
    }
    if (path.endsWith("/messages/send")) {
      const raw = (options?.body as { raw: string }).raw;
      sentMessages.push(Buffer.from(raw, "base64url").toString("utf8"));
      return new Response(JSON.stringify({ id: "sent" }));
    }
    throw new Error(`Unexpected Gmail request: ${path}`);
  };

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.staff = { id: 6, email: "admin@example.test", role: "coordinator" };
    next();
  });
  app.use("/api", participantInvitationsRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
});

beforeEach(() => {
  selectedBusinessId = business.id;
  businessAvailable = true;
  invitationSchemaMissing = false;
  duplicateApplication = false;
  existingInvitationMissing = false;
  applicationValues = undefined;
  membershipValues = undefined;
  invitationValues = undefined;
  sentMessages = [];
});

after(async () => {
  if (originalSelect) Object.defineProperty(db, "select", originalSelect);
  else Reflect.deleteProperty(db, "select");
  if (originalTransaction) Object.defineProperty(db, "transaction", originalTransaction);
  else Reflect.deleteProperty(db, "transaction");
  ReplitConnectors.prototype.proxy = originalConnectorProxy;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function rowsFor(table: unknown): Record<string, unknown>[] {
  if (table === programBrandingTable) {
    return [{
      brandName: "Program Hub",
      logoUrl: null,
      primaryColor: "#28665a",
      accentColor: "#d98a46",
    }];
  }
  if (table === businessesTable) {
    return businessAvailable && selectedBusinessId === business.id ? [business] : [];
  }
  if (table === programsTable) return [{ name: "Spring Program" }];
  return [];
}

function rowsForTransaction(table: unknown): Record<string, unknown>[] {
  if (!duplicateApplication || !applicationValues) return [];
  if (table === applicationsTable) {
    return [{
      id: 51,
      email: applicationValues.email,
      participantName: applicationValues.founderName,
      programId: applicationValues.programId,
      businessId: applicationValues.businessId,
      clerkUserId: null,
    }];
  }
  if (table === participantInvitationsTable && !existingInvitationMissing && invitationValues) {
    return [{
      createdAt: invitationValues.createdAt,
      expiresAt: invitationValues.expiresAt,
    }];
  }
  if (table === participantBusinessMembershipsTable && membershipValues) {
    return [{ businessId: membershipValues.businessId }];
  }
  return [];
}

async function invite(body: unknown): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/staff/participant-invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Admin invitation creates a 30-day program/business assignment and emails that participant", async () => {
  const response = await invite({
    email: "New.Participant@example.test",
    displayName: "New Participant",
    businessId: business.id,
    programId: 999,
  });
  const result = await response.json();

  assert.equal(response.status, 201, JSON.stringify(result));
  assert.equal(result.email, "new.participant@example.test");
  assert.equal(result.programId, business.programId, "program scope must come from the selected business");
  assert.equal(result.businessId, business.id);
  assert.equal(result.status, "pending");
  assert.ok(Math.abs(new Date(result.expiresAt).getTime() - Date.now() - 30 * 24 * 60 * 60 * 1000) < 5_000);
  assert.equal(applicationValues?.programId, business.programId);
  assert.equal(applicationValues?.businessId, business.id);
  assert.equal(membershipValues?.applicationId, 51);
  assert.equal(membershipValues?.businessId, business.id);
  assert.equal(invitationValues?.applicationId, 51);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0] ?? "", /^To: new\.participant@example\.test$/m);
  const encodedText = sentMessages[0]
    ?.split('Content-Type: text/plain; charset="UTF-8"')[1]
    ?.split("\r\n\r\n")[1]
    ?.split("\r\n--")[0]
    ?.replace(/\r\n/g, "");
  assert.ok(encodedText);
  const decodedText = Buffer.from(encodedText, "base64").toString("utf8");
  assert.match(decodedText, /Program: Spring Program\./);
  assert.match(decodedText, /Business: Northwind\./);
  // The invitation is valid for 30 days from "now", so derive the expected date instead of hardcoding it.
  const expectedExpiry = new Date(result.expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  assert.ok(decodedText.includes(`valid until ${expectedExpiry}.`), `expected "${expectedExpiry}" in: ${decodedText}`);
});

test("a duplicate invitation reuses its record and does not send duplicate email", async () => {
  const firstResponse = await invite({
    email: "participant@example.test",
    businessId: business.id,
  });
  assert.equal(firstResponse.status, 201);

  duplicateApplication = true;
  const response = await invite({
    email: "participant@example.test",
    businessId: business.id,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 51);
  assert.equal(sentMessages.length, 1, "same invitation delivery identity must not send a second email");
});

test("an expired invitation can be renewed, while a non-invitation application remains a conflict", async () => {
  await invite({
    email: "participant@example.test",
    businessId: business.id,
  });
  duplicateApplication = true;
  invitationValues = {
    ...invitationValues,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    expiresAt: new Date("2026-10-01T12:00:00.000Z"),
  };
  sentMessages = [];

  const renewal = await invite({
    email: "participant@example.test",
    businessId: business.id,
  });
  const renewed = await renewal.json();
  assert.equal(renewal.status, 200, JSON.stringify(renewed));
  assert.ok(new Date(renewed.expiresAt).getTime() > Date.now());
  assert.equal(sentMessages.length, 1, "renewal uses a new email identity");

  existingInvitationMissing = true;
  const ordinaryApplication = await invite({
    email: "participant@example.test",
    businessId: business.id,
  });
  assert.equal(ordinaryApplication.status, 409);
});

test("a business from another program cannot be selected, and missing invitation tables fail closed", async () => {
  selectedBusinessId = 99;
  businessAvailable = false;
  const invalidBusiness = await invite({
    email: "participant@example.test",
    businessId: selectedBusinessId,
  });
  assert.equal(invalidBusiness.status, 404);
  assert.equal(applicationValues, undefined);

  invitationSchemaMissing = true;
  const schemaMissing = await invite({
    email: "participant@example.test",
    businessId: business.id,
  });
  assert.equal(schemaMissing.status, 503);
  assert.equal(applicationValues, undefined);
});
