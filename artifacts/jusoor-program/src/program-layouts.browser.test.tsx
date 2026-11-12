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

            await page.locator('.ana-session .ana-button').click();
            const attendanceDialog = page.getByTestId('dialog-attendance-register');
            await attendanceDialog.waitFor();
            assert.equal(await attendanceDialog.locator('.ana-register-person').count(), 2, `${label}: sample roster renders`);
            assert.equal(await attendanceDialog.locator('.ana-status-set').count(), 2, `${label}: each participant has status controls`);
            assert.equal(await attendanceDialog.locator('.ana-status-option').count(), 8, `${label}: all four attendance statuses render per participant`);
            assert.equal(await attendanceDialog.locator('.ana-register-note input').count(), 2, `${label}: notes are available for each participant`);
            assert.equal(await attendanceDialog.locator('.ana-unmatched-row').count(), 1, `${label}: unmatched Zoom attendee is available for review`);
            assert.equal(await attendanceDialog.locator('.ana-unmatched-row select').count(), 1, `${label}: participant matching selector renders`);
            assert.equal(await attendanceDialog.locator('.ana-unmatched-row button').count(), 2, `${label}: matching and ignore actions render`);
            assert.equal(
              await attendanceDialog.locator('.ana-status-set').first().getByRole('button', { name: /Present|حاضر/ }).getAttribute('aria-pressed'),
              'true',
              `${label}: the saved attendance status is announced`,
            );
            assert.ok(
              await attendanceDialog.getByRole('button', { name: language === 'ar' ? 'مطابقة' : 'Match' }).count(),
              `${label}: match action uses the active language`,
            );
            assert.ok(
              await attendanceDialog.getByRole('button', { name: language === 'ar' ? 'تجاهل' : 'Ignore' }).count(),
              `${label}: ignore action uses the active language`,
            );

            const dialogBounds = await attendanceDialog.evaluate(element => {
              const rect = element.getBoundingClientRect();
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth,
              };
            });
            assert.ok(
              dialogBounds.left >= 0 && dialogBounds.right <= dialogBounds.viewport.width &&
                dialogBounds.top >= 0 && dialogBounds.bottom <= dialogBounds.viewport.height,
              `${label} / attendance register: modal stays inside the viewport (${JSON.stringify(dialogBounds)})`,
            );
            assert.ok(
              dialogBounds.documentWidth <= dialogBounds.viewport.width &&
                dialogBounds.bodyWidth <= dialogBounds.viewport.width,
              `${label} / attendance register: no page-level horizontal overflow`,
            );

            for (const selector of [
              '.ana-status-set',
              '.ana-register-note input',
              '.ana-unmatched-row select',
              '.ana-unmatched-row button',
            ]) {
              for (const control of await attendanceDialog.locator(selector).all()) {
                await control.scrollIntoViewIfNeeded();
                const controlBounds = await control.evaluate(element => {
                  const rect = element.getBoundingClientRect();
                  const dialog = element.closest('.ana-attendance-modal')!.getBoundingClientRect();
                  return { left: rect.left, right: rect.right, dialogLeft: dialog.left, dialogRight: dialog.right };
                });
                assert.ok(
                  controlBounds.left >= controlBounds.dialogLeft - 1 &&
                    controlBounds.right <= controlBounds.dialogRight + 1,
                  `${label} / attendance register: ${selector} stays within the modal (${JSON.stringify(controlBounds)})`,
                );
              }
            }

            await attendanceDialog.locator('.ana-modal-head .ana-icon-btn').click();
            await attendanceDialog.waitFor({ state: 'hidden' });
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

            const receiptHistory = page.locator('.grant-receipt-history');
            await receiptHistory.locator('summary').click();
            const receiptEntries = receiptHistory.locator('.grant-receipt-list > li');
            assert.equal(await receiptEntries.count(), 2, `${label}: received and reversal entries appear in history`);
            assert.ok(
              await receiptEntries.nth(0).locator('.grant-receipt-copy > b').textContent() ===
                (language === 'ar' ? 'الأموال المستلمة' : 'Funds received'),
              `${label}: received entry type remains readable in the selected language`,
            );
            assert.ok(
              await receiptEntries.nth(1).locator('.grant-receipt-copy > b').textContent() ===
                (language === 'ar' ? 'قيد عكسي للتصحيح' : 'Correction reversal'),
              `${label}: reversal entry type remains readable in the selected language`,
            );
            const historyLayout = await receiptHistory.evaluate(element => {
              const list = element.querySelector<HTMLElement>('.grant-receipt-list')!;
              const entries = Array.from(list.querySelectorAll<HTMLElement>(':scope > li'));
              const measuredEntries = entries.map(entry => {
                const bounds = entry.getBoundingClientRect();
                const amount = entry.querySelector<HTMLElement>('.grant-receipt-amount')!.getBoundingClientRect();
                const dateAndReference = entry.querySelector<HTMLElement>('.grant-receipt-copy > small')!;
                return {
                  bounds: { left: bounds.left, right: bounds.right },
                  amount: { left: amount.left, right: amount.right, width: amount.width },
                  dateAndReference: {
                    text: dateAndReference.textContent,
                    height: dateAndReference.getBoundingClientRect().height,
                    lineHeight: Number.parseFloat(getComputedStyle(dateAndReference).lineHeight),
                    scrollWidth: dateAndReference.scrollWidth,
                    clientWidth: dateAndReference.clientWidth,
                  },
                };
              });
              return {
                entries: measuredEntries,
                viewportWidth: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth,
              };
            });
            assert.ok(
              historyLayout.documentWidth <= historyLayout.viewportWidth &&
                historyLayout.bodyWidth <= historyLayout.viewportWidth,
              `${label} / receipt history: opening the ledger does not cause page-level horizontal overflow`,
            );
            for (const [index, entry] of historyLayout.entries.entries()) {
              assert.ok(
                entry.amount.width > 0 && entry.amount.left >= entry.bounds.left - 1 &&
                  entry.amount.right <= entry.bounds.right + 1,
                `${label} / receipt entry ${index + 1}: amount remains visible within the row`,
              );
              assert.match(entry.dateAndReference.text ?? '', /2026/, `${label} / receipt entry ${index + 1}: date remains visible`);
              assert.ok(
                entry.dateAndReference.scrollWidth <= entry.dateAndReference.clientWidth,
                `${label} / receipt entry ${index + 1}: date and voucher reference wrap instead of overflowing`,
              );
              if (width === 390) {
                assert.ok(
                  entry.dateAndReference.height > entry.dateAndReference.lineHeight,
                  `${label} / receipt entry ${index + 1}: long voucher reference wraps onto additional lines`,
                );
              }
            }

            const receiptActions = page.locator('.grant-award-actions button');
            assert.equal(await receiptActions.count(), 2, `${label}: installment and correction actions are available`);
            if (width === 390) {
              await page.setViewportSize({ width, height: 360 });
              const visibleViewportHeight = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
              assert.equal(visibleViewportHeight, 360, `${label}: simulate a phone keyboard reducing the visible viewport`);
            }
            for (const [dialogIndex, dialogName] of [[0, 'installment'], [1, 'correction']] as const) {
              await receiptActions.nth(dialogIndex).click();
              const dialog = page.getByRole('dialog');
              await dialog.waitFor();
              if (width === 390) {
                const saveLabel = language === 'ar'
                  ? dialogName === 'installment' ? 'حفظ الإيصال' : 'حفظ التصحيح'
                  : dialogName === 'installment' ? 'Save receipt' : 'Save correction';
                assert.equal(
                  await dialog.getByRole('button', { name: language === 'ar' ? 'إلغاء' : 'Cancel' }).count(),
                  1,
                  `${label} / ${dialogName}: cancel action is readable`,
                );
                assert.equal(
                  await dialog.getByRole('button', { name: saveLabel }).count(),
                  1,
                  `${label} / ${dialogName}: save action is readable`,
                );
              }
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
                  visibleViewport: {
                    top: window.visualViewport?.offsetTop ?? 0,
                    height: window.visualViewport?.height ?? window.innerHeight,
                  },
                  scrollHeight: element.scrollHeight,
                  clientHeight: element.clientHeight,
                  documentWidth: document.documentElement.scrollWidth,
                  bodyWidth: document.body.scrollWidth,
                };
              });
              assert.ok(
                dialogLayout.rect.left >= 0 && dialogLayout.rect.right <= dialogLayout.viewport.width &&
                  dialogLayout.rect.top >= dialogLayout.visibleViewport.top &&
                  dialogLayout.rect.bottom <= dialogLayout.visibleViewport.top + dialogLayout.visibleViewport.height,
                `${label} / ${dialogName}: dialog stays inside the visible viewport (${JSON.stringify(dialogLayout.rect)})`,
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
              if (width === 390) {
                assert.ok(
                  dialogLayout.scrollHeight > dialogLayout.clientHeight,
                  `${label} / ${dialogName}: reduced-height dialog can scroll to offscreen content`,
                );
                for (const [selector, value] of [
                  ['input[type="number"]', '125.50'],
                  ['input[type="date"]', '2026-11-05'],
                  ['input[maxlength="120"]', 'MOBILE-RECEIPT-2026'],
                  ['textarea', dialogName === 'correction' ? 'تصحيح المبلغ المسجل' : 'تفاصيل استلام الدفعة'],
                ] as const) {
                  const field = dialog.locator(selector);
                  await field.scrollIntoViewIfNeeded();
                  await field.fill(value);
                  const fieldBounds = await field.evaluate(element => {
                    const fieldRect = element.getBoundingClientRect();
                    const dialog = element.closest<HTMLElement>('[role="dialog"]')!;
                    const dialogRect = dialog.getBoundingClientRect();
                    const actionsRect = dialog.querySelector<HTMLElement>('.modal-actions')!.getBoundingClientRect();
                    return {
                      top: fieldRect.top,
                      bottom: fieldRect.bottom,
                      dialogTop: dialogRect.top + dialog.clientTop,
                      dialogBottom: dialogRect.bottom - Number.parseFloat(getComputedStyle(dialog).borderBottomWidth),
                      actionsTop: actionsRect.top,
                      viewportTop: window.visualViewport?.offsetTop ?? 0,
                      viewportBottom: (window.visualViewport?.offsetTop ?? 0) +
                        (window.visualViewport?.height ?? window.innerHeight),
                    };
                  });
                  assert.ok(
                    fieldBounds.top >= Math.max(fieldBounds.dialogTop, fieldBounds.viewportTop) - 1 &&
                      fieldBounds.bottom <= Math.min(fieldBounds.dialogBottom, fieldBounds.viewportBottom) + 1 &&
                      (selector !== 'textarea' || fieldBounds.bottom <= fieldBounds.actionsTop + 1),
                    `${label} / ${dialogName}: ${selector} can be reached while the keyboard is open (${JSON.stringify(fieldBounds)})`,
                  );
                }
                await dialog.locator('.modal-actions button').first().scrollIntoViewIfNeeded();
                const actionBounds = await dialog.locator('.modal-actions button').evaluateAll(buttons =>
                  buttons.map(button => {
                    const rect = button.getBoundingClientRect();
                    return { top: rect.top, bottom: rect.bottom };
                  }),
                );
                assert.equal(actionBounds.length, 2, `${label} / ${dialogName}: both actions remain available`);
                assert.ok(
                  actionBounds.every(bounds => bounds.top >= 0 && bounds.bottom <= 360),
                  `${label} / ${dialogName}: save and cancel stay reachable in the reduced viewport (${JSON.stringify(actionBounds)})`,
                );
              }
              if (width === 390) {
                await dialog.locator('.modal-actions button').first().click();
                const discardDialog = page.getByTestId('dialog-discard-changes');
                await discardDialog.waitFor();
                await discardDialog.locator('.button-danger').click();
              } else {
                await dialog.locator('.modal-head .icon-button').click();
              }
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
