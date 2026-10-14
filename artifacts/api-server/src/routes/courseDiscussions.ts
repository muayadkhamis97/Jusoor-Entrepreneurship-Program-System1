import { getAuth } from "@clerk/express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCourseDiscussionPostBody,
  CreateCourseDiscussionPostParams,
  CreateCourseDiscussionPostResponse,
  CreateParticipantCourseDiscussionPostBody,
  CreateParticipantCourseDiscussionPostParams,
  CreateParticipantCourseDiscussionPostResponse,
  GetCourseDiscussionsParams,
  GetCourseDiscussionsResponse,
  GetParticipantCourseDiscussionsParams,
  GetParticipantCourseDiscussionsResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  businessesTable,
  courseDiscussionPostsTable,
  courseModulesTable,
  db,
  sessionsTable,
} from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import type { StaffAccess } from "../middlewares/staffAccess";
import { isCourseModuleReleased } from "../lib/courseAccess";

type DiscussionRole = "participant" | "trainer" | "coordinator";

type DiscussionAuthor = {
  role: DiscussionRole;
  userId: string;
  staffId?: number;
  businessId?: number | null;
  displayName: string;
};

const staffRouter: IRouter = Router();
const participantRouter: IRouter = Router();

function displayAuthor(role: string, businessName: string | null): string {
  if (role === "participant") return businessName || "Program participant";
  if (role === "trainer") return "Program trainer";
  return "Jusoor admin";
}

async function getStaffModule(moduleId: number, staff: StaffAccess) {
  if (staff.role !== "coordinator" && staff.role !== "trainer") {
    return { error: "forbidden" as const };
  }
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, moduleId))
    .limit(1);
  if (!module) return { error: "not-found" as const };

  if (staff.role === "trainer") {
    if (!isCourseModuleReleased(module.isPublished, module.releaseAt)) {
      return { error: "not-found" as const };
    }
    const [assignment] = await db.select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(and(
        eq(sessionsTable.trainerStaffId, staff.id),
        eq(sessionsTable.programId, module.programId),
      ))
      .limit(1);
    if (!assignment) return { error: "forbidden" as const };
  }
  return { module };
}

async function getParticipantModule(moduleId: number, participant: ParticipantAccess) {
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, moduleId))
    .limit(1);
  if (!module || !isCourseModuleReleased(module.isPublished, module.releaseAt)) {
    return { error: "not-found" as const };
  }

  const [enrollment] = await db.select({
    businessId: applicationsTable.businessId,
    businessName: businessesTable.businessName,
  })
    .from(applicationsTable)
    .leftJoin(businessesTable, eq(applicationsTable.businessId, businessesTable.id))
    .where(and(
      eq(applicationsTable.clerkUserId, participant.userId),
      eq(applicationsTable.programId, module.programId),
      eq(applicationsTable.status, "accepted"),
    ))
    .limit(1);
  if (!enrollment) return { error: "forbidden" as const };
  return { module, enrollment };
}

async function getPosts(moduleId: number) {
  const rows = await db.select({
    id: courseDiscussionPostsTable.id,
    parentId: courseDiscussionPostsTable.parentId,
    title: courseDiscussionPostsTable.title,
    body: courseDiscussionPostsTable.body,
    authorRole: courseDiscussionPostsTable.authorRole,
    authorBusinessName: businessesTable.businessName,
    createdAt: courseDiscussionPostsTable.createdAt,
  })
    .from(courseDiscussionPostsTable)
    .leftJoin(businessesTable, eq(courseDiscussionPostsTable.authorBusinessId, businessesTable.id))
    .where(eq(courseDiscussionPostsTable.moduleId, moduleId))
    .orderBy(asc(courseDiscussionPostsTable.createdAt), asc(courseDiscussionPostsTable.id));
  return rows.map((post) => ({
    id: post.id,
    parentId: post.parentId,
    title: post.title,
    body: post.body,
    authorName: displayAuthor(post.authorRole, post.authorBusinessName),
    authorRole: post.authorRole,
    createdAt: post.createdAt.toISOString(),
  }));
}

async function createPost(moduleId: number, input: unknown, author: DiscussionAuthor) {
  const body = CreateCourseDiscussionPostBody.safeParse(input);
  if (!body.success) return { error: body.error.message, status: 400 as const };

  const message = body.data.body.trim();
  const parentId = body.data.parentId ?? null;
  const title = body.data.title?.trim() ?? "";
  if (!message) return { error: "Write a message before posting.", status: 400 as const };
  if (parentId === null && !title) {
    return { error: "Add a topic title before starting a discussion.", status: 400 as const };
  }
  if (parentId !== null && title) {
    return { error: "Replies cannot include a topic title.", status: 400 as const };
  }

  if (parentId !== null) {
    const [parent] = await db.select({ id: courseDiscussionPostsTable.id })
      .from(courseDiscussionPostsTable)
      .where(and(
        eq(courseDiscussionPostsTable.id, parentId),
        eq(courseDiscussionPostsTable.moduleId, moduleId),
        isNull(courseDiscussionPostsTable.parentId),
      ))
      .limit(1);
    if (!parent) return { error: "Discussion topic not found.", status: 404 as const };
  }

  const [post] = await db.insert(courseDiscussionPostsTable).values({
    moduleId,
    parentId,
    authorRole: author.role,
    authorStaffId: author.staffId ?? null,
    authorBusinessId: author.businessId ?? null,
    authorClerkUserId: author.userId,
    title: parentId === null ? title : null,
    body: message,
  }).returning();

  return {
    post: {
      id: post.id,
      parentId: post.parentId,
      title: post.title,
      body: post.body,
      authorName: author.displayName,
      authorRole: author.role,
      createdAt: post.createdAt.toISOString(),
    },
  };
}

staffRouter.get("/modules/:id/discussions", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const params = GetCourseDiscussionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await getStaffModule(params.data.id, staff);
  if ("error" in access) {
    res.status(access.error === "not-found" ? 404 : 403).json({
      error: access.error === "not-found" ? "Course module not found." : "This account cannot access course discussions.",
    });
    return;
  }
  res.json(GetCourseDiscussionsResponse.parse({
    moduleId: access.module.id,
    moduleTitle: access.module.title,
    posts: await getPosts(access.module.id),
  }));
});

staffRouter.post("/modules/:id/discussions", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess;
  const params = CreateCourseDiscussionPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await getStaffModule(params.data.id, staff);
  if ("error" in access) {
    res.status(access.error === "not-found" ? 404 : 403).json({
      error: access.error === "not-found" ? "Course module not found." : "This account cannot post in course discussions.",
    });
    return;
  }
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in with an approved staff account." });
    return;
  }
  const result = await createPost(params.data.id, req.body, {
    role: staff.role as "coordinator" | "trainer",
    userId,
    staffId: staff.id,
    displayName: displayAuthor(staff.role, null),
  });
  if (!("post" in result)) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(CreateCourseDiscussionPostResponse.parse(result.post));
});

participantRouter.get("/modules/:id/discussions", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess;
  const params = GetParticipantCourseDiscussionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await getParticipantModule(params.data.id, participant);
  if ("error" in access) {
    res.status(access.error === "not-found" ? 404 : 403).json({
      error: access.error === "not-found" ? "Released course module not found." : "This module is not part of your accepted cohort.",
    });
    return;
  }
  res.json(GetParticipantCourseDiscussionsResponse.parse({
    moduleId: access.module.id,
    moduleTitle: access.module.title,
    posts: await getPosts(access.module.id),
  }));
});

participantRouter.post("/modules/:id/discussions", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess;
  const params = CreateParticipantCourseDiscussionPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await getParticipantModule(params.data.id, participant);
  if ("error" in access) {
    res.status(access.error === "not-found" ? 404 : 403).json({
      error: access.error === "not-found" ? "Released course module not found." : "This module is not part of your accepted cohort.",
    });
    return;
  }
  const result = await createPost(params.data.id, req.body, {
    role: "participant",
    userId: participant.userId,
    businessId: access.enrollment.businessId,
    displayName: displayAuthor("participant", access.enrollment.businessName),
  });
  if (!("post" in result)) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(CreateParticipantCourseDiscussionPostResponse.parse(result.post));
});

export const staffCourseDiscussionRouter = staffRouter;
export const participantCourseDiscussionRouter = participantRouter;
