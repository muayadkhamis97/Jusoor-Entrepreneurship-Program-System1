import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { getStaffNavigationItems } from './mobile-staff-navigation';

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

test('Admin sidebar remains opaque, viewport-pinned and navigable across its routes and scroll', { timeout: 120_000 }, async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const priorPort = process.env.PORT;
  const priorBasePath = process.env.BASE_PATH;
  process.env.PORT = String(port);
  process.env.BASE_PATH = '/';

  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    vite = await createViteServer({
      configFile: path.join(packageRoot, 'vite.config.ts'),
      root: packageRoot,
      server: { host: '127.0.0.1', port, strictPort: true },
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const viewport = { width: 1280, height: 640 };
    const page = await browser.newPage({ viewport });
    await page.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto(`${origin}/src/test-fixtures/admin-sidebar-layout.html`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('.footer');
    assert.doesNotMatch((await footer.textContent()) ?? '', /jusoor/i, 'Page footers should not repeat the organization name.');
    const footerBounds = await footer.boundingBox();
    const footerLabelBounds = await footer.locator('span').boundingBox();
    assert.ok(footerBounds && footerLabelBounds && footerLabelBounds.x > footerBounds.x + footerBounds.width / 2, 'The remaining footer label should stay aligned to the right.');

    const sidebar = page.getByTestId('admin-sidebar');
    const navItems = getStaffNavigationItems('coordinator');
    assert.equal(await page.locator('.side-nav a').count(), navItems.length);
    const expectedBackground = await sidebar.evaluate(element => getComputedStyle(element).backgroundColor);
    const initialBounds = await sidebar.boundingBox();
    assert.equal(await sidebar.evaluate(element => getComputedStyle(element).position), 'fixed');
    assert.ok(initialBounds && Math.abs(initialBounds.y) <= 0.5 && Math.abs(initialBounds.height - viewport.height) <= 1, 'Sidebar should cover the viewport from its top edge.');
    assert.notEqual(expectedBackground, 'rgba(0, 0, 0, 0)', 'Sidebar should paint an opaque dark surface.');
    assert.ok(Number(await sidebar.evaluate(element => getComputedStyle(element).zIndex)) > 20, 'Sidebar should paint above the workspace texture layer.');
    const mainBounds = await page.locator('.main-panel').boundingBox();
    assert.ok(initialBounds && mainBounds && mainBounds.x >= initialBounds.x + initialBounds.width, 'Main content should not overlap the desktop sidebar.');

    for (const { href, label } of navItems) {
      const item = page.getByTestId(`admin-nav-${href === '/' ? 'overview' : href.slice(1)}`);
      await item.click();
      assert.equal(await page.getByTestId('sidebar-current-route').textContent(), href);
      assert.equal(await item.getAttribute('aria-current'), 'page', `${label} should be identified as the active destination.`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const afterPageScroll = await sidebar.boundingBox();
      assert.ok(afterPageScroll && Math.abs(afterPageScroll.y) <= 0.5 && Math.abs(afterPageScroll.height - viewport.height) <= 1, `Sidebar should stay pinned after scrolling on ${label}.`);
      assert.equal(await sidebar.evaluate(element => getComputedStyle(element).backgroundColor), expectedBackground, `Sidebar background should remain stable on ${label}.`);
      assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(5, window.innerHeight - 2)?.closest('.sidebar'))), true, `The viewport area beneath the sidebar should remain covered on ${label}.`);
    }

    await sidebar.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const lastNavigationItem = page.getByTestId(`admin-nav-${navItems.at(-1)!.href.slice(1)}`);
    const sidebarBounds = await sidebar.boundingBox();
    const lastItemBounds = await lastNavigationItem.boundingBox();
    assert.ok(sidebarBounds && lastItemBounds && lastItemBounds.y >= sidebarBounds.y && lastItemBounds.y + lastItemBounds.height <= sidebarBounds.y + sidebarBounds.height, 'The lower navigation entry should remain reachable inside the sidebar scroll area.');

    await page.setViewportSize({ width: 1440, height: 900 });
    const resizedBounds = await sidebar.boundingBox();
    assert.ok(resizedBounds && Math.abs(resizedBounds.height - 900) <= 1, 'Sidebar should resize to a taller viewport.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
