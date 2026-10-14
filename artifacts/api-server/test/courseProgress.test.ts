import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { after, before, test } from "node:test";

const nativeFetch = globalThis.fetch;
let server: Server;
let db: typeof import("@workspace/db").db;
let restoreSelect: (() => void) | undefined;
let restoreTransaction: (() => void) | undefined;
let applications: Array<Record<string, any>>;
let modules: Array<Record<string, any>>;
let progress: Array<Record<string, any>>;
let certificates: Array<Record<string, any>>;
let quizzes: Array<Record<string, any>>;
let quizAttempts: Array<Record<string, any>>;
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
  selectedApplicationIds = new Set();
  selectedRequiredModuleIds = new Set();
  transactionTail = Promise.resolve();
  beforeCertificateInsert = undefined;
  onCertificateInsert = undefined;
}

function replaceDbMethod(
  name: "select" | "transaction",
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
    courseQuizAttemptsTable,
    courseQuizzesTable,
  } = requireDbTables;
  let rows: Array<Record<string, any>> = [];
  if (table === applicationsTable) {
    if (requestPath.endsWith("/certificate") && joined) {
      const found = applications.find((item) => item.id === Number(requestPath.split("/").at(-2)));
      rows = found ? [{ application: found, programName }] : [];
    } else if (joined && requestUserId) {
      rows = applications
        .filter((item) => item.clerkUserId === requestUserId && item.status === "accepted")
        .map((item) => ({ ...item, programName }));
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
        }));
    } else {
      rows = certificates.map((certificate) => joined
        ? { certificate, issuedByName: "coordinator@example.com" }
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
    courseQuizAttemptsTable: schema.courseQuizAttemptsTable,
    courseQuizzesTable: schema.courseQuizzesTable,
  };
  const { participantCourseProgressRouter, publicCertificateVerificationRouter, staffLearningProgressRouter } =
    await import("../src/routes/courseProgress");
  resetState();

  restoreSelect = replaceDbMethod("select", (() => makeSelect()) as (...args: never[]) => unknown);
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
  app.use("/api", publicCertificateVerificationRouter);
  app.use("/api", staffLearningProgressRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  restoreTransaction?.();
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
    "status",
  ]);
  assert.equal(body.status, "issued");
  assert.equal(body.participantName, "Amina Founder");
  assert.equal(body.businessName, "Amina Ventures");
  assert.equal(body.programName, programName);
  assert.equal(body.certificateCode, certificates[0].certificateCode);
  assert.equal(body.issuedAt, issuedAt.toISOString());
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
  assert.equal(legacyResponse.status, 200);
  assert.equal((await legacyResponse.json() as { certificateCode: string }).certificateCode, "JUS-2026-AR-8F31D2");
});

test("invalid and unknown public certificate codes are clearly distinguished", async () => {
  resetState();
  const invalid = await request("/api/certificates/not-a-code/verification");
  const unknown = await request("/api/certificates/D35F9C80-2F1A-4D42-8CB3-301C4C9CD8A1/verification");

  assert.equal(invalid.status, 400);
  assert.equal(unknown.status, 404);
  assert.match((await invalid.json() as { error: string }).error, /valid certificate code/i);
  assert.match((await unknown.json() as { error: string }).error, /No active certificate/i);
  assert.equal(certificates.length, 0);
});

test("participant progress is private to the accepted participant account", async () => {
  resetState();
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
  const aBody = await a.json() as { programs: Array<{ completedRequiredModules: number; modules: Array<{ completedAt: string | null }> }> };
  const b = await request("/api/progress", { user: "participant-b" });
  const bBody = await b.json() as { programs: Array<{ completedRequiredModules: number; modules: Array<{ completedAt: string | null }> }> };

  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(aBody.programs[0].completedRequiredModules, 1);
  assert.equal(aBody.programs[0].modules[0].completedAt, "2026-10-01T00:00:00.000Z");
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
