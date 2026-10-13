import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { after, before, test } from "node:test";
import {
  canAccessCourseMaterial,
  canManageCourseContent,
  canScheduleCourseRelease,
  canViewCourseManagement,
  canViewCourseMaterialFile,
  isScheduleOnlyModuleUpdate,
  isCourseModuleReleased,
} from "../src/lib/courseAccess";

const nativeFetch = globalThis.fetch;
let server: Server;
let role: "coordinator" | "staff" | "participant" | "trainer" | "mentor" | "judge" = "trainer";

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const { default: coursesRouter } = await import("../src/routes/courses");
  const { staffCourseDiscussionRouter } = await import("../src/routes/courseDiscussions");
  const { staffCourseQuizRouter } = await import("../src/routes/courseQuizzes");
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, {
      staff: { id: 1, email: "course-access-test@example.com", role, status: "active" },
    });
    next();
  });
  app.use("/api/courses", coursesRouter);
  app.use("/api/courses", staffCourseDiscussionRouter);
  app.use("/api/courses", staffCourseQuizRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function request(path: string, init?: RequestInit): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return nativeFetch(`http://127.0.0.1:${address.port}${path}`, init);
}

test("course management is visible to coordinators, program staff, and trainers", () => {
  assert.equal(canViewCourseManagement("coordinator"), true);
  assert.equal(canViewCourseManagement("staff"), true);
  assert.equal(canViewCourseManagement("trainer"), true);
  assert.equal(canViewCourseManagement("mentor"), false);
  assert.equal(canViewCourseManagement("judge"), false);
});

test("only coordinators can create, edit, or remove course content", () => {
  assert.equal(canManageCourseContent("coordinator"), true);
  assert.equal(canManageCourseContent("trainer"), false);
  assert.equal(canManageCourseContent("staff"), false);
  assert.equal(canManageCourseContent("mentor"), false);
  assert.equal(canManageCourseContent("judge"), false);
});

test("program staff can schedule releases but cannot update other module fields", () => {
  assert.equal(canScheduleCourseRelease("coordinator"), true);
  assert.equal(canScheduleCourseRelease("staff"), true);
  assert.equal(canScheduleCourseRelease("trainer"), false);
  assert.equal(isScheduleOnlyModuleUpdate({ releaseAt: "2026-10-14T09:00:00.000Z" }), true);
  assert.equal(isScheduleOnlyModuleUpdate({ releaseAt: new Date("2026-10-14T09:00:00.000Z") }), true);
  assert.equal(isScheduleOnlyModuleUpdate({ releaseAt: null }), false);
  assert.equal(isScheduleOnlyModuleUpdate({ releaseAt: "2026-10-14T09:00:00.000Z", title: "Changed" }), false);
  assert.equal(isScheduleOnlyModuleUpdate({ title: "Changed" }), false);
});

test("only coordinators and trainers can request course files", () => {
  assert.equal(canViewCourseMaterialFile("coordinator"), true);
  assert.equal(canViewCourseMaterialFile("trainer"), true);
  assert.equal(canViewCourseMaterialFile("staff"), false);
  assert.equal(canViewCourseMaterialFile("mentor"), false);
});

test("course material access follows its role allowlist", () => {
  assert.equal(canAccessCourseMaterial("participant", ["participant"]), true);
  assert.equal(canAccessCourseMaterial("participant", ["trainer"]), false);
  assert.equal(canAccessCourseMaterial("trainer", ["trainer"]), true);
  assert.equal(canAccessCourseMaterial("trainer", ["participant"]), false);
  assert.equal(canAccessCourseMaterial("mentor", ["trainer"]), false);
  assert.equal(canAccessCourseMaterial("judge", ["participant"]), false);
  assert.equal(canAccessCourseMaterial("coordinator", []), true);
});

test("trainer-facing course modules must be published and released", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");
  assert.equal(isCourseModuleReleased(false, null, now), false);
  assert.equal(isCourseModuleReleased(true, new Date("2026-10-14T00:00:00.000Z"), now), false);
  assert.equal(isCourseModuleReleased(true, new Date("2026-10-13T12:00:00.000Z"), now), true);
  assert.equal(isCourseModuleReleased(true, null, now), true);
});

test("course routes deny trainer editing and deny other roles course management", async () => {
  role = "trainer";
  const trainerResponses = await Promise.all([
    request("/api/courses/modules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    request("/api/courses/uploads/request-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  ]);
  assert.deepEqual(trainerResponses.map(({ status }) => status), [403, 403]);

  role = "mentor";
  assert.equal((await request("/api/courses/management")).status, 403);
  role = "judge";
  assert.equal((await request("/api/courses/materials/1/file")).status, 403);
});

test("program staff can schedule modules but cannot create content, edit module details, or download files", async () => {
  role = "staff";
  const create = await request("/api/courses/modules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const changeTitle = await request("/api/courses/modules/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Unauthorized title change" }),
  });
  const scheduleWithInvalidId = await request("/api/courses/modules/not-an-id", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ releaseAt: "2026-10-14T09:00:00.000Z" }),
  });
  const file = await request("/api/courses/materials/1/file");

  assert.deepEqual([create.status, changeTitle.status, scheduleWithInvalidId.status, file.status], [403, 403, 400, 403]);
});

test("course discussions reject staff without course access and validate module ids", async () => {
  for (const restrictedRole of ["staff", "mentor", "judge"] as const) {
    role = restrictedRole;
    const read = await request("/api/courses/modules/1/discussions");
    const post = await request("/api/courses/modules/1/discussions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Question", body: "A valid discussion message." }),
    });
    assert.deepEqual([read.status, post.status], [403, 403]);
  }

  role = "coordinator";
  const invalidIdRead = await request("/api/courses/modules/not-an-id/discussions");
  const invalidIdPost = await request("/api/courses/modules/not-an-id/discussions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Question", body: "A valid discussion message." }),
  });
  assert.deepEqual([invalidIdRead.status, invalidIdPost.status], [400, 400]);
});

test("quiz authoring is coordinator-only and program staff cannot access quiz content", async () => {
  role = "staff";
  const read = await request("/api/courses/modules/1/quizzes");
  const create = await request("/api/courses/modules/1/quizzes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  role = "trainer";
  const update = await request("/api/courses/quizzes/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.deepEqual([read.status, create.status, update.status], [403, 403, 403]);
});
