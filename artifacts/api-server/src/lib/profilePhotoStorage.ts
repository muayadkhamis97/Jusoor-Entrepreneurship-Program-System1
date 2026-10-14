import { createHash, randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export function isSupportedProfilePhoto(contentType: string, size: number): boolean {
  return allowedContentTypes.has(contentType.trim().toLowerCase()) &&
    Number.isInteger(size) && size > 0 && size <= MAX_PROFILE_PHOTO_BYTES;
}

export function isProfilePhotoPathForUser(objectPath: string, userId: string): boolean {
  const match = objectPath.match(/^\/objects\/profile-photos\/([a-f0-9]{32})\/([0-9a-f-]{36})$/i);
  return Boolean(match && match[1].toLowerCase() === profileOwnerKey(userId));
}

export function buildProfilePhotoObjectPath(userId: string, objectId: string): string {
  return `/objects/profile-photos/${profileOwnerKey(userId)}/${objectId}`;
}

export async function createProfilePhotoUploadUrl(userId: string): Promise<{ uploadUrl: string; objectPath: string }> {
  const ownerKey = profileOwnerKey(userId);
  const objectId = randomUUID();
  const { bucketName, objectName } = parseObjectPath(
    `${getPrivateObjectDir()}/profile-photos/${ownerKey}/${objectId}`,
  );
  const uploadUrl = await signUploadUrl(bucketName, objectName);
  return { uploadUrl, objectPath: buildProfilePhotoObjectPath(userId, objectId) };
}

export async function getProfilePhotoFile(objectPath: string, userId: string): Promise<File> {
  if (!isProfilePhotoPathForUser(objectPath, userId)) {
    throw new Error("Invalid profile photo object path.");
  }
  const [, ownerKey, objectId] = objectPath.match(
    /^\/objects\/profile-photos\/([a-f0-9]{32})\/([0-9a-f-]{36})$/i,
  )!;
  const { bucketName, objectName } = parseObjectPath(
    `${getPrivateObjectDir()}/profile-photos/${ownerKey}/${objectId}`,
  );
  const file = storage.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Profile photo not found.");
  return file;
}

export async function validateUploadedProfilePhoto(objectPath: string, userId: string): Promise<File> {
  const file = await getProfilePhotoFile(objectPath, userId);
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType?.toLowerCase() ?? "";
  const size = Number(metadata.size ?? 0);
  if (!isSupportedProfilePhoto(contentType, size)) {
    throw new Error("Uploaded profile photo must be a JPEG, PNG, or WebP image up to 5 MB.");
  }
  return file;
}

export async function deleteProfilePhotoFile(objectPath: string, userId: string): Promise<void> {
  const file = await getProfilePhotoFile(objectPath, userId);
  await file.delete();
}

export async function streamProfilePhoto(
  req: Request,
  res: Response,
  objectPath: string,
  userId: string,
): Promise<void> {
  try {
    const file = await validateUploadedProfilePhoto(objectPath, userId);
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", metadata.contentType!);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    await pipeline(file.createReadStream(), res);
  } catch (error) {
    req.log.error({ err: error }, "Could not stream private profile photo");
    if (!res.headersSent) {
      res.status(404).json({ error: "Profile photo not found." });
    } else {
      res.destroy();
    }
  }
}

function profileOwnerKey(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!dir) throw new Error("Private object storage is not configured.");
  return dir.replace(/\/+$/, "");
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) {
    throw new Error("Invalid private object storage path.");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function signUploadUrl(bucketName: string, objectName: string): Promise<string> {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Could not create private upload URL (${response.status}).`);
  }
  const payload = await response.json() as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") {
    throw new Error("Storage service returned an invalid upload URL.");
  }
  return payload.signed_url;
}
