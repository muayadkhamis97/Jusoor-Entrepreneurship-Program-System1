import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const packageRoot = path.resolve(import.meta.dirname, '..');

async function tooltipState(page: Page) {
  return page.locator('.program-icon-tooltip').evaluate((element: HTMLElement) => ({
    id: element.id, hidden: element.hidden, text: element.textContent, lang: element.lang, dir: element.dir,
  }));
}

async function pointer(page: Page, id: string, type: 'pointerover' | 'pointerout', pointerType = 'mouse') {
  await page.locator(`#${id} span`).dispatchEvent(type, { bubbles: true, pointerType });
}

test('icon help handles DOM events, explicit ownership and teardown without activating controls', { timeout: 120_000 }, async t => {
  // Import real modules through Vite, including CSS; never serialize the installer.
  const vite = await createServer({
    configFile: false,
    root: packageRoot,
    plugins: [tailwindcss({ optimize: false })],
    resolve: { alias: { '@': path.join(packageRoot, 'src') }, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' });
    const runtimeErrors: string[] = [];
    const blockedRequests: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin === origin && request.method() === 'GET') return route.continue();
      blockedRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.abort('blockedbyclient');
    });
    await page.goto(`${origin}/src/test-fixtures/icon-tooltip.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.iconTooltipFixture));
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const reset = async () => {
      await page.evaluate(() => {
        window.iconTooltipFixture.cleanup();
        window.iconTooltipFixture.dialog(false);
        (document.activeElement as HTMLElement)?.blur();
        document.documentElement.lang = 'en';
        document.documentElement.dir = 'ltr';
        document.getElementById('first')!.setAttribute('aria-label', 'Edit sample');
        document.getElementById('second')!.style.cssText = '';
        window.iconTooltipFixture.install();
      });
      await page.clock.runFor(50);
    };

    await t.test('pointer delay, nested targets, Escape and re-entry', async () => {
      await reset();
      await pointer(page, 'first', 'pointerover');
      await page.clock.runFor(349);
      assert.equal((await tooltipState(page)).hidden, true, 'Hover waits for its delay.');
      await page.clock.runFor(1);
      const state = await tooltipState(page);
      assert.equal(state.hidden, false);
      assert.equal(state.text, 'Edit sample');
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), `hint hint-two ${state.id}`);
      await page.locator('#first span').evaluate(element => element.dispatchEvent(
        new PointerEvent('pointerout', { bubbles: true, relatedTarget: element.parentElement, pointerType: 'mouse' }),
      ));
      assert.equal((await tooltipState(page)).hidden, false, 'Moving inside one control must not hide help.');
      await page.keyboard.press('Escape');
      assert.equal((await tooltipState(page)).hidden, true);
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), 'hint hint-two');
      await pointer(page, 'first', 'pointerover');
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true, 'Escape suppression lasts until exit.');
      await pointer(page, 'first', 'pointerout');
      await pointer(page, 'first', 'pointerover');
      await page.clock.runFor(350);
      assert.equal((await tooltipState(page)).hidden, false);
      await pointer(page, 'first', 'pointerout');
      assert.equal((await tooltipState(page)).hidden, true);
      await pointer(page, 'second', 'pointerover');
      await page.keyboard.press('Escape');
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true, 'Escape also cancels pending hover.');
      await pointer(page, 'second', 'pointerout');
      await pointer(page, 'second', 'pointerover', 'touch');
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true, 'Touch must not schedule hover help.');
    });

    await t.test('focus transitions, Tab and preserved descriptions', async () => {
      await reset();
      await page.locator('#first').focus();
      assert.equal((await tooltipState(page)).hidden, false, 'Focus opens help without a delay.');
      await page.keyboard.press('Escape');
      assert.equal((await tooltipState(page)).hidden, true);
      assert.equal(await page.locator('#first').evaluate(element => element === document.activeElement), true);
      await pointer(page, 'first', 'pointerover');
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#second').evaluate(element => element === document.activeElement), true);
      assert.equal((await tooltipState(page)).text, 'View sample');
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), 'hint hint-two');
      await page.keyboard.press('Shift+Tab');
      assert.equal((await tooltipState(page)).text, 'Edit sample');
      assert.equal((await tooltipState(page)).hidden, false, 'Returning focus clears Escape suppression.');
      await pointer(page, 'first', 'pointerout');
      assert.equal((await tooltipState(page)).hidden, false, 'Pointer exit must not hide focused help.');
      await page.locator('#plain').focus();
      await pointer(page, 'second', 'pointerover');
      await page.locator('#second').evaluate(element => element.setAttribute('aria-describedby', 'owned-description'));
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true, 'Explicit ownership acquired during the hover delay wins.');
      assert.equal(await page.locator('#second').getAttribute('aria-describedby'), 'owned-description');
      await page.locator('#second').evaluate(element => element.removeAttribute('aria-describedby'));
      assert.equal((await tooltipState(page)).hidden, true);
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), 'hint hint-two');
      for (const id of ['disabled', 'aria-disabled']) {
        await pointer(page, id, 'pointerover');
        await page.clock.runFor(400);
        assert.equal((await tooltipState(page)).hidden, true);
      }
    });

    await t.test('explicit and real Radix tooltips do not duplicate descriptions', async () => {
      await reset();
      await page.locator('#owned').focus();
      await pointer(page, 'owned', 'pointerover');
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true);
      assert.equal(await page.locator('#owned').getAttribute('aria-describedby'), 'owned-description');
      await page.locator('#radix').focus();
      await page.clock.runFor(100);
      assert.equal(await page.getByRole('tooltip', { name: 'Product-owned explicit help', exact: true }).count(), 1);
      await pointer(page, 'radix', 'pointerover');
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true);
      const ids = (await page.locator('#radix').getAttribute('aria-describedby') || '').split(/\s+/);
      assert.equal(ids.length, 1);
      assert.notEqual(ids[0], (await tooltipState(page)).id);
      await page.locator('#plain').focus();
    });

    await t.test('Arabic label changes and actual viewport-edge geometry', async () => {
      await reset();
      await page.locator('#first').focus();
      await page.locator('#first').evaluate(element => {
        document.documentElement.lang = 'ar';
        document.documentElement.dir = 'rtl';
        element.setAttribute('aria-label', 'تعديل العينة');
      });
      await page.clock.runFor(50);
      const state = await tooltipState(page);
      assert.equal(state.text, 'تعديل العينة');
      assert.equal(state.lang, 'ar');
      assert.equal(state.dir, 'rtl');
      assert.equal(await page.getByRole('button', { name: 'تعديل العينة', exact: true }).count(), 1);
      await page.locator('#first').evaluate(element => element.removeAttribute('aria-label'));
      await page.clock.runFor(50);
      assert.equal((await tooltipState(page)).hidden, true, 'Removing a label must dismiss stale help.');
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), 'hint hint-two');
      await page.locator('#first').evaluate(element => element.setAttribute('aria-label', 'Edit sample'));
      for (const edge of ['left', 'right'] as const) {
        await page.locator('#plain').focus();
        await page.locator('#second').evaluate((element, side) => {
          element.style.cssText = `position:fixed;top:0;${side}:0`;
        }, edge);
        await page.locator('#second').focus();
        const bounds = await page.locator('.program-icon-tooltip').boundingBox();
        const anchor = await page.locator('#second').boundingBox();
        assert.ok(bounds && anchor);
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 640);
        assert.ok(bounds.y >= anchor.y + anchor.height && bounds.y + bounds.height <= 480, 'Top-edge help flips below its control.');
      }
      await page.locator('#second').evaluate(element => { element.style.cssText = ''; });
    });

    await t.test('dialog controls, removed anchors and route replacement', async () => {
      await reset();
      await page.locator('#plain').focus();
      await page.evaluate(() => window.iconTooltipFixture.dialog(true));
      await page.clock.runFor(100);
      await page.locator('#dialog-control').focus();
      assert.equal((await tooltipState(page)).text, 'Dialog help');
      assert.equal((await tooltipState(page)).hidden, false);
      await page.keyboard.press('Escape');
      assert.equal((await tooltipState(page)).hidden, true);
      assert.equal(await page.getByRole('dialog', { name: 'Synthetic dialog' }).count(), 1);
      await page.keyboard.press('Tab');
      assert.equal((await tooltipState(page)).text, 'Next dialog help');
      await page.evaluate(() => window.iconTooltipFixture.dialog(false));
      await page.clock.runFor(100);
      assert.equal((await tooltipState(page)).hidden, true);
      await page.locator('#route-control').focus();
      assert.equal((await tooltipState(page)).text, 'Route 0 help');
      await page.evaluate(() => {
        const old = document.getElementById('route-control')!;
        window.iconTooltipFixture.replaceRoute();
        queueMicrotask(() => { document.body.dataset.removedDescription = old.getAttribute('aria-describedby') || ''; });
      });
      await page.clock.runFor(50);
      assert.equal((await tooltipState(page)).hidden, true);
      assert.equal(await page.locator('body').getAttribute('data-removed-description'), '');
      await page.locator('#route-control').focus();
      assert.equal((await tooltipState(page)).text, 'Route 1 help');
      await page.locator('#plain').focus();
      await pointer(page, 'route-control', 'pointerover');
      await page.evaluate(() => window.iconTooltipFixture.replaceRoute());
      await page.clock.runFor(400);
      assert.equal((await tooltipState(page)).hidden, true, 'A removed pending anchor must never appear later.');
      await page.locator('#route-control').focus();
      assert.equal((await tooltipState(page)).text, 'Route 2 help');
    });

    await t.test('cleanup cancels timers, restores titles and supports reinstallation', async () => {
      await reset();
      await page.locator('#native').focus();
      const oldId = (await tooltipState(page)).id;
      assert.equal((await tooltipState(page)).text, 'Native description');
      assert.equal(await page.locator('#native').getAttribute('title'), null);
      await page.locator('#plain').focus();
      await pointer(page, 'second', 'pointerover');
      await page.evaluate(() => window.iconTooltipFixture.cleanup());
      await page.clock.runFor(400);
      assert.equal(await page.locator('.program-icon-tooltip').count(), 0);
      assert.equal(await page.locator('#native').getAttribute('title'), 'Native description');
      assert.equal(await page.locator('#native').getAttribute('data-program-tooltip'), null);
      assert.equal(await page.locator('#native').getAttribute('aria-describedby'), null);
      await page.locator('#first').focus();
      await pointer(page, 'first', 'pointerover');
      await page.locator('#first').evaluate(element => element.setAttribute('aria-label', 'Changed after cleanup'));
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        document.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      });
      await page.clock.runFor(400);
      assert.equal(await page.locator('.program-icon-tooltip').count(), 0);
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), 'hint hint-two');
      await page.evaluate(() => window.iconTooltipFixture.install());
      await page.locator('#plain').focus();
      await page.locator('#first').focus();
      const state = await tooltipState(page);
      assert.notEqual(state.id, oldId);
      assert.equal(state.text, 'Changed after cleanup');
      assert.equal(await page.locator('.program-icon-tooltip').count(), 1);
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), `hint hint-two ${state.id}`);
      await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
      assert.equal((await tooltipState(page)).hidden, true);
      await page.locator('#plain').focus();
      await page.locator('#first').focus();
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      assert.equal((await tooltipState(page)).hidden, true);
      await page.locator('#plain').focus();
      await page.locator('#first').focus();
      await page.evaluate(() => {
        window.iconTooltipFixture.cleanup();
        window.iconTooltipFixture.cleanup();
      });
      assert.equal(await page.locator('#first').getAttribute('aria-describedby'), 'hint hint-two');
      assert.equal(await page.locator('.program-icon-tooltip').count(), 0);
    });
    assert.equal(await page.evaluate(() => window.iconTooltipFixture.activations()), 0, 'Help must never activate controls.');
    assert.deepEqual(blockedRequests, [], 'No API calls or external requests are permitted.');
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (browser) await browser.close();
    await vite.close();
  }
});
