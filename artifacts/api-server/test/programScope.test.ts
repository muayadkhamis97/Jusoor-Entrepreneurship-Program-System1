import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { db, programsTable } = await import("@workspace/db");
const { activeProgramIdsFor, canAccessActiveProgram } = await import("../src/lib/programScope");

const activePrograms = [{ id: 1 }, { id: 3 }];
let restoreSelect: (() => void) | undefined;
let selectCalls = 0;

before(() => {
  const original = Object.getOwnPropertyDescriptor(db, "select");
  Object.defineProperty(db, "select", {
    configurable: true,
    writable: true,
    value: () => {
      selectCalls += 1;
      let table: unknown;
      const query = {
        from(nextTable: unknown) {
          table = nextTable;
          return query;
        },
        where() { return query; },
        limit(limit: number) {
          return Promise.resolve(table === programsTable ? activePrograms.slice(0, limit) : []);
        },
        then(resolve: (rows: Array<{ id: number }>) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve(table === programsTable ? activePrograms : []).then(resolve, reject);
        },
      };
      return query;
    },
  });
  restoreSelect = () => {
    if (original) Object.defineProperty(db, "select", original);
    else Reflect.deleteProperty(db, "select");
  };
});

after(() => restoreSelect?.());

test("program staff are limited to assigned programs that are still active", async () => {
  const ids = await activeProgramIdsFor({
    id: 14,
    email: "staff@example.com",
    role: "staff",
    status: "active",
    bookingProvider: "calendly",
    calendlyBookingUrl: null,
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    createdAt: new Date(),
    programIds: [1, 2],
  });
  assert.deepEqual(ids, [1]);
});

test("coordinators retain global access to every active program", async () => {
  const ids = await activeProgramIdsFor({
    id: 1,
    email: "coordinator@example.com",
    role: "coordinator",
    status: "active",
    bookingProvider: "calendly",
    calendlyBookingUrl: null,
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    createdAt: new Date(),
    programIds: [],
  });
  assert.deepEqual(ids, [1, 3]);
});

test("an assigned active program is accessible but a cross-program or archived ID is denied", async () => {
  const staff = {
    id: 14,
    email: "staff@example.com",
    role: "staff" as const,
    status: "active" as const,
    bookingProvider: "calendly" as const,
    calendlyBookingUrl: null,
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    createdAt: new Date(),
    programIds: [1, 2],
  };
  assert.equal(await canAccessActiveProgram(staff, 1), true);
  assert.equal(await canAccessActiveProgram(staff, 3), false);
});

test("cross-program denial happens without querying the target program", async () => {
  const staff = {
    id: 14,
    email: "staff@example.com",
    role: "staff" as const,
    status: "active" as const,
    bookingProvider: "calendly" as const,
    calendlyBookingUrl: null,
    googleCalendarAccountEmail: null,
    googleCalendarBookingUrl: null,
    createdAt: new Date(),
    programIds: [1],
  };
  const previousSelectCalls = selectCalls;
  assert.equal(await canAccessActiveProgram(staff, 3), false);
  assert.equal(selectCalls, previousSelectCalls);
});
