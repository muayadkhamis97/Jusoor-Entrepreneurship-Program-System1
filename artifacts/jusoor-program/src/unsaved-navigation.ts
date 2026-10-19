// Install once before rendering the router so every same-document history entry
// has an index. No draft values or identity are written to browser history.
const indexKey = '__programNavigationIndex';
let leaveCheck: (() => boolean) | undefined;
let installed = false;

export function registerLeaveCheck(check: () => boolean) {
  leaveCheck = check;
  return () => { if (leaveCheck === check) leaveCheck = undefined; };
}

export function installUnsavedNavigationGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const { history } = window;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  const entryIndex = (state: unknown): number | undefined => {
    const value = state && typeof state === 'object'
      ? (state as Record<string, unknown>)[indexKey] : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  const indexed = (state: unknown, index: number) => ({ ...(state && typeof state === 'object' ? state : {}), [indexKey]: index });
  let currentIndex = entryIndex(history.state) ?? 0;
  let currentPath = window.location.pathname;
  let restoring = false;
  replace(indexed(history.state, currentIndex), '');
  const changesRoute = (url?: string | URL | null) =>
    url != null && new URL(url, window.location.href).pathname !== window.location.pathname;
  history.pushState = (state, unused, url) => {
    if (changesRoute(url) && leaveCheck && !leaveCheck()) return;
    const next = currentIndex + 1;
    push(indexed(state, next), unused, url);
    currentIndex = next;
    currentPath = window.location.pathname;
  };
  history.replaceState = (state, unused, url) => {
    if (changesRoute(url) && leaveCheck && !leaveCheck()) return;
    replace(indexed(state, currentIndex), unused, url);
    currentPath = window.location.pathname;
  };
  window.addEventListener('popstate', event => {
    if (restoring) {
      restoring = false;
      event.stopImmediatePropagation();
      return;
    }
    const targetIndex = entryIndex(event.state);
    if (window.location.pathname === currentPath) {
      currentIndex = targetIndex ?? currentIndex;
      return;
    }
    if (leaveCheck && !leaveCheck()) {
      // Capture phase prevents the router from unmounting the editor while the
      // browser restores the current entry after a cancelled Back/Forward.
      event.stopImmediatePropagation();
      restoring = true;
      history.go(targetIndex === undefined ? 1 : currentIndex - targetIndex);
      return;
    }
    currentIndex = targetIndex ?? currentIndex - 1;
    currentPath = window.location.pathname;
  }, true);
}
