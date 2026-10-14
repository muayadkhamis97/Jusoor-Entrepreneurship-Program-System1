import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  CreateParticipantProfilePhotoUploadUrlBody,
  CreateParticipantProfilePhotoUploadUrlResponse,
  GetParticipantProfileResponse,
  UpdateParticipantProfileBody,
  UpdateParticipantProfileResponse,
} from "@workspace/api-zod";
import { db, userProfilesTable } from "@workspace/db";
import type { ParticipantAccess } from "../middlewares/participantAccess";
import {
  createProfilePhotoUploadUrl,
  deleteProfilePhotoFile,
  isSupportedProfilePhoto,
  streamProfilePhoto,
  validateUploadedProfilePhoto,
} from "../lib/profilePhotoStorage";
import {
  ensureUserProfile,
  findProfileIdentity,
  findStoredUserProfile,
  normalizeProfileUpdate,
  updateUserProfile,
  type ProfileUpdateValues,
} from "../lib/userProfiles";

const router: IRouter = Router();

router.get("/", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const identity = await findProfileIdentity(participant.userId);
  if (!identity) {
    res.status(404).json({ error: "Profile account not found." });
    return;
  }
  const profile = await findStoredUserProfile(participant.userId);
  res.json(GetParticipantProfileResponse.parse({
    userId: identity.userId,
    displayName: profile?.displayName ?? identity.fallbackDisplayName,
    email: identity.email,
    accountType: identity.accountType,
    phone: profile ? profile.phone : identity.fallbackPhone,
    bio: profile?.bio ?? null,
    organization: profile?.organization ?? null,
    photoUrl: profile?.photoPath ? "/api/participant/profile/photo" : null,
  }));
});

router.patch("/", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const body = UpdateParticipantProfileBody.safeParse(req.body);
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const identity = await findProfileIdentity(participant.userId);
  if (!identity) {
    res.status(404).json({ error: "Profile account not found." });
    return;
  }
  const current = await ensureUserProfile(identity);
  const values = normalizeProfileUpdate(body.data as ProfileUpdateValues);
  if (!values) {
    res.status(400).json({ error: "Enter a non-empty display name or another profile detail to update." });
    return;
  }
  if (values.photoPath !== undefined && values.photoPath !== null) {
    try {
      await validateUploadedProfilePhoto(values.photoPath, participant.userId);
    } catch {
      res.status(400).json({ error: "Upload a valid JPEG, PNG, or WebP profile photo before saving." });
      return;
    }
  }
  const profile = await updateUserProfile(identity, values);
  if (current.photoPath && current.photoPath !== profile.photoPath) {
    void deleteProfilePhotoFile(current.photoPath, participant.userId).catch((error: unknown) => {
      req.log.warn({ err: error, userId: participant.userId }, "Could not delete replaced private profile photo");
    });
  }
  res.json(UpdateParticipantProfileResponse.parse({
    userId: identity.userId,
    displayName: profile.displayName,
    email: identity.email,
    accountType: identity.accountType,
    phone: profile.phone,
    bio: profile.bio,
    organization: profile.organization,
    photoUrl: profile.photoPath ? "/api/participant/profile/photo" : null,
  }));
});

router.post("/photo/upload-url", async (req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  const body = CreateParticipantProfilePhotoUploadUrlBody.safeParse(req.body);
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  if (!body.success || !isSupportedProfilePhoto(body.data?.contentType ?? "", body.data?.size ?? 0)) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image up to 5 MB." });
    return;
  }
  try {
    const result = await createProfilePhotoUploadUrl(participant.userId);
    res.json(CreateParticipantProfilePhotoUploadUrlResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Could not create private profile photo upload URL");
    res.status(503).json({ error: "Profile photo storage is unavailable right now." });
  }
});

router.get("/photo", async (_req, res): Promise<void> => {
  const participant = res.locals.participant as ParticipantAccess | undefined;
  if (!participant) {
    res.status(403).json({ error: "Participant access is required." });
    return;
  }
  const [profile] = await db.select().from(userProfilesTable)
    .where(eq(userProfilesTable.userId, participant.userId))
    .limit(1);
  if (!profile?.photoPath) {
    res.status(404).json({ error: "Profile photo not found." });
    return;
  }
  await streamProfilePhoto(_req, res, profile.photoPath, participant.userId);
});

router.use((error: unknown, req: Request, res: Response, next: NextFunction): void => {
  if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
    req.log.warn({ err: error }, "User profile migration is not applied");
    res.status(503).json({ error: "Profile editing requires the user profiles database migration." });
    return;
  }
  next(error);
});

export default router;
