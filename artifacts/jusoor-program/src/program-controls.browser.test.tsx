import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
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
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local browser-test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

test('workspace, analytics, API and grant controls share the same design tokens', { timeout: 120_000 }, async () => {
  const port = await unusedPort();
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
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === `http://127.0.0.1:${port}` && route.request().method() === 'GET') {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });
    await page.goto(`http://127.0.0.1:${port}/src/test-fixtures/program-controls.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.api-page .api-button-primary').waitFor();

    const primaryButtons = await page.locator(
      '.workspace [data-primary-family="workspace"], .analytics-page .ana-button.primary, .api-page .api-button-primary',
    ).evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {
        height: style.height,
        radius: style.borderRadius,
        fontSize: style.fontSize,
        background: style.backgroundColor,
        color: style.color,
      };
    }));
    assert.equal(primaryButtons.length, 3);
    assert.ok(primaryButtons.every(style => JSON.stringify(style) === JSON.stringify(primaryButtons[0])), 'Primary actions should resolve to identical size and theme styles.');

    const compactVariants = await page.locator(
      '.api-button-revoke, .ana-tool, .grant-action-button, .session-admin-actions .button, .recording-ready-email .button, .mentor-follow-up-actions .button, .participant-account-actions .button, .announcement-confirm .button',
    ).evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { height: style.height, fontSize: style.fontSize, radius: style.borderRadius };
    }));
    assert.deepEqual(compactVariants, [
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '36px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '34px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
    ], 'Feature-specific compact actions should use the shared sizing scale.');

    const fields = await page.locator(
      '.workspace .form-control, .mentor-follow-up-editor .form-control, .announcement-form .form-control, .analytics-page .ana-field input, .api-page .api-field input, .workspace .grant-status-filter select',
    ).evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {
        height: style.height,
        radius: style.borderRadius,
        fontSize: style.fontSize,
        background: style.backgroundColor,
        color: style.color,
      };
    }));
    assert.equal(fields.length, 6);
    assert.ok(fields.every(style =>
      style.height === fields[0].height &&
      style.radius === fields[0].radius &&
      style.background === fields[0].background &&
      style.color === fields[0].color
    ), `Common form fields and grant filters should resolve to identical size and theme styles. Actual: ${JSON.stringify(fields)}`);
    assert.ok(fields.every(style => Number.parseFloat(style.fontSize) >= 14), 'Shared form controls should retain readable minimum text sizing.');

    await page.keyboard.press('Tab');
    const focusStyle = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.deepEqual(focusStyle, { outlineStyle: 'solid', outlineWidth: '2px' }, 'Keyboard focus should use the shared visible focus ring.');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      columns: getComputedStyle(document.querySelector('.controls-fixture')!).gridTemplateColumns,
    }));
    assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'Shared controls should not force horizontal overflow at mobile width.');
    assert.equal(mobileLayout.columns.split(' ').length, 1, 'Feature control groups should stack on narrow screens.');
  } finally {
    await browser?.close();
    await vite?.close();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previousBasePath;
  }
});
