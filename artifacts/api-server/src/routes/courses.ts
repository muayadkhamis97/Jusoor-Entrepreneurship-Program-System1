import { asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCourseMaterialBody,
  CreateCourseMaterialParams,
  CreateCourseModuleBody,
  CreateCourseMaterialResponse,
  CreateCourseModuleResponse,
  DeleteCourseMaterialParams,
  DeleteCourseModuleParams,
  GetCourseManagementResponse,
  GetCourseMaterialFileParams,
  RequestCourseUploadUrlBody,
  RequestCourseUploadUrlResponse,
  UpdateCourseMaterialBody,
  UpdateCourseMaterialParams,
  UpdateCourseMaterialResponse,
  UpdateCourseModuleBody,
  UpdateCourseModuleParams,
  UpdateCourseModuleResponse,
} from "@workspace/api-zod";
import {
  courseMaterialsTable,
  courseModulesTable,
  db,
  programsTable,
  sessionsTable,
  type CourseMaterial,
} from "@workspace/db";
import type { StaffAccess } from "../middlewares/staffAccess";
import {
  canAccessCourseMaterial,
  canManageCourseContent,
  canScheduleCourseRelease,
  canViewCourseManagement,
  canViewCourseMaterialFile,
  isScheduleOnlyModuleUpdate,
  isCourseModuleReleased,
} from "../lib/courseAccess";
import {
  createCourseUploadUrl,
  deleteCourseMaterialFile,
  getCourseMaterialFile,
  isSupportedCourseFile,
  streamCourseMaterialFile,
} from "../lib/courseStorage";
import { deleteCoursePackageCache, prepareCoursePackage, type CoursePackageInfo, type CoursePackageKind } from "../lib/coursePackageStorage";

const router: IRouter = Router();
const maxUploadBytes = 250 * 1024 * 1024;
const maxPackageBytes = 100 * 1024 * 1024;
const courseMaterialRoles = ["participant", "trainer", "coordinator"] as const;

type CourseMaterialRole = (typeof courseMaterialRoles)[number];

async function manageableProgramIds(staff: StaffAccess): Promise<number[] | null> {
  if (staff.role === "coordinator" || staff.role === "staff") return null;
  if (staff.role !== "trainer") return [];
  const assignments = await db.select({ programId: sessionsTable.programId })
    .from(sessionsTable)
    .where(eq(sessionsTable.trainerStaffId, staff.id));
  return [...new Set(assignments.flatMap(({ programId }) => programId === null ? [] : [programId]))];
}

async function findManageableModule(moduleId: number, staff: StaffAccess) {
  const [module] = await db.select().from(courseModulesTable)
    .where(eq(courseModulesTable.id, moduleId)).limit(1);
  if (!module) return null;
  const programIds = await manageableProgramIds(staff);
  if (programIds !== null && !programIds.includes(module.programId)) return null;
  return module;
}

async function findManageableMaterial(materialId: number, staff: StaffAccess) {
  const [material] = await db.select({
    material: courseMaterialsTable,
    module: courseModulesTable,
  })
    .from(courseMaterialsTable)
    .innerJoin(courseModulesTable, eq(courseMaterialsTable.moduleId, courseModulesTable.id))
    .where(eq(courseMaterialsTable.id, materialId))
    .limit(1);
  if (!material) return null;
  const programIds = await manageableProgramIds(staff);
  if (programIds !== null && !programIds.includes(material.module.programId)) return null;
  return material;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validRoleList(roles: string[]): roles is CourseMaterialRole[] {
  return roles.length > 0 && roles.every((role) => courseMaterialRoles.includes(role as CourseMaterialRole));
}

function validObjectPath(objectPath: string, programId: number): boolean {
  return new RegExp(`^/objects/course-materials/${programId}/[0-9a-f-]{36}$`, "i").test(objectPath);
}

function mapMaterial(material: CourseMaterial) {
  return {
    id: material.id,
    moduleId: material.moduleId,
    title: material.title,
    description: material.description,
    kind: material.kind,
    language: material.language,
    packageFormat: material.packageFormat,
    externalUrl: material.externalUrl,
    objectPath: material.objectPath,
    fileName: material.fileName,
    contentType: material.contentType,
    fileSize: material.fileSize,
    allowedRoles: material.allowedRoles,
    position: material.position,
  };
}

router.get("/management", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || !canViewCourseManagement(staff.role)) {
    res.status(403).json({ error: "Coordinator, program staff, or assigned trainer access is required." });
    return;
  }
  const programIds = await manageableProgramIds(staff);
  if (programIds?.length === 0) {
    res.json(GetCourseManagementResponse.parse({ programs: [] }));
    return;
  }

  const rows = await db.select({
    programId: programsTable.id,
    programName: programsTable.name,
    moduleId: courseModulesTable.id,
    moduleTitle: courseModulesTable.title,
    moduleDescription: courseModulesTable.description,
    modulePosition: courseModulesTable.position,
    moduleReleaseAt: courseModulesTable.releaseAt,
    moduleIsPublished: courseModulesTable.isPublished,
    material: courseMaterialsTable,
  })
    .from(programsTable)
    .leftJoin(courseModulesTable, eq(courseModulesTable.programId, programsTable.id))
    .leftJoin(courseMaterialsTable, eq(courseMaterialsTable.moduleId, courseModulesTable.id))
    .where(programIds === null ? undefined : inArray(programsTable.id, programIds))
    .orderBy(asc(programsTable.name), asc(courseModulesTable.position), asc(courseMaterialsTable.position));

  const programs = new Map<number, {
    id: number;
    name: string;
    modules: Map<number, {
      id: number;
      programId: number;
      title: string;
      description: string | null;
      position: number;
      releaseAt: string | null;
      isPublished: boolean;
      materials: ReturnType<typeof mapMaterial>[];
    }>;
  }>();
  const now = new Date();
  for (const row of rows) {
    if (
      staff.role === "trainer" &&
      !isCourseModuleReleased(row.moduleIsPublished ?? false, row.moduleReleaseAt, now)
    ) continue;
    if (
      staff.role === "trainer" &&
      row.material &&
      !canAccessCourseMaterial("trainer", row.material.allowedRoles)
    ) continue;
    let program = programs.get(row.programId);
    if (!program) {
      program = { id: row.programId, name: row.programName, modules: new Map() };
      programs.set(row.programId, program);
    }
    if (row.moduleId === null || row.moduleTitle === null || row.modulePosition === null) continue;
    let module = program.modules.get(row.moduleId);
    if (!module) {
      module = {
        id: row.moduleId,
        programId: row.programId,
        title: row.moduleTitle,
        description: staff.role === "staff" ? null : row.moduleDescription,
        position: row.modulePosition,
        releaseAt: row.moduleReleaseAt?.toISOString() ?? null,
        isPublished: row.moduleIsPublished ?? false,
        materials: [],
      };
      program.modules.set(row.moduleId, module);
    }
    if (row.material && staff.role !== "staff") module.materials.push(mapMaterial(row.material));
  }
  res.json(GetCourseManagementResponse.parse({
    programs: [...programs.values()].map(({ id, name, modules }) => ({
      id,
      name,
      modules: [...modules.values()],
    })),
  }));
});

router.post("/modules", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  if (!staff || !canManageCourseContent(staff.role)) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  const body = CreateCourseModuleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const programIds = await manageableProgramIds(staff);
  if (programIds !== null && !programIds.includes(body.data.programId)) {
    res.status(403).json({ error: "This program is not assigned to the trainer." });
    return;
  }
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(eq(programsTable.id, body.data.programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  const [module] = await db.insert(courseModulesTable).values({
    programId: body.data.programId,
    title: body.data.title,
    description: body.data.description ?? null,
    position: body.data.position,
    releaseAt: body.data.releaseAt ? new Date(body.data.releaseAt) : null,
    isPublished: body.data.isPublished,
    createdByStaffId: staff.id,
  }).returning();
  res.status(201).json(CreateCourseModuleResponse.parse({
    ...module,
    releaseAt: module.releaseAt?.toISOString() ?? null,
    materials: [],
  }));
});

router.patch("/modules/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = UpdateCourseModuleParams.safeParse(req.params);
  const body = UpdateCourseModuleBody.safeParse(req.body);
  if (!staff || (!canManageCourseContent(staff.role) && !canScheduleCourseRelease(staff.role))) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (staff.role === "staff" && !isScheduleOnlyModuleUpdate(body.data as Record<string, unknown>)) {
    res.status(403).json({ error: "Program staff can only set a module release date and time." });
    return;
  }
  const existing = await findManageableModule(params.data.id, staff);
  if (!existing) {
    res.status(404).json({ error: "Course module not found." });
    return;
  }
  const values: Partial<typeof courseModulesTable.$inferInsert> = {};
  if (body.data.title !== undefined) values.title = body.data.title;
  if (body.data.description !== undefined) values.description = body.data.description ?? null;
  if (body.data.position !== undefined) values.position = body.data.position;
  if (body.data.releaseAt !== undefined) values.releaseAt = body.data.releaseAt ? new Date(body.data.releaseAt) : null;
  if (body.data.isPublished !== undefined) values.isPublished = body.data.isPublished;
  const [module] = await db.update(courseModulesTable).set(values)
    .where(eq(courseModulesTable.id, existing.id)).returning();
  const materials = await db.select().from(courseMaterialsTable)
    .where(eq(courseMaterialsTable.moduleId, module.id))
    .orderBy(asc(courseMaterialsTable.position));
  res.json(UpdateCourseModuleResponse.parse({
    ...module,
    description: staff.role === "staff" ? null : module.description,
    releaseAt: module.releaseAt?.toISOString() ?? null,
    materials: staff.role === "staff" ? [] : materials.map(mapMaterial),
  }));
});

router.delete("/modules/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = DeleteCourseModuleParams.safeParse(req.params);
  if (!staff || !canManageCourseContent(staff.role)) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const module = await findManageableModule(params.data.id, staff);
  if (!module) {
    res.status(404).json({ error: "Course module not found." });
    return;
  }
  const materials = await db.select({ objectPath: courseMaterialsTable.objectPath })
    .from(courseMaterialsTable).where(eq(courseMaterialsTable.moduleId, module.id));
  await db.delete(courseModulesTable).where(eq(courseModulesTable.id, module.id));
  await Promise.all(materials.flatMap(({ objectPath }) => objectPath ? [
    deleteCourseMaterialFile(objectPath).catch((error: unknown) => {
      req.log.warn({ err: error, moduleId: module.id }, "Could not delete a course file after module removal");
    }),
  ] : []));
  res.status(204).end();
});

router.post("/modules/:id/materials", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = CreateCourseMaterialParams.safeParse(req.params);
  const body = CreateCourseMaterialBody.safeParse(req.body);
  if (!staff || !canManageCourseContent(staff.role)) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const module = await findManageableModule(params.data.id, staff);
  if (!module) {
    res.status(404).json({ error: "Course module not found." });
    return;
  }
  const data = body.data;
  if (!validRoleList(data.allowedRoles)) {
    res.status(400).json({ error: "Choose at least one supported course role." });
    return;
  }
  const hasExternalUrl = typeof data.externalUrl === "string" && data.externalUrl.length > 0;
  const hasObjectPath = typeof data.objectPath === "string" && data.objectPath.length > 0;
  const packageKind: CoursePackageKind | null = data.kind === "scorm" || data.kind === "xapi" ? data.kind : null;
  if (hasExternalUrl === hasObjectPath) {
    res.status(400).json({ error: "Provide either an external URL or an uploaded file, not both." });
    return;
  }
  if (hasExternalUrl && !isValidHttpUrl(data.externalUrl!)) {
    res.status(400).json({ error: "Course links must use http or https." });
    return;
  }
  if (packageKind && (hasExternalUrl || !hasObjectPath)) {
    res.status(400).json({ error: "SCORM and Tin Can materials must use an uploaded ZIP package." });
    return;
  }
  if (!packageKind && hasObjectPath && /zip/i.test(data.contentType ?? "")) {
    res.status(400).json({ error: "Choose SCORM or Tin Can package as the material type for ZIP uploads." });
    return;
  }
  let packageInfo: CoursePackageInfo | null = null;
  if (hasObjectPath) {
    if (!validObjectPath(data.objectPath!, module.programId) || !data.fileName || !data.contentType || !data.fileSize ||
      data.fileSize > (packageKind ? maxPackageBytes : maxUploadBytes) || !isSupportedCourseFile(data.contentType) ||
      (packageKind && (!/\.zip$/i.test(data.fileName) || !["application/zip", "application/x-zip-compressed"].includes(data.contentType.toLowerCase())))) {
      res.status(400).json({ error: "The uploaded course file is invalid or too large." });
      return;
    }
    try {
      const file = await getCourseMaterialFile(data.objectPath!);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) !== data.fileSize || metadata.contentType !== data.contentType) {
        res.status(400).json({ error: "Uploaded file details do not match the file in storage." });
        return;
      }
    } catch {
      res.status(400).json({ error: "The uploaded file could not be found." });
      return;
    }
    if (packageKind) {
      try {
        packageInfo = await prepareCoursePackage(data.objectPath!, packageKind);
      } catch (error) {
        await deleteCourseMaterialFile(data.objectPath!).catch(() => undefined);
        res.status(400).json({ error: error instanceof Error ? error.message : "The course package could not be read." });
        return;
      }
    }
  }
  const [material] = await db.insert(courseMaterialsTable).values({
    moduleId: module.id,
    title: data.title,
    description: data.description ?? null,
    kind: data.kind,
    language: data.language ?? "en",
    packageFormat: packageInfo?.format ?? null,
    packageLaunchPath: packageInfo?.launchPath ?? null,
    packageActivityId: packageInfo?.activityId ?? null,
    externalUrl: hasExternalUrl ? data.externalUrl! : null,
    objectPath: hasObjectPath ? data.objectPath! : null,
    fileName: hasObjectPath ? data.fileName! : null,
    contentType: hasObjectPath ? data.contentType! : null,
    fileSize: hasObjectPath ? data.fileSize! : null,
    allowedRoles: data.allowedRoles,
    position: data.position,
  }).returning();
  res.status(201).json(CreateCourseMaterialResponse.parse(mapMaterial(material)));
});

router.patch("/materials/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = UpdateCourseMaterialParams.safeParse(req.params);
  const body = UpdateCourseMaterialBody.safeParse(req.body);
  if (!staff || !canManageCourseContent(staff.role)) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const current = await findManageableMaterial(params.data.id, staff);
  if (!current) {
    res.status(404).json({ error: "Course material not found." });
    return;
  }
  const data = body.data;
  if (data.allowedRoles && !validRoleList(data.allowedRoles)) {
    res.status(400).json({ error: "Choose at least one supported course role." });
    return;
  }
  const sourceChanged = data.externalUrl !== undefined || data.objectPath !== undefined;
  let nextExternalUrl = current.material.externalUrl;
  let nextObjectPath = current.material.objectPath;
  let nextFileName = current.material.fileName;
  let nextContentType = current.material.contentType;
  let nextFileSize = current.material.fileSize;
  if (sourceChanged) {
    nextExternalUrl = data.externalUrl ?? null;
    nextObjectPath = data.objectPath ?? null;
    const hasExternalUrl = typeof nextExternalUrl === "string" && nextExternalUrl.length > 0;
    const hasObjectPath = typeof nextObjectPath === "string" && nextObjectPath.length > 0;
    if (hasExternalUrl === hasObjectPath) {
      res.status(400).json({ error: "Provide either an external URL or an uploaded file, not both." });
      return;
    }
    if (hasExternalUrl && !isValidHttpUrl(nextExternalUrl!)) {
      res.status(400).json({ error: "Course links must use http or https." });
      return;
    }
    if (hasObjectPath) {
      nextFileName = data.fileName ?? null;
      nextContentType = data.contentType ?? null;
      nextFileSize = data.fileSize ?? null;
      if (!validObjectPath(nextObjectPath!, current.module.programId) || !nextFileName || !nextContentType ||
        !nextFileSize || nextFileSize > maxUploadBytes || !isSupportedCourseFile(nextContentType)) {
        res.status(400).json({ error: "The uploaded course file is invalid or too large." });
        return;
      }
      try {
        const file = await getCourseMaterialFile(nextObjectPath!);
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) !== nextFileSize || metadata.contentType !== nextContentType) {
          res.status(400).json({ error: "Uploaded file details do not match the file in storage." });
          return;
        }
      } catch {
        res.status(400).json({ error: "The uploaded file could not be found." });
        return;
      }
    } else {
      nextFileName = null;
      nextContentType = null;
      nextFileSize = null;
    }
  }
  const values: Partial<typeof courseMaterialsTable.$inferInsert> = {};
  if (data.title !== undefined) values.title = data.title;
  if (data.description !== undefined) values.description = data.description ?? null;
  if (data.kind !== undefined) values.kind = data.kind;
  if (data.position !== undefined) values.position = data.position;
  if (data.allowedRoles !== undefined) values.allowedRoles = data.allowedRoles;
  if (sourceChanged) {
    values.externalUrl = nextExternalUrl;
    values.objectPath = nextObjectPath;
    values.fileName = nextFileName;
    values.contentType = nextContentType;
    values.fileSize = nextFileSize;
  }
  const [material] = await db.update(courseMaterialsTable).set(values)
    .where(eq(courseMaterialsTable.id, current.material.id)).returning();
  if (sourceChanged && current.material.objectPath && current.material.objectPath !== nextObjectPath) {
    await deleteCourseMaterialFile(current.material.objectPath).catch((error: unknown) => {
      req.log.warn({ err: error, materialId: current.material.id }, "Could not delete replaced course file");
    });
  }
  res.json(UpdateCourseMaterialResponse.parse(mapMaterial(material)));
});

router.delete("/materials/:id", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = DeleteCourseMaterialParams.safeParse(req.params);
  if (!staff || !canManageCourseContent(staff.role)) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await findManageableMaterial(params.data.id, staff);
  if (!current) {
    res.status(404).json({ error: "Course material not found." });
    return;
  }
  await db.delete(courseMaterialsTable).where(eq(courseMaterialsTable.id, current.material.id));
  if (current.material.objectPath) {
    await deleteCourseMaterialFile(current.material.objectPath).catch((error: unknown) => {
      req.log.warn({ err: error, materialId: current.material.id }, "Could not delete private course file");
    });
  }
  res.status(204).end();
});

router.post("/uploads/request-url", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const body = RequestCourseUploadUrlBody.safeParse(req.body);
  if (!staff || !canManageCourseContent(staff.role)) {
    res.status(403).json({ error: "Coordinator access is required to manage course content." });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.size > maxUploadBytes || !isSupportedCourseFile(body.data.contentType)) {
    res.status(400).json({ error: "Use a supported video, audio, PDF, Word, or presentation file up to 250 MB." });
    return;
  }
  const programIds = await manageableProgramIds(staff);
  if (programIds !== null && !programIds.includes(body.data.programId)) {
    res.status(403).json({ error: "This program is not assigned to the trainer." });
    return;
  }
  const [program] = await db.select({ id: programsTable.id }).from(programsTable)
    .where(eq(programsTable.id, body.data.programId)).limit(1);
  if (!program) {
    res.status(404).json({ error: "Program not found." });
    return;
  }
  try {
    const upload = await createCourseUploadUrl(body.data.programId);
    res.json(RequestCourseUploadUrlResponse.parse(upload));
  } catch (error) {
    req.log.error({ err: error }, "Could not create private course upload URL");
    res.status(503).json({ error: "Private course file storage is unavailable right now." });
  }
});

router.get("/materials/:id/file", async (req, res): Promise<void> => {
  const staff = res.locals.staff as StaffAccess | undefined;
  const params = GetCourseMaterialFileParams.safeParse(req.params);
  if (!staff || !canViewCourseMaterialFile(staff.role)) {
    res.status(403).json({ error: "Coordinator or assigned trainer access is required." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await findManageableMaterial(params.data.id, staff);
  if (!current || !current.material.objectPath) {
    res.status(404).json({ error: "Course material file not found." });
    return;
  }
  if (!canAccessCourseMaterial(staff.role, current.material.allowedRoles)) {
    res.status(403).json({ error: "Your role is not allowed to view this material." });
    return;
  }
  if (
    staff.role === "trainer" &&
    !isCourseModuleReleased(current.module.isPublished, current.module.releaseAt)
  ) {
    res.status(404).json({ error: "Course material file not found." });
    return;
  }
  await streamCourseMaterialFile(
    req,
    res,
    current.material.objectPath,
    current.material.fileName,
    current.material.contentType,
  );
});

export default router;
