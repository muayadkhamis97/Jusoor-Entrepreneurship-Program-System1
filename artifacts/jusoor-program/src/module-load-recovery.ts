/**
 * React.lazy retains rejected imports. Resetting an error boundary cannot
 * retry those imports; an explicit page reload starts a fresh module graph.
 * Do not reload for ordinary API/network errors or application exceptions.
 */
export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const name = error instanceof Error ? error.name : '';
  return name === 'ChunkLoadError' || /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading (?:css )?chunk [\s\S]+ failed/i.test(message);
}

export function recoverFromRenderError(
  error: unknown,
  actions: { reload: () => void; reset: () => void },
): void {
  if (isModuleLoadError(error)) actions.reload();
  else actions.reset();
}
