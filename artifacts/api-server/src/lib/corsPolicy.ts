import type { CorsOptions, CorsOptionsDelegate, CorsRequest } from "cors";

type Env = Record<string, string | undefined>;

const EXTERNAL_API_PREFIX = "/api/v1";

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Browser origins allowed to call the API with the signed-in user's cookies.
 *
 * - REPLIT_DOMAINS / REPLIT_DEV_DOMAIN: this deployment's own hostnames.
 * - CORS_ALLOWED_ORIGINS: extra full origins (for example a custom domain),
 *   comma-separated, such as "https://hub.example.org".
 */
export function buildAllowedOrigins(env: Env = process.env): Set<string> {
  const origins = new Set<string>();
  for (const host of [...splitList(env.REPLIT_DOMAINS), ...splitList(env.REPLIT_DEV_DOMAIN)]) {
    const origin = normalizeOrigin(host.includes("://") ? host : `https://${host}`);
    if (origin) origins.add(origin);
  }
  for (const entry of splitList(env.CORS_ALLOWED_ORIGINS)) {
    const origin = normalizeOrigin(entry);
    if (origin) origins.add(origin);
  }
  return origins;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin: string | undefined, env: Env = process.env): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (env.NODE_ENV !== "production" && isLocalOrigin(normalized)) return true;
  return buildAllowedOrigins(env).has(normalized);
}

/**
 * - /api/v1 (the API-key integration API) is called with a bearer key, never
 *   with cookies, so any origin may read it but credentials are not allowed.
 * - Everything else uses the signed-in user's session, so only the
 *   allow-listed origins above get credentialed cross-origin access.
 *   Same-origin requests do not depend on CORS at all.
 */
export function createCorsOptionsDelegate(env: Env = process.env): CorsOptionsDelegate<CorsRequest> {
  return (req, callback) => {
    const requestUrls = req as { originalUrl?: string; url?: string };
    const path = requestUrls.originalUrl ?? requestUrls.url ?? "";
    const pathname = path.split("?")[0];
    const isExternalApi = pathname === EXTERNAL_API_PREFIX || pathname.startsWith(`${EXTERNAL_API_PREFIX}/`);
    const origin = req.headers.origin;
    const options: CorsOptions = isExternalApi
      ? { origin: true, credentials: false }
      : { origin: isOriginAllowed(origin, env), credentials: true };
    callback(null, options);
  };
}
