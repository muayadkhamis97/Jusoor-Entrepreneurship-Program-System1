import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  applicationsTable,
  db,
  participantInvitationsTable,
  programAnnouncementsTable,
  programsTable,
  sessionsTable,
} = await import("@workspace/db");
const { default: programsRouter } = await import("../src/routes/programs");
const { default: participantRouter } = await import("../src/routes/participant");

type Row = Record<string, unknown>;

const customTimeZone = "America/Los_Angeles";
const updatedTimeZone = "Asia/Tokyo";
const programId = 37;
const business = {
  id: 82,
  programId,
  businessName: "Northwind Foods",
  industry: "Food",
  stage: "bootcamp",
};
const application = {
  id: 93,
  programId,
  businessId: business.id,
  clerkUserId: "participant-user",
  status: "accepted",
  createdAt: new Date("2026-10-01T09:00:00.000Z"),
};
const session = {
  id: 104,
  programId,
  title: "Founder finance workshop",
  type: "training",
  scheduledDate: "2026-11-20",
  startTime: "09:30",
  facilitator: "Program team",
  deliveryMode: "online",
  location: null,
  zoomUrl: null,
  recordingUrl: null,
  status: "scheduled",
};

let server: Server;
let storedProgram: Row | undefined;
let restoreSelect: () => void;
let restoreInsert: () => void;
let restoreUpdate: () => void;

function replaceDbMethod(
  name: "select" | "insert" | "update",
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

function rowsFor(table: unknown, selection: unknown): Row[] {
  if (table === applicationsTable) {
    const selectedFields = selection as Record<string, unknown> | undefined;
    if (selectedFields && "application" in selectedFields) {
      if (!storedProgram) return [];
      return [{
        application,
        program: storedProgram,
        business,
      }];
    }
    if (selectedFields && "businessId" in selectedFields) {
      return [{ businessId: business.id, programId }];
    }
  }
  if (table === sessionsTable && storedProgram) return [session];
  if (table === participantInvitationsTable || table === programAnnouncementsTable) return [];
  return [];
}

before(async () => {
  storedProgram = undefined;

  restoreSelect = replaceDbMethod("select", ((selection?: unknown) => {
    let table: unknown;
    const query = {
      from(nextTable: unknown) {
        table = nextTable;
        return query;
      },
      innerJoin() { return query; },
      leftJoin() { return query; },
      where() { return query; },
      orderBy() { return query; },
      limit() { return Promise.resolve(rowsFor(table, selection)); },
      then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(rowsFor(table, selection)).then(resolve, reject);
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  restoreInsert = replaceDbMethod("insert", ((table: unknown) => ({
    values(values: Row) {
      return {
        returning: async () => {
          if (table !== programsTable) return [];
          storedProgram = {
            id: programId,
            name: values.name,
            format: values.format,
            description: values.description ?? null,
            startDate: values.startDate ?? null,
            endDate: values.endDate ?? null,
            applicationDeadline: values.applicationDeadline ?? null,
            timeZone: values.timeZone ?? "Asia/Amman",
            mentorSessionsPerBusiness: values.mentorSessionsPerBusiness,
            status: values.status ?? "planning",
            archivedAt: null,
            createdAt: new Date("2026-10-01T08:00:00.000Z"),
          };
          return [storedProgram];
        },
      };
    },
  })) as (...args: never[]) => unknown);

  restoreUpdate = replaceDbMethod("update", ((table: unknown) => {
    let values: Row = {};
    const query = {
      set(nextValues: Row) {
        values = nextValues;
        return query;
      },
      where() { return query; },
      returning: async () => {
        if (table !== programsTable || !storedProgram) return [];
        for (const [key, value] of Object.entries(values)) {
          if (value !== undefined) storedProgram[key] = value;
        }
        return [storedProgram];
      },
    };
    return query;
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.staff = { id: 1, role: "coordinator" };
    res.locals.participant = { userId: application.clerkUserId };
    next();
  });
  app.use("/api", programsRouter);
  app.use("/api/participant", participantRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect();
  restoreInsert();
  restoreUpdate();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("program time-zone changes persist into fresh participant dashboard responses", async () => {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const createdResponse = await fetch(`${baseUrl}/api/programs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Pacific founders cohort",
      format: "bootcamp",
      timeZone: customTimeZone,
      mentorSessionsPerBusiness: 0,
    }),
  });
  assert.equal(createdResponse.status, 201);
  assert.equal((await createdResponse.json() as Row).timeZone, customTimeZone);
  assert.equal(storedProgram?.timeZone, customTimeZone);

  const updatedResponse = await fetch(`${baseUrl}/api/programs/${programId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timeZone: updatedTimeZone }),
  });
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json() as Row).timeZone, updatedTimeZone);
  assert.equal(storedProgram?.timeZone, updatedTimeZone);

  const invalidUpdate = await fetch(`${baseUrl}/api/programs/${programId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timeZone: "Mars/Olympus_Mons" }),
  });
  assert.equal(invalidUpdate.status, 400);
  assert.equal(storedProgram?.timeZone, updatedTimeZone, "invalid zones must not overwrite the saved value");

  const dashboardResponse = await fetch(`${baseUrl}/api/participant/dashboard`);
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json() as {
    applications: Array<{
      program: { timeZone: string };
      sessions: Array<{ timeZone: string; scheduledDate: string; startTime: string | null }>;
    }>;
  };

  assert.equal(dashboard.applications[0]?.program.timeZone, updatedTimeZone);
  assert.deepEqual(
    dashboard.applications[0]?.sessions.map(({ timeZone, scheduledDate, startTime }) => ({
      timeZone,
      scheduledDate,
      startTime,
    })),
    [{
      timeZone: updatedTimeZone,
      scheduledDate: session.scheduledDate,
      startTime: session.startTime,
    }],
  );
});
