import type { StaffAccess } from "../middlewares/staffAccess";

export type CourseAudienceRole = "participant" | "trainer" | "coordinator";

export function canViewCourseManagement(role: StaffAccess["role"]): boolean {
  return role === "coordinator" || role === "staff" || role === "trainer";
}

export function canManageCourseContent(role: StaffAccess["role"]): boolean {
  return role === "coordinator";
}

export function canScheduleCourseRelease(role: StaffAccess["role"]): boolean {
  return role === "coordinator" || role === "staff";
}

export function canViewCourseMaterialFile(role: StaffAccess["role"]): boolean {
  return role === "coordinator" || role === "trainer";
}

export function isScheduleOnlyModuleUpdate(update: Record<string, unknown>): boolean {
  const keys = Object.keys(update);
  return keys.length > 0 &&
    keys.every((key) => key === "releaseAt" || key === "dueAt") &&
    keys.every((key) => {
      const value = update[key];
        return typeof value === "string" || value instanceof Date;
    });
}

export function canAccessCourseMaterial(
  role: StaffAccess["role"] | "participant",
  allowedRoles: readonly string[],
): boolean {
  if (role === "coordinator") return true;
  return (role === "participant" || role === "trainer") && allowedRoles.includes(role);
}

export function isCourseModuleReleased(
  isPublished: boolean,
  releaseAt: Date | null,
  now: Date = new Date(),
): boolean {
  return isPublished && (releaseAt === null || releaseAt <= now);
}
