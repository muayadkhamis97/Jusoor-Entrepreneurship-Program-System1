import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  CreateOwnProfilePhotoUploadUrlBody,
  CreateOwnProfilePhotoUploadUrlResponse,
  GetOwnProfileResponse,
  ListUserProfilesResponse,
  UpdateOwnProfileBody,
  UpdateOwnProfileResponse,
  CreateUserProfilePhotoUploadUrlBody,
  CreateUserProfilePhotoUploadUrlParams,
  CreateUserProfilePhotoUploadUrlResponse,
  GetUserProfilePhotoParams,
  UpdateUserProfileBody,
  UpdateUserProfileParams,
  UpdateUserProfileResponse,
} from "@workspace/api-zod";
import { db, userProfilesTable } from "@workspace/db";
import { requireCoordinator, type StaffAccess } from "../middlewares/staffAccess";
import {
  createProfilePhotoUploadUrl,
  deleteProfilePhotoFile,
  isSupportedProfilePhoto,
  streamProfilePhoto,
  validateUploadedProfilePhoto,
} from "../lib/profilePhotoStorage";
import {
  canEditUserProfile,
  ensureUserProfile,
  findProfileIdentity,
  findStoredUserProfile,
  listRegisteredUserProfiles,
  normalizeProfileUpdate,
  updateUserProfile,
  type ProfileIdentity,
  type ProfileUpdateValues,
} from "../lib/userProfiles";

const router: IRouter = Router();

router.get("/profile", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  let identity = await findProfileIdentity(userId);
  if (!identity) {
    res.status(404).json({ error: "Profile account not found." });
    return;
  }
  const profile = await findStoredUserProfile(userId);
  if (!profile && identity.accountType === "staff") {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const clerkName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim();
      if (clerkName) identity = { ...identity, fallbackDisplayName: clerkName };
    } catch (error) {
      req.log.warn({ err: error }, "Could not read the signed-in user's display name");
    }
  }
  res.json(GetOwnProfileResponse.parse(formatProfile(identity, profile?.photoPath ?? null, profile)));
});

router.patch("/profile", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const parsed = UpdateOwnProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const values = normalizeProfileUpdate(parsed.data as ProfileUpdateValues);
  if (!values) {
    res.status(400).json({ error: "Enter a non-empty display name or another profile detail to update." });
    return;
  }
  const identity = await findProfileIdentity(userId);
  if (!identity) {
    res.status(404).json({ error: "Profile account not found." });
    return;
  }
  await saveProfile(req, res, identity, values, false);
});

router.post("/profile/photo/upload-url", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  const body = CreateOwnProfilePhotoUploadUrlBody.safeParse(req.body);
  if (!body.success || !isSupportedProfilePhoto(body.data?.contentType ?? "", body.data?.size ?? 0)) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image up to 5 MB." });
    return;
  }
  if (!await findProfileIdentity(userId)) {
    res.status(404).json({ error: "Profile account not found." });
    return;
  }
  try {
    const result = await createProfilePhotoUploadUrl(userId);
    res.json(CreateOwnProfilePhotoUploadUrlResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Could not create private profile photo upload URL");
    res.status(503).json({ error: "Profile photo storage is unavailable right now." });
  }
});

router.get("/profile/photo", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign-in required." });
    return;
  }
  await streamOwnProfilePhoto(req, res, userId);
});

router.get("/profiles", requireCoordinator, async (_req, res): Promise<void> => {
  const rows = await listRegisteredUserProfiles();
  res.json(ListUserProfilesResponse.parse(rows.map(({ identity, profile }) =>
    formatProfile(
      identity,
      profile?.photoPath ?? null,
      profile,
      profile?.photoPath ? `/api/profiles/${encodeURIComponent(identity.userId)}/photo` : null,
    ),
  )));
});

router.patch("/profiles/:userId", requireCoordinator, async (req, res): Promise<void> => {
  const params = UpdateUserProfileParams.safeParse(req.params);
  const body = UpdateUserProfileBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const values = normalizeProfileUpdate(body.data as ProfileUpdateValues);
  if (!values) {
    res.status(400).json({ error: "Enter a non-empty display name or another profile detail to update." });
    return;
  }
  const currentStaff = res.locals.staff as StaffAccess | undefined;
  const actorUserId = getAuth(req).userId;
  if (!currentStaff || !actorUserId || !canEditUserProfile(actorUserId, params.data.userId, currentStaff.role === "coordinator")) {
    res.status(403).json({ error: "Admin access is required to edit another profile." });
    return;
  }
  const identity = await findProfileIdentity(params.data.userId);
  if (!identity) {
    res.status(404).json({ error: "Registered staff or participant profile not found." });
    return;
  }
  await saveProfile(req, res, identity, values, true);
});

router.post("/profiles/:userId/photo/upload-url", requireCoordinator, async (req, res): Promise<void> => {
  const params = CreateUserProfilePhotoUploadUrlParams.safeParse(req.params);
  const body = CreateUserProfilePhotoUploadUrlBody.safeParse(req.body);
  if (!params.success || !body.success || !isSupportedProfilePhoto(body.data?.contentType ?? "", body.data?.size ?? 0)) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image up to 5 MB." });
    return;
  }
  if (!await findProfileIdentity(params.data.userId)) {
    res.status(404).json({ error: "Registered staff or participant profile not found." });
    return;
  }
  try {
    const result = await createProfilePhotoUploadUrl(params.data.userId);
    res.json(CreateUserProfilePhotoUploadUrlResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Could not create private profile photo upload URL");
    res.status(503).json({ error: "Profile photo storage is unavailable right now." });
  }
});

router.get("/profiles/:userId/photo", requireCoordinator, async (req, res): Promise<void> => {
  const params = GetUserProfilePhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await streamProfilePhotoForUser(req, res, params.data.userId);
});

router.use((error: unknown, req: Request, res: Response, next: NextFunction): void => {
  if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
    req.log.warn({ err: error }, "User profile migration is not applied");
    res.status(503).json({ error: "Profile editing requires the user profiles database migration." });
    return;
  }
  next(error);
});

async function saveProfile(
  req: Request,
  res: Response,
  identity: ProfileIdentity,
  values: ProfileUpdateValues,
  adminEdit: boolean,
): Promise<void> {
  const current = await ensureUserProfile(identity);
  if (values.photoPath !== undefined && values.photoPath !== null) {
    try {
      await validateUploadedProfilePhoto(values.photoPath, identity.userId);
    } catch {
      res.status(400).json({ error: "Upload a valid JPEG, PNG, or WebP profile photo before saving." });
      return;
    }
  }
  const updated = await updateUserProfile(identity, values);
  if (current.photoPath && current.photoPath !== updated.photoPath) {
    void deleteProfilePhotoFile(current.photoPath, identity.userId).catch((error: unknown) => {
      req.log.warn({ err: error, userId: identity.userId }, "Could not delete replaced private profile photo");
    });
  }
  const photoUrl = updated.photoPath
    ? adminEdit ? `/api/profiles/${encodeURIComponent(identity.userId)}/photo` : "/api/profile/photo"
    : null;
  const response = formatProfile(identity, updated.photoPath, updated, photoUrl);
  res.json(adminEdit ? UpdateUserProfileResponse.parse(response) : UpdateOwnProfileResponse.parse(response));
}

async function streamOwnProfilePhoto(
  req: Request,
  res: Response,
  userId: string,
): Promise<void> {
  const [profile] = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  if (!profile?.photoPath) {
    res.status(404).json({ error: "Profile photo not found." });
    return;
  }
  await streamProfilePhoto(req, res, profile.photoPath, userId);
}

async function streamProfilePhotoForUser(
  req: Request,
  res: Response,
  userId: string,
): Promise<void> {
  const identity = await findProfileIdentity(userId);
  if (!identity) {
    res.status(404).json({ error: "Profile photo not found." });
    return;
  }
  await streamOwnProfilePhoto(req, res, userId);
}

function formatProfile(
  identity: ProfileIdentity,
  photoPath: string | null,
  profile: { displayName: string; phone: string | null; bio: string | null; organization: string | null } | null,
  photoUrl?: string | null,
) {
  const url = photoUrl === undefined
    ? photoPath ? `/api/profile/photo` : null
    : photoUrl;
  return {
    userId: identity.userId,
    displayName: profile?.displayName ?? identity.fallbackDisplayName,
    email: identity.email,
    accountType: identity.accountType,
    phone: profile ? profile.phone : identity.fallbackPhone,
    bio: profile?.bio ?? null,
    organization: profile?.organization ?? null,
    photoUrl: url,
  };
}

export default router;
