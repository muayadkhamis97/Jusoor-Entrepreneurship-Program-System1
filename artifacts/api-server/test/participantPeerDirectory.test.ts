import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  applicationsTable,
  db,
  participantPeerDirectoryPreferencesTable,
} = await import("@workspace/db");
const { default: participantRouter } = await import("../src/routes/participant");

const nativeFetch = globalThis.fetch;
let server: Server;
let currentPath = "";
let savedValues: Record<string, unknown> | undefined;
const restoreMethods: Array<() => void> = [];

const acceptedApplication = {
  applicationId: 5,
  programId: 8,
  programName: "Cohort Eight",
};
const peerRows = [
  {
    founderName: "Email Founder",
    businessName: "Email Venture",
    industry: "Food",
    email: "email@example.com",
    phone: "+111111111",
    shareEmail: true,
    sharePhone: false,
  },
  {
    founderName: "Phone Founder",
    businessName: "Phone Venture",
    industry: null,
    email: "phone@example.com",
    phone: "+222222222",
    shareEmail: false,
    sharePhone: true,
  },
];

function replaceDbMethod(name: "select" | "insert", replacement: (...args: never[]) => unknown) {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, { configurable: true, writable: true, value: replacement });
  restoreMethods.push(() => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  });
}

before(async () => {
  replaceDbMethod("select", (() => {
    let table: unknown;
    let hasJoin = false;
    const query: any = {
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin() {
        hasJoin = true;
        return query;
      },
      where() { return query; },
      orderBy() { return query; },
      limit() {
        return Promise.resolve(result());
      },
      then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    function result() {
      if (table === applicationsTable) {
        const programId = Number(currentPath.match(/\/programs\/(\d+)\/peers/)?.[1]);
        return programId === acceptedApplication.programId ? [acceptedApplication] : [];
      }
      if (table === participantPeerDirectoryPreferencesTable && hasJoin) return peerRows;
      if (table === participantPeerDirectoryPreferencesTable) return [];
      return [];
    }
    return query;
  }) as (...args: never[]) => unknown);

  replaceDbMethod("insert", (() => {
    const query: any = {
      values(values: Record<string, unknown>) {
        savedValues = values;
        return query;
      },
      onConflictDoUpdate() { return query; },
      returning() {
        return Promise.resolve([{ ...savedValues, id: 1, updatedAt: new Date() }]);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    currentPath = req.path;
    res.locals.participant = { userId: "founder-1", email: "founder@example.com" };
    next();
  });
  app.use("/api/participant", participantRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  for (const restore of restoreMethods.reverse()) restore();
});

async function request(path: string, init?: RequestInit): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, init);
}

test("directory only resolves an accepted program and only returns contacts each peer opted to share", async () => {
  const response = await request("/api/participant/programs/8/peers");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    programId: 8,
    programName: "Cohort Eight",
    preferences: { isListed: false, shareEmail: false, sharePhone: false },
    peers: [
      {
        founderName: "Email Founder",
        businessName: "Email Venture",
        industry: "Food",
        email: "email@example.com",
        phone: null,
      },
      {
        founderName: "Phone Founder",
        businessName: "Phone Venture",
        industry: null,
        email: null,
        phone: "+222222222",
      },
    ],
  });

  assert.equal((await request("/api/participant/programs/9/peers")).status, 404);
});

test("directory preferences cannot be saved for a program without an accepted application", async () => {
  const response = await request("/api/participant/programs/9/peers", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isListed: true, shareEmail: true, sharePhone: true }),
  });
  assert.equal(response.status, 404);
  assert.equal(savedValues, undefined);
});

test("turning off directory listing also clears contact sharing preferences", async () => {
  const response = await request("/api/participant/programs/8/peers", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isListed: false, shareEmail: true, sharePhone: true }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(savedValues, {
    applicationId: acceptedApplication.applicationId,
    isListed: false,
    shareEmail: false,
    sharePhone: false,
  });
  assert.deepEqual(await response.json(), { isListed: false, shareEmail: false, sharePhone: false });
});

test("founders can opt in to the directory and choose each contact method independently", async () => {
  const response = await request("/api/participant/programs/8/peers", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isListed: true, shareEmail: true, sharePhone: false }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(savedValues, {
    applicationId: acceptedApplication.applicationId,
    isListed: true,
    shareEmail: true,
    sharePhone: false,
  });
  assert.deepEqual(await response.json(), { isListed: true, shareEmail: true, sharePhone: false });
});
