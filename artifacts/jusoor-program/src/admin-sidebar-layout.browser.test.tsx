import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { getStaffNavigationItems } from './mobile-staff-navigation';
import { getMobilePrimaryNavigationItems, groupStaffNavigationItems } from './staff-navigation-items';

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

    assert.equal(await page.locator('.footer, .sidebar-note, .today-label').count(), 0, 'Decorative workspace labels and the date chip should not displace navigation or page content.');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    assert.equal(await breadcrumb.locator('.crumb-home').getAttribute('href'), '/');
    assert.equal(await breadcrumb.locator('.crumb-section').textContent(), 'Operations');
    assert.equal(await page.locator('.side-nav a[title]').count(), 0, 'Desktop navigation links should not repeat their visible text in title attributes.');

    const sidebar = page.getByTestId('admin-sidebar');
    const navItems = getStaffNavigationItems('coordinator');
    const navGroups = groupStaffNavigationItems(navItems);
    const primaryItems = getMobilePrimaryNavigationItems(navItems);
    const primaryPaths = new Set(primaryItems.map(item => item.href));
    const overflowItems = navItems.filter(item => !primaryPaths.has(item.href));
    assert.equal(await page.locator('.side-nav a').count(), navItems.length);
    assert.equal(await page.locator('.side-nav-group').count(), 4);
    assert.deepEqual(await page.locator('.side-nav-group-label').allTextContents(), navGroups.map(section => section.group));
    assert.equal(await page.locator('.side-nav').getAttribute('aria-label'), 'Main navigation');
    assert.equal(await page.locator('.mobile-nav').getAttribute('aria-label'), 'Main navigation');
    assert.equal(await page.locator('.side-nav').evaluate(element => getComputedStyle(element).display), 'flex');
    assert.equal(await page.locator('.mobile-nav').evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).count(), 1, 'Only the desktop nav should be exposed on desktop.');
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
      assert.equal(await page.locator('.crumb b').textContent(), label, `${label} should be the current breadcrumb page.`);
      const expectedGroup = navGroups.find(group => group.items.some(navItem => navItem.href === href))?.group;
      assert.equal(await page.locator('.crumb-section').textContent(), expectedGroup, `${label} should include its navigation section in the breadcrumb.`);
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

    await page.setViewportSize({ width: 390, height: 800 });
    const mobileNav = page.getByTestId('mobile-staff-navigation');
    assert.equal(await sidebar.evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await page.locator('.side-nav').evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await mobileNav.evaluate(element => getComputedStyle(element).display), 'flex');
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).count(), 1, 'Only the mobile nav should be exposed on mobile.');
    assert.equal(await mobileNav.getByRole('link').count(), primaryItems.length);
    assert.equal(await mobileNav.locator('a[title]').count(), 0, 'Mobile navigation links should not repeat their visible text in title attributes.');
    assert.equal(await mobileNav.getByTestId('button-mobile-more').isVisible(), true);
    const mobileBounds = await mobileNav.boundingBox();
    assert.ok(mobileBounds && Math.abs(mobileBounds.y + mobileBounds.height - 800) <= 1, 'The mobile navigation should stay fixed to the bottom edge.');
    const moreButton = mobileNav.getByTestId('button-mobile-more');
    await moreButton.click();
    const moreMenu = page.getByRole('menu', { name: 'More' });
    await moreMenu.waitFor();
    assert.equal(await moreMenu.getByRole('menuitem').count(), overflowItems.length + 1, 'More should expose the remaining routes and sign out.');
    assert.equal(await moreMenu.locator('a[title]').count(), 0, 'Overflow navigation links should not duplicate title text.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
