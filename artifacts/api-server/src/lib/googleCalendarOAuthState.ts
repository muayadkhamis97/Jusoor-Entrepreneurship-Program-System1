import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export type GoogleCalendarOAuthState = {
  staffId: number;
  state: string;
  codeVerifier: string;
  origin: string;
  redirectUri: string;
  expiresAt: number;
};

function encryptionKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

export function sealGoogleCalendarOAuthState(value: GoogleCalendarOAuthState): string {
  const key = encryptionKey();
  if (!key) throw new Error("SESSION_SECRET is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function openGoogleCalendarOAuthState(value: string | undefined): GoogleCalendarOAuthState | null {
  const key = encryptionKey();
  if (!key || !value) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Partial<GoogleCalendarOAuthState>;
    if (
      typeof parsed.staffId !== "number" ||
      typeof parsed.state !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.origin !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) return null;
    return parsed as GoogleCalendarOAuthState;
  } catch {
    return null;
  }
}

export function isGoogleCalendarOAuthStateValid(
  payload: GoogleCalendarOAuthState | null,
  suppliedState: string | undefined,
  now = Date.now(),
): payload is GoogleCalendarOAuthState {
  return Boolean(
    payload &&
    suppliedState &&
    payload.state === suppliedState &&
    payload.expiresAt >= now
  );
}
