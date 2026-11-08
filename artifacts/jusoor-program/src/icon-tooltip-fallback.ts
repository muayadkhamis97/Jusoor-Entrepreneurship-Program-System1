import './icon-tooltip-fallback.css';
import { getIconTooltipPosition } from './icon-tooltip-position';

let tooltipSerial = 0;

/**
 * Covers product-owned icon controls that don't already use a Tooltip.
 * Unlike a native title, this description also appears for keyboard focus.
 */
export function installIconTooltipFallback(root: HTMLElement = document.body) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};
  const selector = 'button[aria-label], a[aria-label], [role="button"][aria-label], button[title], a[title], [data-program-tooltip]';
  const tooltip = doc.createElement('div');
  tooltip.id = `program-icon-tooltip-${++tooltipSerial}`;
  tooltip.className = 'program-icon-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  doc.body.append(tooltip);

  const nativeTitles = new Map<HTMLElement, string>();
  let anchor: HTMLElement | null = null;
  let pendingAnchor: HTMLElement | null = null;
  let dismissedAnchor: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const labelFor = (element: HTMLElement) =>
    element.getAttribute('data-tooltip')?.trim()
    || element.getAttribute('aria-label')?.trim()
    || element.getAttribute('title')?.trim()
    || nativeTitles.get(element)?.trim()
    || '';

  function controlFor(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    const control = target.closest<HTMLElement>(selector);
    if (!control || !root.contains(control) || control.matches(':disabled, [aria-disabled="true"]')) return null;
    // Existing explicit tooltips own their descriptions and open/close lifecycle.
    const describedBy = control.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    if (describedBy.some(id => id !== tooltip.id && doc.getElementById(id)?.getAttribute('role') === 'tooltip')) return null;
    return control;
  }

  function syncContent(element: HTMLElement) {
    const label = labelFor(element);
    const direction = win!.getComputedStyle(element).direction;
    const language = element.closest('[lang]')?.getAttribute('lang') || doc.documentElement.lang;
    const changed = tooltip.textContent !== label || tooltip.dir !== direction || tooltip.lang !== language;
    // The tooltip lives inside the observed tree. Avoid writing unchanged
    // attributes, which would schedule another observer callback.
    if (tooltip.textContent !== label) tooltip.textContent = label;
    if (tooltip.dir !== direction) tooltip.dir = direction;
    if (tooltip.lang !== language) tooltip.lang = language;
    return changed;
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pendingAnchor = null;
  }

  function hide() {
    clearTimer();
    if (anchor) {
      const descriptions = (anchor.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (descriptions.length) anchor.setAttribute('aria-describedby', descriptions.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    tooltip.hidden = true;
    anchor = null;
  }

  function position() {
    if (!anchor?.isConnected) {
      hide();
      return;
    }
    const dimensions = tooltip.getBoundingClientRect();
    const gap = Number.parseFloat(win!.getComputedStyle(tooltip).paddingTop) || 8;
    const coordinates = getIconTooltipPosition(anchor.getBoundingClientRect(), dimensions, {
      width: doc.documentElement.clientWidth,
      height: win!.innerHeight,
    }, gap);
    tooltip.style.left = `${coordinates.left}px`;
    tooltip.style.top = `${coordinates.top}px`;
  }

  function show(element: HTMLElement) {
    clearTimer();
    if (element === dismissedAnchor || !element.isConnected || controlFor(element) !== element || !labelFor(element)) return;
    hide();
    anchor = element;
    const title = element.getAttribute('title');
    if (title) {
      nativeTitles.set(element, title);
      element.removeAttribute('title');
      element.setAttribute('data-program-tooltip', tooltip.id);
    }
    syncContent(element);
    const descriptions = new Set((element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    descriptions.add(tooltip.id);
    element.setAttribute('aria-describedby', [...descriptions].join(' '));
    tooltip.hidden = false;
    position();
  }

  function pointerOver(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    const control = controlFor(event.target);
    if (!control || control === anchor || control === pendingAnchor) return;
    clearTimer();
    pendingAnchor = control;
    timer = setTimeout(() => show(control), 350);
  }

  function pointerOut(event: PointerEvent) {
    const control = controlFor(event.target);
    if (!control || (event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) return;
    if (dismissedAnchor === control) dismissedAnchor = null;
    if (doc.activeElement !== control && (anchor === control || pendingAnchor === control)) hide();
  }

  function focusIn(event: FocusEvent) {
    const control = controlFor(event.target);
    if (control) show(control);
    else hide();
  }

  function focusOut(event: FocusEvent) {
    if (event.target === dismissedAnchor) dismissedAnchor = null;
    if (event.target === anchor || event.target === pendingAnchor) hide();
  }

  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && (anchor || pendingAnchor)) {
      dismissedAnchor = anchor || pendingAnchor;
      hide();
    }
  }

  function pageMoved() {
    hide();
  }

  const observer = new MutationObserver(() => {
    if (!anchor) return;
    // Explicit tooltips may mount after the focus event has already reached
    // this delegated fallback. Hand description ownership back when they do.
    if (!anchor.isConnected || controlFor(anchor) !== anchor || !labelFor(anchor)) hide();
    else if (syncContent(anchor)) position();
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['aria-label', 'title', 'data-tooltip', 'aria-describedby', 'lang', 'dir'],
    childList: true,
    subtree: true,
  });
  if (root !== doc.documentElement) {
    observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }
  root.addEventListener('pointerover', pointerOver);
  root.addEventListener('pointerout', pointerOut);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  doc.addEventListener('keydown', keyDown);
  doc.addEventListener('scroll', pageMoved, true);
  win.addEventListener('resize', pageMoved);

  return () => {
    hide();
    observer.disconnect();
    root.removeEventListener('pointerover', pointerOver);
    root.removeEventListener('pointerout', pointerOut);
    root.removeEventListener('focusin', focusIn);
    root.removeEventListener('focusout', focusOut);
    doc.removeEventListener('keydown', keyDown);
    doc.removeEventListener('scroll', pageMoved, true);
    win.removeEventListener('resize', pageMoved);
    for (const [element, title] of nativeTitles) {
      if (!element.hasAttribute('title')) element.setAttribute('title', title);
      if (element.getAttribute('data-program-tooltip') === tooltip.id) element.removeAttribute('data-program-tooltip');
    }
    tooltip.remove();
  };
}
