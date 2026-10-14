import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { after, before, test } from "node:test";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreInsert: (() => void) | undefined;
let restoreUpdate: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;
let applications: Array<Record<string, any>>;
let modules: Array<Record<string, any>>;
let progress: Array<Record<string, any>>;
let certificates: Array<Record<string, any>>;
let quizzes: Array<Record<string, any>>;
let quizAttempts: Array<Record<string, any>>;
let ideaValidationWorkbooks: Array<Record<string, any>>;
let participantBusinessPlans: Array<Record<string, any>>;
let selectedApplicationIds = new Set<number>();
let selectedRequiredModuleIds = new Set<number>();
let transactionTail: Promise<void> = Promise.resolve();
let requestUserId = "";
let requestRole = "";
let requestPath = "";
let beforeCertificateInsert: (() => Promise<void>) | undefined;
let onCertificateInsert: (() => void) | undefined;

const programName = "Jusoor Learning Program";

function resetState(): void {
  applications = [
    {
      id: 101,
      programId: 9,
      founderName: "Amina Founder",
      businessName: "Amina Ventures",
      businessId: 201,
      email: "amina@example.com",
      clerkUserId: "participant-a",
      status: "accepted",
    },
    {
      id: 102,
      programId: 9,
      founderName: "Bilal Founder",
      businessName: "Bilal Ventures",
      businessId: 202,
      email: "bilal@example.com",
      clerkUserId: "participant-b",
      status: "accepted",
    },
  ];
  modules = [
    {
      id: 11,
      programId: 9,
      title: "Released requirement",
      description: null,
      position: 1,
      releaseAt: null,
      dueAt: null,
      isRequired: true,
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: 12,
      programId: 9,
      title: "Future requirement",
      description: null,
      position: 2,
      releaseAt: new Date("2099-01-01T00:00:00.000Z"),
      dueAt: null,
      isRequired: true,
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: 13,
      programId: 9,
      title: "Unpublished requirement",
      description: null,
      position: 3,
      releaseAt: null,
      dueAt: null,
      isRequired: true,
      isPublished: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  progress = [];
  certificates = [];
  quizzes = [];
  quizAttempts = [];
  ideaValidationWorkbooks = [];
  participantBusinessPlans = [];
  selectedApplicationIds = new Set();
  selectedRequiredModuleIds = new Set();
  transactionTail = Promise.resolve();
  beforeCertificateInsert = undefined;
  onCertificateInsert = undefined;
}

function replaceDbMethod(
  name: "select" | "insert" | "update" | "transaction",
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

function selectRows(table: unknown, joined: boolean, limit: number | undefined): Array<Record<string, any>> {
  const {
    applicationsTable,
    courseCertificatesTable,
    courseModuleProgressTable,
    courseModulesTable,
    ideaValidationWorkbooksTable,
    participantBusinessPlansTable,
    courseQuizAttemptsTable,
    courseQuizzesTable,
  } = requireDbTables;
  let rows: Array<Record<string, any>> = [];
  if (table === applicationsTable) {
    if (requestPath.endsWith("/certificate") && joined) {
      const found = applications.find((item) => item.id === Number(requestPath.split("/").at(-2)));
      rows = found ? [{ application: found, programName }] : [];
    } else if (joined && requestUserId && (requestPath.includes("/idea-validation/") || requestPath.includes("/business-plans/"))) {
      const applicationId = Number(requestPath.split("/").at(-1));
      rows = applications
        .filter((item) => item.id === applicationId &&
          item.clerkUserId === requestUserId && item.status === "accepted")
        .map((item) => ({ ...item, applicationId: item.id, programName }));
      selectedApplicationIds = new Set(rows.map((item) => item.id));
    } else if (joined && requestUserId) {
      rows = applications
        .filter((item) => item.clerkUserId === requestUserId && item.status === "accepted")
        .map((item) => ({ ...item, applicationId: item.id, programName }));
      selectedApplicationIds = new Set(rows.map((item) => item.id));
    } else if (requestUserId) {
      const found = applications.find((item) =>
        item.clerkUserId === requestUserId && item.status === "accepted");
      rows = found ? [{ id: found.id }] : [];
    }
  } else if (table === courseModulesTable) {
    const now = new Date();
    rows = modules.filter((item) => item.programId === 9 &&
      item.isPublished && (!item.releaseAt || item.releaseAt <= now) &&
      (!requestPath.endsWith("/certificate") || item.isRequired));
    if (requestPath.endsWith("/certificate")) {
      selectedRequiredModuleIds = new Set(rows.map((item) => item.id));
    }
  } else if (table === courseModuleProgressTable) {
    const applicationIds = selectedApplicationIds.size
      ? selectedApplicationIds
      : new Set([Number(requestPath.split("/").at(-2))]);
    rows = progress.filter((item) =>
      applicationIds.has(item.applicationId) &&
      (!requestPath.endsWith("/certificate") || selectedRequiredModuleIds.has(item.moduleId)));
  } else if (table === courseQuizzesTable) {
    rows = quizzes.filter((item) => item.moduleId === 11 && item.isPublished);
  } else if (table === courseQuizAttemptsTable) {
    rows = quizAttempts
      .filter((item) => item.participantClerkUserId === requestUserId &&
        quizzes.some((quiz) => quiz.id === item.quizId))
      .sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime());
  } else if (table === ideaValidationWorkbooksTable) {
    rows = ideaValidationWorkbooks.filter((item) => selectedApplicationIds.has(item.applicationId));
  } else if (table === participantBusinessPlansTable) {
    rows = participantBusinessPlans.filter((item) => selectedApplicationIds.has(item.applicationId));
  } else if (table === courseCertificatesTable) {
    if (requestPath.endsWith("/verification")) {
      const requestedCode = requestPath.split("/").at(-2)?.toUpperCase();
      rows = certificates
        .filter((certificate) => certificate.certificateCode === requestedCode)
        .map((certificate) => ({
          certificateCode: certificate.certificateCode,
          participantName: certificate.participantName,
          businessName: certificate.businessName,
          programName: certificate.programName,
          issuedAt: certificate.issuedAt,
          revokedAt: certificate.revokedAt ?? null,
        }));
    } else if (requestPath.endsWith("/revoke")) {
      const requestedId = Number(requestPath.split("/").at(-2));
      rows = certificates
        .filter((certificate) => certificate.id === requestedId)
        .map((certificate) => ({
          certificate,
          issuedByName: "issuer@example.com",
          revokedByName: certificate.revokedByStaffId ? "coordinator@example.com" : null,
        }));
    } else {
      rows = certificates.map((certificate) => joined
        ? {
          certificate,
          issuedByName: "coordinator@example.com",
          revokedByName: certificate.revokedByStaffId ? "coordinator@example.com" : null,
        }
        : { id: certificate.id });
    }
  }
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

let requireDbTables: {
  applicationsTable: unknown;
  courseCertificatesTable: unknown;
  courseModuleProgressTable: unknown;
  courseModulesTable: unknown;
  ideaValidationWorkbooksTable: unknown;
  participantBusinessPlansTable: unknown;
  courseQuizAttemptsTable: unknown;
  courseQuizzesTable: unknown;
};

function makeSelect() {
  let table: unknown;
  let joined = false;
  let limit: number | undefined;
  const query = {
    from(value: unknown) {
      table = value;
      return query;
    },
    innerJoin(..._args: unknown[]) {
      joined = true;
      return query;
    },
    leftJoin(..._args: unknown[]) {
      joined = true;
      return query;
    },
    where(..._args: unknown[]) { return query; },
    orderBy(..._args: unknown[]) { return query; },
    limit(value: number) {
      limit = value;
      return query;
    },
    for(_lock?: string) { return query; },
    then(resolve: (value: Array<Record<string, any>>) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(selectRows(table, joined, limit)).then(resolve, reject);
    },
  };
  return query;
}

function makeUpdate(table: unknown) {
  let values: Record<string, any> = {};
  const query = {
    set(next: Record<string, any>) {
      values = next;
      return query;
    },
    where(..._args: unknown[]) {
      return query;
    },
    returning: async () => {
      if (table !== requireDbTables.courseCertificatesTable) return [];
      const id = Number(requestPath.split("/").at(-2));
      const certificate = certificates.find((item) => item.id === id);
      if (!certificate || certificate.revokedAt) return [];
      Object.assign(certificate, values);
      return [{ id: certificate.id }];
    },
  };
  return query;
}

function makeTransaction() {
  const tx = {
    select(_fields?: unknown) {
      return makeSelect();
    },
    insert(table: unknown) {
      let values: Record<string, any> = {};
      const query = {
        values(next: Record<string, any>) {
          values = next;
          return query;
        },
        onConflictDoUpdate() { return query; },
        onConflictDoNothing() { return query; },
        returning: async () => {
          if (table === requireDbTables.courseModuleProgressTable) {
            const existing = progress.find((item) =>
              item.applicationId === values.applicationId && item.moduleId === values.moduleId);
            if (existing) Object.assign(existing, values);
            else progress.push({ id: progress.length + 1, ...values });
            return [progress.find((item) =>
              item.applicationId === values.applicationId && item.moduleId === values.moduleId)];
          }
          if (table === requireDbTables.courseCertificatesTable) {
            if (beforeCertificateInsert) {
              const wait = beforeCertificateInsert;
              beforeCertificateInsert = undefined;
              onCertificateInsert?.();
              await wait();
            }
            if (certificates.some((item) => item.applicationId === values.applicationId)) return [];
            const issued = {
              id: certificates.length + 1,
              issuedAt: new Date(),
              ...values,
            };
            certificates.push(issued);
            return [issued];
          }
          return [];
        },
      };
      return query;
    },
  };
  return tx;
}

function makeInsert(table: unknown) {
  let values: Record<string, any> = {};
  let conflictValues: Record<string, any> = {};
  const query = {
    values(next: Record<string, any>) {
      values = next;
      return query;
    },
    onConflictDoUpdate({ set }: { set: Record<string, any> }) {
      conflictValues = set;
      return query;
    },
    returning: async () => {
      if (table !== requireDbTables.ideaValidationWorkbooksTable && table !== requireDbTables.participantBusinessPlansTable) return [];
      const records = table === requireDbTables.ideaValidationWorkbooksTable ? ideaValidationWorkbooks : participantBusinessPlans;
      let workbook = records.find((item) => item.applicationId === values.applicationId);
      if (workbook) Object.assign(workbook, values, conflictValues);
      else {
        workbook = { id: records.length + 1, createdAt: new Date(), ...values };
        records.push(workbook);
      }
      return [workbook];
    },
  };
  return query;
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const schema = await import("@workspace/db");
  db = schema.db;
  requireDbTables = {
    applicationsTable: schema.applicationsTable,
    courseCertificatesTable: schema.courseCertificatesTable,
    courseModuleProgressTable: schema.courseModuleProgressTable,
    courseModulesTable: schema.courseModulesTable,
    ideaValidationWorkbooksTable: schema.ideaValidationWorkbooksTable,
    participantBusinessPlansTable: schema.participantBusinessPlansTable,
    courseQuizAttemptsTable: schema.courseQuizAttemptsTable,
    courseQuizzesTable: schema.courseQuizzesTable,
  };
  const { participantCourseProgressRouter, publicCertificateVerificationRouter, staffLearningProgressRouter } =
    await import("../src/routes/courseProgress");
  const participantRouter = (await import("../src/routes/participant")).default;
  resetState();

  restoreSelect = replaceDbMethod("select", (() => makeSelect()) as (...args: never[]) => unknown);
  restoreInsert = replaceDbMethod("insert", ((table: unknown) => makeInsert(table)) as (...args: never[]) => unknown);
  restoreUpdate = replaceDbMethod("update", ((table: unknown) => makeUpdate(table)) as (...args: never[]) => unknown);
  restoreTransaction = replaceDbMethod("transaction", ((callback: unknown) => {
    const previous = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(async () => {
      try {
        return await (callback as (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>)(makeTransaction());
      } finally {
        release();
      }
    });
  }) as (...args: never[]) => unknown);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    requestUserId = req.header("x-test-user") ?? "";
    requestRole = req.header("x-test-role") ?? "";
    requestPath = req.path;
    if (requestUserId) {
      res.locals.participant = { userId: requestUserId, email: `${requestUserId}@example.com` };
    }
    if (requestRole) {
      res.locals.staff = {
        id: 7,
        email: "coordinator@example.com",
        role: requestRole,
        status: "active",
      };
    }
    next();
  });
  app.use("/api", participantCourseProgressRouter);
  app.use("/api/participant", participantRouter);
  app.use("/api", publicCertificateVerificationRouter);
  app.use("/api", staffLearningProgressRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreTransaction?.();
  restoreUpdate?.();
  restoreInsert?.();
  restoreSelect?.();
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path: string, options: {
  role?: string;
  user?: string;
  method?: string;
  body?: unknown;
} = {}): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.role ? { "x-test-role": options.role } : {}),
      ...(options.user ? { "x-test-user": options.user } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

function certificatePath(applicationId = 101): string {
  return `/api/analytics/learning-progress/applications/${applicationId}/certificate`;
}

test("idea-validation workbooks save per accepted application and remain private to that participant", async () => {
  resetState();
  const anonymous = await request("/api/participant/idea-validation");
  assert.equal(anonymous.status, 403);

  const responses = {
    customerSegment: "Independent food sellers",
    problemStatement: "They struggle to manage repeat orders.",
    riskiestAssumption: "They will use a low-cost mobile ordering tool.",
    mvpExperiment: "Offer a manual WhatsApp ordering pilot to five sellers.",
    successSignal: "Three sellers use it for two weeks.",
    evidenceAndNextStep: "Two sellers completed the pilot; interview them before changing the offer.",
  };

  const missing = await request("/api/participant/idea-validation", { user: "participant-a" });
  assert.equal(missing.status, 200);
  const empty = await missing.json() as { workbooks: Array<Record<string, any>> };
  assert.equal(empty.workbooks.length, 1);
  assert.equal(empty.workbooks[0].problemStatement, "");
  assert.equal(empty.workbooks[0].updatedAt, null);

  const saved = await request("/api/participant/idea-validation/101", {
    user: "participant-a",
    method: "PUT",
    body: responses,
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json() as Record<string, any>).problemStatement, responses.problemStatement);

  const reloaded = await request("/api/participant/idea-validation", { user: "participant-a" });
  const ownWorkbooks = await reloaded.json() as { workbooks: Array<Record<string, any>> };
  assert.equal(ownWorkbooks.workbooks[0].evidenceAndNextStep, responses.evidenceAndNextStep);

  const otherParticipant = await request("/api/participant/idea-validation", { user: "participant-b" });
  const otherWorkbooks = await otherParticipant.json() as { workbooks: Array<Record<string, any>> };
  assert.equal(otherWorkbooks.workbooks[0].problemStatement, "");

  const crossParticipantWrite = await request("/api/participant/idea-validation/101", {
    user: "participant-b",
    method: "PUT",
    body: responses,
  });
  assert.equal(crossParticipantWrite.status, 404);

  const invalid = await request("/api/participant/idea-validation/101", {
    user: "participant-a",
    method: "PUT",
    body: { ...responses, customerSegment: "x".repeat(2001) },
  });
  assert.equal(invalid.status, 400);
});

test("participant business plans save per accepted application and remain private to that participant", async () => {
  resetState();
  const anonymous = await request("/api/participant/business-plans");
  assert.equal(anonymous.status, 403);

  const emptyResponse = await request("/api/participant/business-plans", { user: "participant-a" });
  assert.equal(emptyResponse.status, 200);
  const empty = await emptyResponse.json() as { plans: Array<Record<string, any>> };
  assert.equal(empty.plans.length, 1);
  assert.equal(empty.plans[0].acquisitionChannels, "");
  assert.equal(empty.plans[0].updatedAt, null);

  const plan = {
    acquisitionChannels: "Referrals and local market events",
    outreachActions: "Contact five shop owners each week",
    fulfillmentSteps: "Confirm order, prepare items, deliver, follow up",
    reviewSignals: "Weekly conversations, paid orders, repeat customers",
  };
  const saved = await request("/api/participant/business-plans/101", {
    user: "participant-a",
    method: "PUT",
    body: plan,
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json() as Record<string, any>).fulfillmentSteps, plan.fulfillmentSteps);

  const reloaded = await request("/api/participant/business-plans", { user: "participant-a" });
  const ownPlans = await reloaded.json() as { plans: Array<Record<string, any>> };
  assert.equal(ownPlans.plans[0].reviewSignals, plan.reviewSignals);

  const otherParticipant = await request("/api/participant/business-plans", { user: "participant-b" });
  const otherPlans = await otherParticipant.json() as { plans: Array<Record<string, any>> };
  assert.equal(otherPlans.plans[0].outreachActions, "");

  const crossParticipantWrite = await request("/api/participant/business-plans/101", {
    user: "participant-b",
    method: "PUT",
    body: plan,
  });
  assert.equal(crossParticipantWrite.status, 404);

  const invalid = await request("/api/participant/business-plans/101", {
    user: "participant-a",
    method: "PUT",
    body: { ...plan, acquisitionChannels: "x".repeat(3001) },
  });
  assert.equal(invalid.status, 400);
});

test("public certificate verification returns only the issued certificate details", async () => {
  resetState();
  const issuedAt = new Date("2026-10-11T13:45:00.000Z");
  certificates.push({
    id: 1,
    applicationId: 101,
    programId: 9,
    certificateCode: "D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1",
    participantName: "Amina Founder",
    businessName: "Amina Ventures",
    programName,
    issuedByStaffId: 7,
    issuedAt,
  });

  const response = await request(`/api/certificates/${certificates[0].certificateCode.toLowerCase()}/verification`);
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), [
    "businessName",
    "certificateCode",
    "issuedAt",
    "participantName",
    "programName",
    "revokedAt",
    "status",
  ]);
  assert.equal(body.status, "issued");
  assert.equal(body.participantName, "Amina Founder");
  assert.equal(body.businessName, "Amina Ventures");
  assert.equal(body.programName, programName);
  assert.equal(body.certificateCode, certificates[0].certificateCode);
  assert.equal(body.issuedAt, issuedAt.toISOString());
  assert.equal(body.revokedAt, null);
  assert.equal(certificates.length, 1);

  certificates.push({
    id: 2,
    applicationId: 102,
    programId: 9,
    certificateCode: "JUS-2026-AR-8F31D2",
    participantName: "Bilal Founder",
    businessName: "Bilal Ventures",
    programName,
    issuedByStaffId: 7,
    issuedAt,
  });
  const legacyResponse = await request("/api/certificates/jus-2026-ar-8f31d2/verification");
  const legacyBody = await legacyResponse.json() as Record<string, unknown>;
  assert.equal(legacyResponse.status, 200);
  assert.deepEqual(Object.keys(legacyBody).sort(), [
    "businessName",
    "certificateCode",
    "issuedAt",
    "participantName",
    "programName",
    "revokedAt",
    "status",
  ]);
  assert.equal(legacyBody.status, "issued");
  assert.equal(legacyBody.certificateCode, "JUS-2026-AR-8F31D2");
  assert.equal(legacyBody.participantName, "Bilal Founder");
  assert.equal(legacyBody.businessName, "Bilal Ventures");
  assert.equal(legacyBody.programName, programName);
  assert.equal(legacyBody.issuedAt, issuedAt.toISOString());
  assert.equal(legacyBody.revokedAt, null);
  assert.equal("email" in legacyBody, false);
  assert.equal("clerkUserId" in legacyBody, false);
  assert.equal("issuedByStaffId" in legacyBody, false);
  assert.equal("revocationReason" in legacyBody, false);
});

test("invalid and unknown public certificate codes are clearly distinguished", async () => {
  resetState();
  const invalid = await request("/api/certificates/not-a-code/verification");
  const unknown = await request("/api/certificates/D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1/verification");

  assert.equal(invalid.status, 400);
  assert.equal(unknown.status, 404);
  const invalidBody = await invalid.json() as Record<string, unknown>;
  const unknownBody = await unknown.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(invalidBody), ["error"]);
  assert.deepEqual(Object.keys(unknownBody), ["error"]);
  assert.match(invalidBody.error as string, /valid certificate code/i);
  assert.match(unknownBody.error as string, /No certificate was found/i);
  assert.equal(certificates.length, 0);
});

test("coordinators can revoke once and the public checker reports revoked codes as invalid", async () => {
  resetState();
  const issuedAt = new Date("2026-10-11T13:45:00.000Z");
  certificates.push({
    id: 1,
    applicationId: 101,
    programId: 9,
    certificateCode: "D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1",
    participantName: "Amina Founder",
    businessName: "Amina Ventures",
    programName,
    issuedByStaffId: 6,
    issuedAt,
    revokedAt: null,
    revokedByStaffId: null,
    revocationReason: null,
  });

  const denied = await request("/api/analytics/learning-progress/certificates/1/revoke", {
    method: "POST",
    body: { reason: "Issued by mistake" },
  });
  assert.equal(denied.status, 403);

  const emptyReason = await request("/api/analytics/learning-progress/certificates/1/revoke", {
    role: "coordinator",
    method: "POST",
    body: { reason: "   " },
  });
  assert.equal(emptyReason.status, 400);

  const response = await request("/api/analytics/learning-progress/certificates/1/revoke", {
    role: "coordinator",
    method: "POST",
    body: { reason: "Issued by mistake" },
  });
  const body = await response.json() as Record<string, any>;
  assert.equal(response.status, 200);
  assert.equal(body.issuedAt, issuedAt.toISOString());
  assert.equal(body.issuedByName, "issuer@example.com");
  assert.equal(body.revocationReason, "Issued by mistake");
  assert.equal(body.revokedByName, "coordinator@example.com");
  assert.ok(body.revokedAt);
  assert.equal(certificates[0].issuedAt, issuedAt);
  assert.equal(certificates[0].revokedByStaffId, 7);

  const repeated = await request("/api/analytics/learning-progress/certificates/1/revoke", {
    role: "coordinator",
    method: "POST",
    body: { reason: "Another reason" },
  });
  assert.equal(repeated.status, 409);

  const verification = await request(`/api/certificates/${certificates[0].certificateCode}/verification`);
  const verificationBody = await verification.json() as Record<string, any>;
  assert.equal(verification.status, 200);
  assert.equal(verificationBody.status, "revoked");
  assert.equal(verificationBody.revokedAt, body.revokedAt);
  assert.equal("revocationReason" in verificationBody, false);
});

test("participant progress is private to the accepted participant account", async () => {
  resetState();
  const revokedAt = new Date("2026-10-12T09:30:00.000Z");
  certificates.push({
    id: 1,
    applicationId: 101,
    programId: 9,
    certificateCode: "D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1",
    participantName: "Amina Founder",
    businessName: "Amina Ventures",
    programName,
    issuedByStaffId: 6,
    issuedAt: new Date("2026-10-11T13:45:00.000Z"),
    revokedAt,
    revokedByStaffId: 7,
    revocationReason: "Internal coordinator note",
  });
  progress.push({
    id: 1,
    applicationId: 101,
    moduleId: 11,
    participantClerkUserId: "participant-a",
    completedAt: new Date("2026-10-01T00:00:00.000Z"),
    lastActivityAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  progress.push({
    id: 2,
    applicationId: 102,
    moduleId: 11,
    participantClerkUserId: "participant-b",
    completedAt: null,
    lastActivityAt: new Date("2026-10-02T00:00:00.000Z"),
  });

  const a = await request("/api/progress", { user: "participant-a" });
  const aBody = await a.json() as { programs: Array<{
    completedRequiredModules: number;
    modules: Array<{ completedAt: string | null }>;
    certificate: { revokedAt: string; revokedByName: string | null; revocationReason: string | null } | null;
  }> };
  const b = await request("/api/progress", { user: "participant-b" });
  const bBody = await b.json() as { programs: Array<{ completedRequiredModules: number; modules: Array<{ completedAt: string | null }> }> };

  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(aBody.programs[0].completedRequiredModules, 1);
  assert.equal(aBody.programs[0].modules[0].completedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(aBody.programs[0].certificate?.revokedAt, revokedAt.toISOString());
  assert.equal(aBody.programs[0].certificate?.revokedByName, null);
  assert.equal(aBody.programs[0].certificate?.revocationReason, null);
  assert.equal(bBody.programs[0].completedRequiredModules, 0);
  assert.equal(bBody.programs[0].modules[0].completedAt, null);
});

test("participant progress preserves first attempts across retakes and returns every assessment for averaging", async () => {
  resetState();
  quizzes.push(
    { id: 201, moduleId: 11, title: "Pre-course A", assessmentType: "pre_course", gradingFormat: "numerical", letterGradeScale: [{ grade: "A", minimumPercent: 90 }, { grade: "F", minimumPercent: 0 }], isPublished: true },
    { id: 202, moduleId: 11, title: "Pre-course B", assessmentType: "pre_course", gradingFormat: "numerical", letterGradeScale: [{ grade: "A", minimumPercent: 90 }, { grade: "F", minimumPercent: 0 }], isPublished: true },
    { id: 203, moduleId: 11, title: "Post-course A", assessmentType: "post_course", gradingFormat: "numerical", letterGradeScale: [{ grade: "A", minimumPercent: 90 }, { grade: "F", minimumPercent: 0 }], isPublished: true },
    { id: 204, moduleId: 11, title: "Post-course B", assessmentType: "post_course", gradingFormat: "numerical", letterGradeScale: [{ grade: "A", minimumPercent: 90 }, { grade: "F", minimumPercent: 0 }], isPublished: true },
  );
  const submittedAt = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`);
  quizAttempts.push(
    { id: 1, quizId: 201, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 4, totalQuestions: 10, submittedAt: submittedAt(1) },
    { id: 2, quizId: 201, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 20, totalQuestions: 20, submittedAt: submittedAt(5) },
    { id: 3, quizId: 202, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 8, totalQuestions: 10, submittedAt: submittedAt(2) },
    { id: 4, quizId: 202, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 0, totalQuestions: 10, submittedAt: submittedAt(6) },
    { id: 5, quizId: 203, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 7, totalQuestions: 10, submittedAt: submittedAt(3) },
    { id: 6, quizId: 203, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 0, totalQuestions: 10, submittedAt: submittedAt(7) },
    { id: 7, quizId: 204, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 9, totalQuestions: 10, submittedAt: submittedAt(4) },
    { id: 8, quizId: 204, applicationId: 101, participantBusinessId: 201, participantClerkUserId: "participant-a", score: 0, totalQuestions: 10, submittedAt: submittedAt(8) },
  );

  const response = await request("/api/progress", { user: "participant-a" });
  const body = await response.json() as {
    programs: Array<{
      quizzes: Array<{
        quizId: number;
        firstScore: number | null;
        firstTotalQuestions: number;
        latestScore: number | null;
        attempts: number;
      }>;
    }>;
  };

  assert.equal(response.status, 200);
  assert.deepEqual(body.programs[0].quizzes.map(({ quizId, firstScore, firstTotalQuestions, latestScore, attempts }) => ({
    quizId, firstScore, firstTotalQuestions, latestScore, attempts,
  })), [
    { quizId: 201, firstScore: 4, firstTotalQuestions: 10, latestScore: 20, attempts: 2 },
    { quizId: 202, firstScore: 8, firstTotalQuestions: 10, latestScore: 0, attempts: 2 },
    { quizId: 203, firstScore: 7, firstTotalQuestions: 10, latestScore: 0, attempts: 2 },
    { quizId: 204, firstScore: 9, firstTotalQuestions: 10, latestScore: 0, attempts: 2 },
  ]);
  const firstPercentages = body.programs[0].quizzes.map((quiz) => quiz.firstScore! / quiz.firstTotalQuestions * 100);
  assert.equal(firstPercentages.slice(0, 2).reduce((sum, value) => sum + value, 0) / 2, 60);
  assert.equal(firstPercentages.slice(2).reduce((sum, value) => sum + value, 0) / 2, 80);
});

test("only coordinators can issue certificates", async () => {
  resetState();
  progress.push({
    id: 1,
    applicationId: 101,
    moduleId: 11,
    participantClerkUserId: "participant-a",
    completedAt: new Date(),
    lastActivityAt: new Date(),
  });

  const denied = await request(certificatePath(), { role: "trainer", method: "POST" });

  assert.equal(denied.status, 403);
  assert.equal(certificates.length, 0);
});

test("certificate eligibility includes all required released published modules only", async () => {
  resetState();
  progress.push({
    id: 1,
    applicationId: 101,
    moduleId: 12,
    participantClerkUserId: "participant-a",
    completedAt: new Date(),
    lastActivityAt: new Date(),
  });
  const missingReleasedCompletion = await request(certificatePath(), {
    role: "coordinator",
    method: "POST",
  });
  assert.equal(missingReleasedCompletion.status, 400);

  progress.push({
    id: 2,
    applicationId: 101,
    moduleId: 11,
    participantClerkUserId: "participant-a",
    completedAt: new Date(),
    lastActivityAt: new Date(),
  });
  const eligible = await request(certificatePath(), { role: "coordinator", method: "POST" });

  assert.equal(eligible.status, 201);
  assert.equal(certificates.length, 1);
});

test("simultaneous and repeated certificate approvals issue only one certificate", async () => {
  resetState();
  progress.push({
    id: 1,
    applicationId: 101,
    moduleId: 11,
    participantClerkUserId: "participant-a",
    completedAt: new Date(),
    lastActivityAt: new Date(),
  });

  const concurrent = await Promise.all([
    request(certificatePath(), { role: "coordinator", method: "POST" }),
    request(certificatePath(), { role: "coordinator", method: "POST" }),
  ]);
  const retry = await request(certificatePath(), { role: "coordinator", method: "POST" });

  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(retry.status, 409);
  assert.equal(certificates.length, 1);
});

test("a progress update cannot change eligibility midway through certificate approval", async () => {
  resetState();
  progress.push({
    id: 1,
    applicationId: 101,
    moduleId: 11,
    participantClerkUserId: "participant-a",
    completedAt: new Date(),
    lastActivityAt: new Date(),
  });
  let signalInsertStarted!: () => void;
  const insertStarted = new Promise<void>((resolve) => { signalInsertStarted = resolve; });
  let releaseInsert!: () => void;
  const insertGate = new Promise<void>((resolve) => { releaseInsert = resolve; });
  beforeCertificateInsert = () => insertGate;
  onCertificateInsert = signalInsertStarted;

  const approval = request(certificatePath(), { role: "coordinator", method: "POST" });
  await insertStarted;
  const revokeProgress = request("/api/modules/11/progress", {
    user: "participant-a",
    method: "POST",
    body: { completed: false },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(progress[0].completedAt instanceof Date);

  releaseInsert();
  const [approvalResponse, progressResponse] = await Promise.all([approval, revokeProgress]);

  assert.equal(approvalResponse.status, 201);
  assert.equal(progressResponse.status, 200);
  assert.equal(certificates.length, 1);
  assert.equal(progress[0].completedAt, null);
});
