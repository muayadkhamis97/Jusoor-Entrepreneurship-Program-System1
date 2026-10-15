import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const {
  announcementReceiptsTable,
  applicationsTable,
  db,
  programAnnouncementsTable,
  sessionsTable,
} = await import("@workspace/db");
const { default: communicationsRouter } = await import("../src/routes/communications");

type AnnouncementRow = {
  id: number;
  sessionId: number;
  programId: number;
  recordingVersion: number;
  scheduledFor: Date;
};
type SessionRow = {
  id: number;
  programId: number;
  title: string;
  recordingVersion: number;
  recordingUrl: string;
};
type ParticipantRow = {
  founderName: string;
  email: string;
  readAt: Date | null;
};

let announcement: AnnouncementRow = {
  id: 41,
  sessionId: 71,
  programId: 8,
  recordingVersion: 2,
  scheduledFor: new Date("2026-10-15T09:00:00.000Z"),
};
let session: SessionRow = {
  id: 71,
  programId: 8,
  title: "Workshop",
  recordingVersion: 2,
  recordingUrl: "https://drive.google.com/file/d/recording/view",
};
const participants: ParticipantRow[] = [
  {
    founderName: "Amina Founder",
    email: "amina@example.com",
    readAt: new Date("2026-10-15T10:00:00.000Z"),
  },
  { founderName: "Omar Founder", email: "omar@example.com", readAt: null },
];
let role: "coordinator" | "staff" | "participant" = "coordinator";
let selectCount = 0;
let participantQueryCount = 0;
let server: Server;
let restoreSelect: () => void;

before(async () => {
  const original = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      selectCount += 1;
      let table: unknown;
      const query: any = {
        from(nextTable: unknown) {
          table = nextTable;
          return query;
        },
        leftJoin() {
          return query;
        },
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit() {
          if (table === programAnnouncementsTable) return Promise.resolve([announcement]);
          if (table === sessionsTable) return Promise.resolve([session]);
          return Promise.resolve([]);
        },
        then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
          if (table === applicationsTable) participantQueryCount += 1;
          const rows = table === applicationsTable
            ? participants
            : table === announcementReceiptsTable ? [] : [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return query;
    },
  });
  restoreSelect = () => {
    if (original) Object.defineProperty(db, "select", original);
    else Reflect.deleteProperty(db, "select");
  };

  const app = express();
  app.use((_req, res, next) => {
    Object.assign(res.locals, {
      staff: role === "participant" ? undefined : { id: 1, email: "coordinator@example.com", role },
    });
    next();
  });
  app.use("/api", communicationsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreSelect();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

async function request(): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/communications/41/read-receipts`);
}

test("only coordinators can access recording notice read receipts", async () => {
  for (const deniedRole of ["staff", "participant"] as const) {
    role = deniedRole;
    selectCount = 0;
    const response = await request();
    assert.equal(response.status, 403);
    assert.equal(selectCount, 0);
  }
});

test("coordinators see accepted participants with receipt state for the current version", async () => {
  role = "coordinator";
  session = { ...session, recordingVersion: announcement.recordingVersion };
  selectCount = 0;
  participantQueryCount = 0;

  const response = await request();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    announcementId: 41,
    sessionId: 71,
    sessionTitle: "Workshop",
    recordingVersion: 2,
    participants: [
      {
        founderName: "Amina Founder",
        email: "amina@example.com",
        readAt: "2026-10-15T10:00:00.000Z",
      },
      { founderName: "Omar Founder", email: "omar@example.com", readAt: null },
    ],
  });
  assert.equal(participantQueryCount, 1);
});

test("a replaced recording link invalidates receipts from the previous notice version", async () => {
  role = "coordinator";
  session = { ...session, recordingVersion: announcement.recordingVersion + 1 };
  selectCount = 0;
  participantQueryCount = 0;

  const response = await request();

  assert.equal(response.status, 404);
  assert.equal(selectCount, 2);
  assert.equal(participantQueryCount, 0);
});
