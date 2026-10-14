import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  db,
  businessesTable,
  programsTable,
  sessionsTable,
  supportTable,
  pitchesTable,
} = await import("@workspace/db");
const [businessesRouter, sessionsRouter, supportRouter, pitchesRouter] = await Promise.all([
  import("../src/routes/businesses"),
  import("../src/routes/sessions"),
  import("../src/routes/support"),
  import("../src/routes/pitches"),
]);

type Row = Record<string, any>;
const activePrograms = [{ id: 1 }, { id: 2 }];
const ownBusiness: Row = {
  id: 20,
  programId: 1,
  businessName: "Assigned business",
  founderName: "Founder One",
  email: "founder@example.com",
  phone: null,
  industry: null,
  stage: "application",
  applicationDate: null,
  needs: null,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const crossBusiness: Row = { ...ownBusiness, id: 21, programId: 2, businessName: "Other cohort" };
const ownSession: Row = {
  id: 10,
  programId: 1,
  title: "Assigned session",
  type: "training",
  scheduledDate: "2026-02-01",
  startTime: "10:00",
  durationMinutes: 60,
  facilitator: null,
  trainerStaffId: null,
  deliveryMode: "online",
  location: null,
  zoomUrl: null,
  zoomMeetingId: null,
  recordingUrl: null,
  status: "scheduled",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const crossSession: Row = { ...ownSession, id: 22, programId: 2, title: "Other cohort session" };
const ownSupport: Row = {
  id: 30,
  businessId: ownBusiness.id,
  type: "mentor",
  provider: "Mentor",
  mentorStaffId: null,
  topic: "Customer discovery",
  scheduledDate: "2026-02-01",
  status: "requested",
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const crossSupport: Row = { ...ownSupport, id: 31, businessId: crossBusiness.id };
const ownPitch: Row = {
  id: 40,
  businessId: ownBusiness.id,
  eventType: "pitch_day",
  eventDate: "2026-03-01",
  judges: null,
  score: null,
  grantDecision: "pending",
  grantAmount: null,
  feedback: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const crossPitch: Row = { ...ownPitch, id: 41, businessId: crossBusiness.id };

let server: Server;
let requestPath = "";
let requestMethod = "";
let insertCount = 0;
let updateCount = 0;
let deleteCount = 0;
const restoreMethods: Array<() => void> = [];

function rowsFor(table: unknown, hasWhere: boolean): Row[] {
  if (table === programsTable) return activePrograms;
  if (table === businessesTable) {
    if (requestPath === "/businesses" && requestMethod === "GET") {
      return hasWhere ? [ownBusiness] : [ownBusiness, crossBusiness];
    }
    if (requestPath === "/businesses/21") return [crossBusiness];
    if (requestPath.startsWith("/support") && requestMethod === "GET") return hasWhere ? [ownBusiness] : [ownBusiness, crossBusiness];
    if (requestPath.startsWith("/pitches") && requestMethod === "GET") return hasWhere ? [ownBusiness] : [ownBusiness, crossBusiness];
    if (requestPath.startsWith("/support") || requestPath.startsWith("/pitches")) return [crossBusiness];
    return [];
  }
  if (table === sessionsTable) {
    if (requestPath === "/sessions" && requestMethod === "GET") {
      return hasWhere ? [ownSession] : [ownSession, crossSession];
    }
    return [crossSession];
  }
  if (table === supportTable) {
    if (requestPath === "/support" && requestMethod === "GET") {
      return hasWhere ? [ownSupport] : [ownSupport, crossSupport];
    }
    return [crossSupport];
  }
  if (table === pitchesTable) {
    if (requestPath === "/pitches" && requestMethod === "GET") {
      return hasWhere ? [ownPitch] : [ownPitch, crossPitch];
    }
    return [crossPitch];
  }
  return [];
}

function selectBuilder(selection: unknown) {
  let table: unknown;
  let hasWhere = false;
  const query: any = {
    from(nextTable: unknown) {
      table = nextTable;
      return query;
    },
    innerJoin() { return query; },
    leftJoin() { return query; },
    where(condition: unknown) {
      hasWhere = Boolean(condition);
      return query;
    },
    orderBy() { return query; },
    limit(limit: number) {
      return Promise.resolve(rowsFor(table, hasWhere).slice(0, limit));
    },
    for() { return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(rowsFor(table, hasWhere)).then(resolve, reject);
    },
  };
  void selection;
  return query;
}

function setDbMethod(name: "select" | "insert" | "update" | "delete" | "transaction", value: unknown) {
  const original = Object.getOwnPropertyDescriptor(db, name);
  Object.defineProperty(db, name, { configurable: true, writable: true, value });
  restoreMethods.push(() => {
    if (original) Object.defineProperty(db, name, original);
    else Reflect.deleteProperty(db, name);
  });
}

before(async () => {
  setDbMethod("select", ((selection: unknown) => selectBuilder(selection)) as never);
  setDbMethod("insert", (() => {
    const query: any = {
      values() { insertCount += 1; return query; },
      onConflictDoNothing() { return query; },
      returning() { return Promise.resolve([]); },
    };
    return query;
  }) as never);
  setDbMethod("update", (() => {
    const query: any = {
      set() { return query; },
      where() { return query; },
      returning() { updateCount += 1; return Promise.resolve([]); },
      then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
        updateCount += 1;
        return Promise.resolve([]).then(resolve, reject);
      },
    };
    return query;
  }) as never);
  setDbMethod("delete", (() => {
    const query: any = {
      where() { return query; },
      returning() { deleteCount += 1; return Promise.resolve([]); },
      then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
        deleteCount += 1;
        return Promise.resolve([]).then(resolve, reject);
      },
    };
    return query;
  }) as never);
  const transaction = async (callback: (tx: any) => unknown) => callback({
    select: (selection: unknown) => selectBuilder(selection),
    update: () => {
      const query: any = { set() { return query; }, where() { return query; }, returning() { updateCount += 1; return Promise.resolve([]); } };
      return query;
    },
    delete: () => {
      const query: any = { where() { return query; }, returning() { deleteCount += 1; return Promise.resolve([]); } };
      return query;
    },
    insert: () => {
      const query: any = { values() { insertCount += 1; return query; }, returning() { return Promise.resolve([]); } };
      return query;
    },
  });
  setDbMethod("transaction", transaction);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    requestPath = req.path;
    requestMethod = req.method;
    res.locals.staff = {
      id: 14,
      email: "staff@example.com",
      role: "staff",
      status: "active",
      bookingProvider: "calendly",
      calendlyBookingUrl: null,
      googleCalendarAccountEmail: null,
      googleCalendarBookingUrl: null,
      createdAt: new Date(),
      programIds: [1],
    };
    next();
  });
  app.use(businessesRouter.default);
  app.use(sessionsRouter.default);
  app.use(supportRouter.default);
  app.use(pitchesRouter.default);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  for (const restore of restoreMethods.reverse()) restore();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(method: string, path: string, body?: Row) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("program staff lists only their assigned cohort across core operational resources", async () => {
  const cases = [
    { path: "/businesses", idKey: "id", allowed: ownBusiness.id },
    { path: "/sessions", idKey: "id", allowed: ownSession.id },
    { path: "/support", idKey: "id", allowed: ownSupport.id },
    { path: "/pitches", idKey: "id", allowed: ownPitch.id },
  ];
  for (const item of cases) {
    const response = await request("GET", item.path);
    assert.equal(response.status, 200, item.path);
    const rows = await response.json() as Row[];
    assert.ok(rows.some((row) => row[item.idKey] === item.allowed), `${item.path} should retain assigned records`);
    assert.ok(rows.every((row) => row.id !== 22 && row.id !== 31 && row.id !== 41 && row.id !== crossBusiness.id), `${item.path} leaked a cross-program record`);
  }
});

test("program staff cannot read, create, update, or delete records from another program", async () => {
  const read = await request("GET", "/businesses/21");
  assert.equal(read.status, 404);

  const deniedRequests: Array<[string, string, Row?]> = [
    ["POST", "/businesses", { programId: 2, businessName: "New", founderName: "Founder", email: "new@example.com" }],
    ["PATCH", "/businesses/21", { businessName: "Changed" }],
    ["DELETE", "/businesses/21"],
    ["POST", "/sessions", { programId: 2, title: "Other", type: "training", scheduledDate: "2026-04-01" }],
    ["PATCH", "/sessions/22", { title: "Changed" }],
    ["DELETE", "/sessions/22"],
    ["POST", "/support", { businessId: 21, type: "mentor", provider: "Other", topic: "Other" }],
    ["PATCH", "/support/31", { topic: "Changed" }],
    ["DELETE", "/support/31"],
    ["POST", "/pitches", { businessId: 21, eventType: "pitch_day", eventDate: "2026-04-01" }],
    ["PATCH", "/pitches/41", { feedback: "Changed" }],
    ["DELETE", "/pitches/41"],
  ];
  for (const [method, path, body] of deniedRequests) {
    const response = await request(method, path, body);
    assert.equal(response.status, 404, `${method} ${path}`);
  }
  assert.deepEqual([insertCount, updateCount, deleteCount], [0, 0, 0], "cross-program denials must happen before mutations");
});
