const authorizationKeyPattern = /^Bearer ([a-z][a-z0-9]*_live_[A-Za-z0-9_-]{43})$/i;

export function extractIntegrationApiKey(authorization: string): string | null {
  return authorizationKeyPattern.exec(authorization)?.[1] ?? null;
}

export function displayIntegrationApiKeyPrefix(prefix: string): string {
  return prefix.replace(/^[a-z][a-z0-9]*_live_/i, "program_live_");
}
