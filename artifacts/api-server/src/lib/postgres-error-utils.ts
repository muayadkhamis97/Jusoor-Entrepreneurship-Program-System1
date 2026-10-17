export function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < 12; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) return false;
    visited.add(current);

    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === expectedCode) return true;
    current = candidate.cause;
  }

  return false;
}
