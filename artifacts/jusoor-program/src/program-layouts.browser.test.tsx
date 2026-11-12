import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createServer as createNetServer } from 'node:net';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

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

test('team, analytics, learning and grants retain English/Arabic layout across desktop and phone widths', { timeout: 180_000 }, async () => {
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
        name: 'program-page-layout-inert-api',
        enforce: 'pre',
        resolveId(source, importer) {
          const mockableModules = [
            '/src/analytics-surfaces.tsx',
            '/src/course-surfaces.tsx',
            '/src/course-quizzes.tsx',
            '/src/course-discussion.tsx',
            '/src/grant-surfaces.tsx',
          ];
          if (source !== '@workspace/api-client-react' || !importer ||
              !mockableModules.some(module => importer.endsWith(module))) return null;
          return path.join(packageRoot, 'src/test-fixtures/program-layouts-api.tsx');
        },
      }],
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    for (const pageName of ['analytics', 'learning', 'grants'] as const) {
      for (const language of ['en', 'ar'] as const) {
        for (const width of [1280, 390]) {
          const label = `${pageName} / ${language} / ${width}px`;
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          await page.addInitScript(({ language }) => {
            localStorage.setItem('jusoor-language', language);
            sessionStorage.clear();
          }, { language });
          const blockedRequests: string[] = [];
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin || route.request().method() !== 'GET' || url.pathname.startsWith('/api/')) {
              blockedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
              return route.abort('blockedbyclient');
            }
            return route.continue();
          });
          await page.goto(`${origin}/src/test-fixtures/program-layouts.html?page=${pageName}`, { waitUntil: 'domcontentloaded' });
          const primary = page.locator({
            analytics: '.analytics-page',
            learning: '.course-hub',
            grants: '.grant-page-heading',
          }[pageName]);
          await primary.waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => document.documentElement.lang === (localStorage.getItem('jusoor-language') || 'en'));
          assert.equal(await page.locator('html').getAttribute('lang'), language, label);
          assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr', label);

          const dimensions = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            viewportWidth: window.innerWidth,
          }));
          assert.ok(
            dimensions.documentWidth <= dimensions.viewportWidth &&
              dimensions.bodyWidth <= dimensions.viewportWidth,
            `${label}: no page-level horizontal overflow (${dimensions.documentWidth}px document, ${dimensions.bodyWidth}px body, ${dimensions.viewportWidth}px viewport)`,
          );

          if (pageName === 'analytics') {
            const positions = await page.evaluate(() => {
              const heading = document.querySelector('.analytics-heading > div:first-child')!.getBoundingClientRect();
              const tools = document.querySelector('.ana-header-tools')!.getBoundingClientRect();
              return { heading: { left: heading.left, right: heading.right }, tools: { left: tools.left, right: tools.right } };
            });
            if (width > 760) {
              assert.ok(language === 'ar'
                ? positions.tools.right < positions.heading.left
                : positions.heading.right < positions.tools.left,
              `${label}: analytics tools stay at inline-end of the heading`);
            } else {
              assert.ok(language === 'ar'
                ? positions.heading.right >= positions.tools.right - 2
                : positions.heading.left <= positions.tools.left + 2,
              `${label}: stacked analytics tools align to inline-start`);
            }
          }

          if (pageName === 'learning') {
            const positions = await page.evaluate(() => {
              const index = document.querySelector('.course-module-index')!.getBoundingClientRect();
              const actions = document.querySelector('.course-module-actions')!.getBoundingClientRect();
              return { index: { left: index.left, right: index.right }, actions: { left: actions.left, right: actions.right } };
            });
            assert.ok(language === 'ar'
              ? positions.index.left > positions.actions.right
              : positions.index.right < positions.actions.left,
            `${label}: module number and edit controls stay at opposite inline edges`);
          }

          if (pageName === 'grants') {
            const positions = await page.evaluate(() => {
              const identity = document.querySelector('.grant-award-identity')!.getBoundingClientRect();
              const status = document.querySelector('.grant-award-status')!.getBoundingClientRect();
              const actions = document.querySelector('.grant-award-actions')!.getBoundingClientRect();
              const toolbar = document.querySelector('.grant-ledger-toolbar')!.getBoundingClientRect();
              const count = document.querySelector('.grant-ledger-count')!.getBoundingClientRect();
              return {
                identity: { left: identity.left, right: identity.right },
                status: { left: status.left, right: status.right },
                actions: { left: actions.left, right: actions.right },
                toolbar: { left: toolbar.left, right: toolbar.right },
                count: { left: count.left, right: count.right },
              };
            });
            if (width > 760) {
              assert.ok(language === 'ar'
                ? positions.status.right < positions.identity.left
                : positions.identity.right < positions.status.left,
              `${label}: award status stays at inline-end of the identity`);
            } else {
              assert.ok(language === 'ar'
                ? Math.abs(positions.actions.right - positions.status.right) < 3
                : Math.abs(positions.actions.left - positions.status.left) < 3,
              `${label}: stacked award actions align to inline-start`);
            }
            assert.ok(language === 'ar'
              ? Math.abs(positions.count.left - positions.toolbar.left) < 3
              : Math.abs(positions.count.right - positions.toolbar.right) < 3,
            `${label}: award count stays aligned to the toolbar's inline-end (count ${positions.count.left}-${positions.count.right}, toolbar ${positions.toolbar.left}-${positions.toolbar.right})`);

            const receiptActions = page.locator('.grant-award-actions button');
            assert.equal(await receiptActions.count(), 2, `${label}: installment and correction actions are available`);
            for (const [dialogIndex, dialogName] of [[0, 'installment'], [1, 'correction']] as const) {
              await receiptActions.nth(dialogIndex).click();
              const dialog = page.getByRole('dialog');
              await dialog.waitFor();
              const dialogLayout = await dialog.evaluate(element => {
                const rect = element.getBoundingClientRect();
                const fields = Array.from(element.querySelectorAll<HTMLElement>('.field')).map(field => {
                  const fieldRect = field.getBoundingClientRect();
                  const inputRect = field.querySelector('input, textarea')!.getBoundingClientRect();
                  return {
                    left: fieldRect.left,
                    right: fieldRect.right,
                    top: fieldRect.top,
                    width: fieldRect.width,
                    inputLeft: inputRect.left,
                    inputRight: inputRect.right,
                  };
                });
                const actions = element.querySelector<HTMLElement>('.modal-actions')!;
                const actionButtons = Array.from(actions.querySelectorAll('button')).map(button => {
                  const buttonRect = button.getBoundingClientRect();
                  return { left: buttonRect.left, right: buttonRect.right, top: buttonRect.top };
                });
                return {
                  rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                  fields,
                  actions: {
                    left: actions.getBoundingClientRect().left,
                    right: actions.getBoundingClientRect().right,
                    scrollWidth: actions.scrollWidth,
                    clientWidth: actions.clientWidth,
                    buttons: actionButtons,
                  },
                  viewport: { width: window.innerWidth, height: window.innerHeight },
                  documentWidth: document.documentElement.scrollWidth,
                  bodyWidth: document.body.scrollWidth,
                };
              });
              assert.ok(
                dialogLayout.rect.left >= 0 && dialogLayout.rect.right <= dialogLayout.viewport.width &&
                  dialogLayout.rect.top >= 0 && dialogLayout.rect.bottom <= dialogLayout.viewport.height,
                `${label} / ${dialogName}: dialog stays within the viewport (${JSON.stringify(dialogLayout.rect)})`,
              );
              assert.ok(
                dialogLayout.documentWidth <= dialogLayout.viewport.width &&
                  dialogLayout.bodyWidth <= dialogLayout.viewport.width,
                `${label} / ${dialogName}: no page-level horizontal overflow`,
              );
              assert.ok(dialogLayout.fields.length >= 4, `${label} / ${dialogName}: all receipt fields render`);
              for (const field of dialogLayout.fields) {
                assert.ok(
                  field.inputLeft >= field.left - 1 && field.inputRight <= field.right + 1 &&
                    field.left >= dialogLayout.rect.left && field.right <= dialogLayout.rect.right,
                  `${label} / ${dialogName}: each input stays aligned within its field`,
                );
              }
              if (width > 760) {
                assert.ok(
                  Math.abs(dialogLayout.fields[0].top - dialogLayout.fields[1].top) < 3,
                  `${label} / ${dialogName}: amount and date fields share a desktop row`,
                );
              } else {
                assert.ok(
                  dialogLayout.fields[1].top > dialogLayout.fields[0].top,
                  `${label} / ${dialogName}: amount and date fields stack on phones`,
                );
              }
              assert.equal(dialogLayout.actions.buttons.length, 2, `${label} / ${dialogName}: both actions render`);
              assert.ok(
                dialogLayout.actions.scrollWidth <= dialogLayout.actions.clientWidth &&
                  dialogLayout.actions.buttons.every(button =>
                    button.left >= dialogLayout.rect.left && button.right <= dialogLayout.rect.right),
                `${label} / ${dialogName}: action buttons stay aligned within the dialog`,
              );
              assert.ok(
                Math.abs(dialogLayout.actions.buttons[0].top - dialogLayout.actions.buttons[1].top) < 3,
                `${label} / ${dialogName}: action buttons share a row`,
              );
              await dialog.locator('.modal-head .icon-button').click();
              await dialog.waitFor({ state: 'hidden' });
            }
          }

          assert.deepEqual(errors, [], `${label}: no browser runtime errors`);
          assert.deepEqual(blockedRequests, [], `${label}: fixture makes no network or API requests`);
          await page.close();
        }
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
