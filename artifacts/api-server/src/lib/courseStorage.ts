import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const COURSE_OBJECT_PREFIX = "/objects/course-materials/";
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

const allowedContentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  "text/plain",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "application/zip",
  "application/x-zip-compressed",
]);

export function isSupportedCourseFile(contentType: string): boolean {
  return allowedContentTypes.has(contentType.trim().toLowerCase());
}

export async function createCourseUploadUrl(programId: number): Promise<{ uploadUrl: string; objectPath: string }> {
  const privateDir = getPrivateObjectDir();
  const objectId = randomUUID();
  const objectPath = `${COURSE_OBJECT_PREFIX}${programId}/${objectId}`;
  const { bucketName, objectName } = parseObjectPath(`${privateDir}/course-materials/${programId}/${objectId}`);
  const uploadUrl = await signUploadUrl(bucketName, objectName);
  return { uploadUrl, objectPath };
}

export async function getCourseMaterialFile(objectPath: string): Promise<File> {
  const match = objectPath.match(/^\/objects\/course-materials\/(\d+)\/([0-9a-f-]{36})$/i);
  if (!match) throw new Error("Invalid course material object path.");

  const { bucketName, objectName } = parseObjectPath(`${getPrivateObjectDir()}/course-materials/${match[1]}/${match[2]}`);
  const file = storage.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Course material file not found.");
  return file;
}

export async function deleteCourseMaterialFile(objectPath: string): Promise<void> {
  const file = await getCourseMaterialFile(objectPath);
  await file.delete();
}

export async function streamCourseMaterialFile(
  req: Request,
  res: Response,
  objectPath: string,
  fileName: string | null,
  contentType: string | null,
): Promise<void> {
  try {
    const file = await getCourseMaterialFile(objectPath);
    const [metadata] = await file.getMetadata();
    const safeName = (fileName || "course-material")
      .replace(/[\r\n"]/g, "")
      .slice(0, 250);
    res.setHeader("Content-Type", contentType || metadata.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    await pipeline(file.createReadStream(), res);
  } catch (error) {
    req.log.error({ err: error }, "Could not stream private course material");
    if (!res.headersSent) {
      res.status(404).json({ error: "Course material file not found." });
    } else {
      res.destroy();
    }
  }
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
