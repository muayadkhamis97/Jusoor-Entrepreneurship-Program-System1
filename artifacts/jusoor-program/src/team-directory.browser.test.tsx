import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium, type Page } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const directoryButtons = '.team-access-page button';

async function unusedPort(): Promise<number> {
  const listener = createNetServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a browser-test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

/**
 * Measure real painted text, not only button boxes: an overflowing/stacked
 * label can hide inside an otherwise perfectly sized button or panel.
 */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const tolerance = 1.5; // Subpixel text/border rounding, not a layout allowance.
    const root = document.querySelector('.team-access-page')!;
    const name = (element: Element) => element.getAttribute('data-testid') || element.className || element.tagName;
    const inside = (inner: DOMRect, outer: DOMRect) =>
      inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance &&
      inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
    if (document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1) {
      problems.push('document horizontal overflow');
    }
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      const icon = button.querySelector('svg')?.getBoundingClientRect();
      if (!button.textContent?.trim() || !button.getAttribute('data-testid')) problems.push(`${name(button)}: unnamed/untracked action`);
      if (button.disabled || button.tabIndex < 0) problems.push(`${name(button)}: inaccessible action`);
      if (!icon || !inside(icon, box)) problems.push(`${name(button)}: clipped/missing icon`);
      // Native button scrollHeight can include a line-box/border allowance even
      // when its glyphs fit. Vertical clipping is checked by painted ranges below.
      if (button.scrollWidth > button.clientWidth + 1) {
        problems.push(`${name(button)}: overflowing button content (${button.scrollWidth}×${button.scrollHeight} inside ${button.clientWidth}×${button.clientHeight})`);
      }
      if (box.width < 24 || box.height < 24) problems.push(`${name(button)}: undersized action target`);
      const row = button.closest('tr');
      if (row && !inside(box, row.getBoundingClientRect())) problems.push(`${name(button)}: action outside directory row`);
    }
    // Check all visible directory copy, including long identities, status chips,
    // program/business names, dates, feedback, headers and action labels.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement!;
      if (!node.textContent?.trim() || parent.closest('.sr-only')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
      const button = parent.closest('button');
      const icon = button?.querySelector('svg')?.getBoundingClientRect();
      for (const rect of rects) {
        if (rect.left < -tolerance || rect.right > window.innerWidth + tolerance) problems.push(`${name(parent)}: text outside viewport`);
        if (button) {
          if (!inside(rect, button.getBoundingClientRect())) problems.push(`${name(button)}: clipped label`);
          if (icon && Math.abs((icon.top + icon.bottom - rect.top - rect.bottom) / 2) > 4) {
            problems.push(`${name(button)}: vertically separated icon and label`);
          }
        }
        for (let ancestor: Element | null = parent; ancestor && root.contains(ancestor); ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const box = ancestor.getBoundingClientRect();
          if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (rect.left < box.left - tolerance || rect.right > box.right + tolerance)) {
            problems.push(`${name(parent)}: label clipped horizontally by ${name(ancestor)}`);
          }
          if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (rect.top < box.top - tolerance || rect.bottom > box.bottom + tolerance)) {
            problems.push(`${name(parent)}: label clipped vertically by ${name(ancestor)}`);
          }
        }
      }
    }
    return [...new Set(problems)];
  });
}

async function assertActionAccess(page: Page, context: string) {
  const actions = page.locator(directoryButtons);
  const expected = await actions.evaluateAll(buttons => buttons.map(button => button.getAttribute('data-testid')));
  assert.ok(expected.every(Boolean), `${context}: every action needs a stable identity`);
  // Native Tab traversal (not programmatic focus on each target) must reach every
  // action, including rows below the fold and the participant resend controls.
  await actions.first().focus();
  const visited = new Set<string>();
  for (let index = 0; index < expected.length + 10 && visited.size < expected.length; index++) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element);
      return { id: element.getAttribute('data-testid'), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    if (focused.id && expected.includes(focused.id)) {
      visited.add(focused.id);
      assert.notEqual(focused.outline, 'none', `${context}: ${focused.id} needs a visible keyboard focus indicator`);
      assert.ok(focused.width >= 2, `${context}: ${focused.id} needs a visible keyboard focus indicator`);
    }
    await page.keyboard.press('Tab');
  }
  assert.deepEqual([...visited].sort(), [...expected].sort(), `${context}: all actions must be in the keyboard path`);
  for (const action of await actions.all()) {
    assert.ok((await action.getAttribute('aria-label')) || (await action.innerText()).trim(), `${context}: action needs an accessible name`);
    // Playwright checks clipping/overlays and scrolls off-screen rows into view,
    // without invoking the actual edit/revoke/resend callbacks.
    await action.click({ trial: true });
    assert.equal(await action.evaluate(button => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), true, `${context}: action must not be covered by navigation or another row`);
  }
}

test('real Team directory actions stay readable and accessible beside navigation in English and Arabic', { timeout: 180_000 }, async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const previousPort = process.env.PORT;
  const previousBasePath = process.env.BASE_PATH;
  process.env.PORT = String(port);
  process.env.BASE_PATH = '/';
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    vite = await createViteServer({
      configFile: path.join(packageRoot, 'vite.config.ts'),
      root: packageRoot,
      server: { host: '127.0.0.1', port, strictPort: true },
      plugins: [{
        name: 'team-directory-inert-services',
        enforce: 'pre',
        resolveId(source, importer) {
          // Scope service substitutions to App only. The wrappers can re-export
          // the real packages without recursive aliases, and guards aren't run.
          if (importer?.split('?')[0] !== path.join(packageRoot, 'src/App.tsx')) return null;
          if (source === '@workspace/api-client-react') return path.join(packageRoot, 'src/test-fixtures/team-directory-api.tsx');
          if (source === '@clerk/react') return path.join(packageRoot, 'src/test-fixtures/team-directory-clerk.tsx');
          return null;
        },
      }],
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath, headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    for (const language of ['en', 'ar'] as const) {
      for (const width of [1024, 1280, 1440, 390]) {
        const label = `${language} / ${width}px`;
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const forbiddenRequests: string[] = [];
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        // tsx/esbuild annotates nested function names when serializing evaluate
        // callbacks; supply that harmless helper in the isolated browser realm.
        await page.addInitScript('window.__name = value => value;');
        await page.route('**/*', route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin || request.method() !== 'GET' || /^\/api(?:\/|$)/.test(url.pathname)) {
            forbiddenRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
          }
          return route.continue();
        });
        await page.addInitScript(({ language }) => {
          localStorage.setItem('jusoor-language', language);
          // Make dates stable without replacing browser timers or animation clocks.
          const NativeDate = Date;
          class FixedDate extends NativeDate {
            constructor(...args: ConstructorParameters<typeof Date>) {
              if (args.length) super(...args);
              else super('2026-10-14T12:00:00.000Z');
            }
            static now() { return new NativeDate('2026-10-14T12:00:00.000Z').getTime(); }
          }
          window.Date = FixedDate as DateConstructor;
        }, { language });
        await page.goto(`${origin}/src/test-fixtures/team-directory.html`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('row-participant-invitation-13').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'));
        assert.equal(await page.locator('html').getAttribute('lang'), language, label);
        assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr', label);
        assert.equal(await page.getByRole('heading', { name: language === 'ar' ? 'صلاحيات الفريق' : 'Team access', exact: true }).count(), 1, `${label}: real translated copy`);
        assert.equal(await page.locator('.team-access-staff-table tbody tr').count(), 6, label);
        assert.equal(await page.locator('.team-access-participant-table tbody tr').count(), 3, label);

        // Pin every existing action combination, not just a global button count.
        for (let id = 1; id <= 6; id++) {
          const buttons = page.getByTestId(`row-staff-${id}`).locator('button');
          const action = id === 1 ? [] : id === 4 || id === 5 ? [`button-retry-staff-invitation-${id}`] : [`button-resend-staff-invitation-${id}`];
          assert.deepEqual(await buttons.evaluateAll(elements => elements.map(element => element.getAttribute('data-testid'))),
            [...action, `button-edit-staff-${id}`, `button-delete-staff-${id}`], label);
        }
        assert.equal(await page.getByTestId('row-participant-invitation-11').locator('button').count(), 0, `${label}: active access has no resend`);
        for (const id of [12, 13]) assert.equal(await page.getByTestId(`button-resend-participant-invitation-${id}`).count(), 1, label);
        const sidebar = await page.locator('.sidebar').boundingBox();
        const main = await page.locator('.main-panel').boundingBox();
        if (width >= 1024) {
          assert.ok(sidebar && main && sidebar.width > 0, `${label}: desktop navigation is present`);
          assert.ok(language === 'ar' ? main.x + main.width <= sidebar.x + 1 : main.x >= sidebar.x + sidebar.width - 1,
            `${label}: content must remain beside, not beneath, navigation`);
        } else {
          assert.equal(await page.locator('.sidebar').isVisible(), false, `${label}: phone uses mobile navigation`);
          assert.ok(main && main.width <= width, label);
        }
        assert.deepEqual(await layoutProblems(page), [], label);
        if (language === 'en' && width === 1024) {
          // Negative controls prove these are regression detectors rather than
          // assertions which pass even with broken icon/label composition.
          const poison = await page.addStyleTag({ content: `
            [data-testid="button-edit-staff-1"] svg { transform: translateY(14px); }
            [data-testid="button-resend-staff-invitation-2"] { width: 30px !important; overflow: hidden; }
            .team-access-page { min-width: 2000px; }
          ` });
          await page.getByTestId('button-delete-staff-1').evaluate(button => { button.tabIndex = -1; });
          const detected = await layoutProblems(page);
          assert.ok(detected.includes('document horizontal overflow'), 'Negative control: detect document overflow');
          assert.ok(detected.some(problem => problem.includes('vertically separated icon and label')), 'Negative control: detect stacked icons');
          assert.ok(detected.some(problem => problem.includes('clipped label')), 'Negative control: detect clipped action labels');
          assert.ok(detected.some(problem => problem.includes('inaccessible action')), 'Negative control: detect actions removed from keyboard access');
          await poison.evaluate(element => element.parentNode?.removeChild(element));
          await page.getByTestId('button-delete-staff-1').evaluate(button => button.removeAttribute('tabindex'));
        }
        await assertActionAccess(page, label);

        // Exercise the real uncertain-result branches with local inert service
        // stubs. Neither operation sends a request or changes the fixture rows.
        for (const target of ['staff-invitation-6', 'participant-invitation-12']) {
          await page.getByTestId(`button-resend-${target}`).click();
          assert.equal(await page.locator('.team-access-feedback.is-error[role="alert"]').count(), 1, `${label}: uncertain ${target} feedback`);
          assert.deepEqual(await layoutProblems(page), [], `${label}: uncertain ${target}`);
        }
        await page.getByTestId('button-retry-staff-invitation-4').click();
        assert.equal(await page.locator('.team-access-staff-table tbody tr').count(), 6, `${label}: retry is inert`);
        await page.getByTestId('button-delete-staff-1').click();
        await page.getByRole('alertdialog').waitFor();
        await page.getByTestId('button-confirm-delete').click();
        // The delete service stub is inert even if someone confirms removal.
        await page.getByTestId('button-keep-record').click();
        assert.equal(await page.locator('.team-access-staff-table tbody tr').count(), 6, `${label}: revoke cannot remove fixture data`);
        assert.deepEqual(forbiddenRequests, [], `${label}: no API, external services, or outbound mail`);
        assert.deepEqual(errors, [], `${label}: no browser exceptions`);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previousBasePath;
  }
});
