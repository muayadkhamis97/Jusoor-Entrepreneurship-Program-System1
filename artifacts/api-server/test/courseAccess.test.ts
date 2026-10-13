import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { after, before, test } from "node:test";
import {
  canAccessCourseMaterial,
  canManageCourseContent,
  canViewCourseManagement,
  isCourseModuleReleased,
} from "../src/lib/courseAccess";

const nativeFetch = globalThis.fetch;
let server: Server;
let role: "coordinator" | "staff" | "participant" | "trainer" | "mentor" | "judge" = "trainer";

before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const { default: coursesRouter } = await import("../src/routes/courses");
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, {
      staff: { id: 1, email: "course-access-test@example.com", role, status: "active" },
    });
    next();
  });
  app.use("/api/courses", coursesRouter);
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

test("course management is visible only to coordinators and trainers", () => {
  assert.equal(canViewCourseManagement("coordinator"), true);
  assert.equal(canViewCourseManagement("trainer"), true);
  assert.equal(canViewCourseManagement("staff"), false);
  assert.equal(canViewCourseManagement("mentor"), false);
  assert.equal(canViewCourseManagement("judge"), false);
});

test("only coordinators can create, edit, or remove course content", () => {
  assert.equal(canManageCourseContent("coordinator"), true);
  assert.equal(canManageCourseContent("trainer"), false);
  assert.equal(canManageCourseContent("mentor"), false);
  assert.equal(canManageCourseContent("judge"), false);
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
