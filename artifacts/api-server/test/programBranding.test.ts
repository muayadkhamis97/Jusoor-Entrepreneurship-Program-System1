import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const { db } = await import("@workspace/db");
const { default: router } = await import("../src/routes/programBranding");

type BrandingRow = {
  id: number;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string;
  topbarColor: string;
  updatedAt: Date;
};

type TestResponse = {
  statusCode: number;
  body: unknown;
  status(code: number): TestResponse;
  json(body: unknown): TestResponse;
};

type RouteHandler = (req: { body?: unknown }, res: TestResponse) => Promise<void>;

const routeStack = (router as unknown as {
  stack: Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: RouteHandler }>;
    };
  }>;
}).stack;

function getHandler(method: "get" | "put"): RouteHandler {
  const route = routeStack.find((layer) =>
    layer.route?.path === "/branding" && layer.route.methods[method],
  )?.route;
  assert.ok(route, `Expected a ${method.toUpperCase()} /branding route`);
  return route.stack.at(-1)!.handle;
}

const getBranding = getHandler("get");
const updateBranding = getHandler("put");

function replaceDbMethod(
  name: "select" | "insert",
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

async function invoke(handler: RouteHandler, body?: unknown): Promise<TestResponse> {
  const response: TestResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await handler({ body }, response);
  return response;
}

function savedRow(overrides: Partial<BrandingRow> = {}): BrandingRow {
  return {
    id: 1,
    brandName: "Program Hub",
    logoUrl: null,
    primaryColor: "#28665a",
    accentColor: "#d98a46",
    sidebarColor: "#1f3445",
    topbarColor: "#2d4453",
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function mockBrandingRead(rows: BrandingRow[]): () => void {
  return replaceDbMethod("select", (() => ({
    from() {
      return this;
    },
    limit: async () => rows,
  })) as (...args: never[]) => unknown);
}

test("GET /branding returns defaults when no settings are saved", async () => {
  const restoreSelect = mockBrandingRead([]);
  try {
    const response = await invoke(getBranding);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      brandName: "Program Hub",
      logoUrl: null,
      primaryColor: "#28665a",
      accentColor: "#d98a46",
      sidebarColor: "#1f3445",
      topbarColor: "#2d4453",
    });
  } finally {
    restoreSelect();
  }
});

test("GET /branding normalizes an older saved name without changing its row", async () => {
  const row = savedRow({ brandName: "Jusoor Growth Lab" });
  const beforeRead = structuredClone(row);
  const restoreSelect = mockBrandingRead([row]);
  let writeAttempts = 0;
  const restoreInsert = replaceDbMethod("insert", (() => {
    writeAttempts += 1;
    throw new Error("GET /branding must not write branding settings");
  }) as (...args: never[]) => unknown);

  try {
    const response = await invoke(getBranding);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      brandName: "Program Hub",
      logoUrl: null,
      primaryColor: "#28665a",
      accentColor: "#d98a46",
      sidebarColor: "#1f3445",
      topbarColor: "#2d4453",
    });
    assert.deepEqual(row, beforeRead);
    assert.equal(writeAttempts, 0);
  } finally {
    restoreInsert();
    restoreSelect();
  }
});

test("PUT /branding saves and returns a valid custom brand", async () => {
  let insertedValues: Record<string, unknown> | undefined;
  let conflictUpdate: Record<string, unknown> | undefined;
  const restoreInsert = replaceDbMethod("insert", (() => {
    const query = {
      values(values: Record<string, unknown>) {
        insertedValues = values;
        return this;
      },
      onConflictDoUpdate(options: Record<string, unknown>) {
        conflictUpdate = options;
        return this;
      },
      returning: async () => [{
        brandName: "North Star",
        logoUrl: "https://cdn.example.test/logo.png",
        primaryColor: "#163b52",
        accentColor: "#e1a447",
        sidebarColor: "#112233",
        topbarColor: "#334455",
      }],
    };
    return query;
  }) as (...args: never[]) => unknown);

  try {
    const response = await invoke(updateBranding, {
      brandName: "  North Star  ",
      logoUrl: "https://cdn.example.test/logo.png",
      primaryColor: "#163B52",
      accentColor: "#E1A447",
      sidebarColor: "#112233",
      topbarColor: "#334455",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      brandName: "North Star",
      logoUrl: "https://cdn.example.test/logo.png",
      primaryColor: "#163b52",
      accentColor: "#e1a447",
      sidebarColor: "#112233",
      topbarColor: "#334455",
    });
    assert.deepEqual(insertedValues, {
      id: 1,
      brandName: "North Star",
      logoUrl: "https://cdn.example.test/logo.png",
      primaryColor: "#163b52",
      accentColor: "#e1a447",
      sidebarColor: "#112233",
      topbarColor: "#334455",
    });
    const conflictSet = conflictUpdate?.set as Record<string, unknown>;
    const { updatedAt, ...conflictValues } = conflictSet;
    assert.deepEqual(conflictValues, {
      brandName: "North Star",
      logoUrl: "https://cdn.example.test/logo.png",
      primaryColor: "#163b52",
      accentColor: "#e1a447",
      sidebarColor: "#112233",
      topbarColor: "#334455",
    });
    assert.ok(updatedAt instanceof Date);
  } finally {
    restoreInsert();
  }
});

test("PUT /branding rejects disallowed names before any write", async () => {
  let writeAttempts = 0;
  const restoreInsert = replaceDbMethod("insert", (() => {
    writeAttempts += 1;
    throw new Error("Rejected branding updates must not write");
  }) as (...args: never[]) => unknown);
  const rejectedNames = ["Jusoor Growth Lab", "مساحة جسور"];

  try {
    for (const brandName of rejectedNames) {
      const response = await invoke(updateBranding, {
        brandName,
        logoUrl: null,
        primaryColor: "#163b52",
        accentColor: "#e1a447",
      });
      assert.equal(response.statusCode, 400, `Expected "${brandName}" to be rejected`);
      assert.match(JSON.stringify(response.body), /unavailable/i);
    }
    assert.equal(writeAttempts, 0);
  } finally {
    restoreInsert();
  }
});
