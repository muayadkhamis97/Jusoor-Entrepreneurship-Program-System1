import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

export type GmailOAuthState = {
  staffId: number;
  state: string;
  codeVerifier: string;
  origin: string;
  redirectUri: string;
  returnPath: string;
  expiresAt: number;
};

function encryptionKey(purpose: "oauth-state" | "refresh-token"): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`email-sender:${purpose}:v1`).digest();
}

function seal(value: string, purpose: "oauth-state" | "refresh-token"): string {
  const key = encryptionKey(purpose);
  if (!key) throw new Error("SESSION_SECRET is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`email-sender:${purpose}:v1`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function open(value: string | undefined, purpose: "oauth-state" | "refresh-token"): string | null {
  const key = encryptionKey(purpose);
  if (!key || !value) return null;
  try {
    const [ivPart, tagPart, ciphertextPart] = value.split(".");
    if (!ivPart || !tagPart || !ciphertextPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAAD(Buffer.from(`email-sender:${purpose}:v1`));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function sealGmailOAuthState(value: GmailOAuthState): string {
  return seal(JSON.stringify(value), "oauth-state");
}

export function openGmailOAuthState(value: string | undefined): GmailOAuthState | null {
  const plaintext = open(value, "oauth-state");
  if (!plaintext) return null;
  try {
    const parsed = JSON.parse(plaintext) as Partial<GmailOAuthState>;
    if (
      typeof parsed.staffId !== "number" ||
      typeof parsed.state !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.origin !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.returnPath !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) return null;
    return parsed as GmailOAuthState;
  } catch {
    return null;
  }
}

export function isGmailOAuthStateValid(
  payload: GmailOAuthState | null,
  suppliedState: string | undefined,
  now = Date.now(),
): payload is GmailOAuthState {
  return Boolean(payload && suppliedState && payload.state === suppliedState && payload.expiresAt >= now);
}

export function sealGmailRefreshToken(token: string): string {
  if (!token.trim()) throw new Error("Google did not return a refresh token.");
  return seal(token, "refresh-token");
}

export function openGmailRefreshToken(encrypted: string): string | null {
  return open(encrypted, "refresh-token");
}
