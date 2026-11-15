import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_BRAND_LOGO_BYTES = 5 * 1024 * 1024;
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

export function isSupportedBrandLogo(contentType: string, size: number): boolean {
  return allowedContentTypes.has(contentType.trim().toLowerCase()) &&
    Number.isInteger(size) && size > 0 && size <= MAX_BRAND_LOGO_BYTES;
}

export function isBrandLogoId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function brandLogoObjectPath(logoId: string): string {
  if (!isBrandLogoId(logoId)) throw new Error("Invalid program logo identifier.");
  return `/objects/program-branding/logos/${logoId.toLowerCase()}`;
}

export function brandLogoIdFromObjectPath(objectPath: string | null): string | null {
  const match = objectPath?.match(/^\/objects\/program-branding\/logos\/([0-9a-f-]{36})$/i);
  return match && isBrandLogoId(match[1]) ? match[1].toLowerCase() : null;
}

export function brandLogoIdFromReference(value: string | null): string | null {
  if (!value) return null;
  const objectPathId = brandLogoIdFromObjectPath(value);
  if (objectPathId) return objectPathId;
  try {
    const url = new URL(value, "https://program.invalid");
    const match = url.pathname.match(/^\/api\/branding\/logo\/([0-9a-f-]{36})$/i);
    return match && isBrandLogoId(match[1]) ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function createBrandLogoUploadUrl(publicOrigin: string): Promise<{ uploadUrl: string; logoUrl: string }> {
  const logoId = randomUUID();
  const origin = new URL(publicOrigin);
  if (origin.protocol !== "https:") throw new Error("Program logo URLs require HTTPS.");
  const { bucketName, objectName } = parseObjectPath(
    `${getPrivateObjectDir()}/program-branding/logos/${logoId}`,
  );
  const uploadUrl = await signUploadUrl(bucketName, objectName);
  return { uploadUrl, logoUrl: new URL(`/api/branding/logo/${logoId}`, origin).toString() };
}

export async function getBrandLogoFile(logoId: string): Promise<File> {
  const { bucketName, objectName } = parseObjectPath(
    `${getPrivateObjectDir()}/program-branding/logos/${brandLogoObjectPath(logoId).split("/").at(-1)}`,
  );
  const file = storage.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Program logo not found.");
  const [metadata] = await file.getMetadata();
  if (!isSupportedBrandLogo(metadata.contentType ?? "", Number(metadata.size ?? 0))) {
    throw new Error("Program logo file is invalid.");
  }
  return file;
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
  if (!response.ok) throw new Error(`Could not create logo upload URL (${response.status}).`);
  const payload = await response.json() as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") {
    throw new Error("Storage service returned an invalid logo upload URL.");
  }
  return payload.signed_url;
}
