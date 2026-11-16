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
  if (!address || typeof address === 'string') throw new Error('Could not allocate a browser-test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

test('participant account actions are visible, keyboard-accessible, responsive and retryable', { timeout: 120_000 }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto(`${origin}/src/test-fixtures/participant-account-actions.html`, { waitUntil: 'domcontentloaded' });

    const accountControls = page.getByTestId('participant-account-actions');
    const signOutButton = page.getByRole('menuitem', { name: 'Sign out', exact: true });
    const switchAccountButton = page.getByRole('menuitem', { name: 'Switch account', exact: true });
    await accountControls.waitFor();
    await page.getByTestId('button-participant-account-menu').click();
    assert.equal(await signOutButton.isVisible(), true);
    assert.equal(await switchAccountButton.isVisible(), true);

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const button of [signOutButton, switchAccountButton]) {
        const bounds = await button.boundingBox();
        assert.ok(bounds && bounds.height >= 36 && bounds.x >= 0 && bounds.x + bounds.width <= width, `Account action should remain visible and touch-sized at ${width}px.`);
      }
    }

    await signOutButton.focus();
    await page.keyboard.press('Enter');
    const redirectTarget = page.getByTestId('participant-redirect-target');
    await redirectTarget.waitFor();
    assert.equal(await redirectTarget.textContent(), '/', 'Sign out should request the public app landing path.');
    assert.equal(await accountControls.count(), 0, 'The participant account action should not remain visible after the synthetic signed-out state.');

    await page.getByRole('button', { name: 'Restore synthetic session' }).click();
    await page.getByTestId('button-participant-account-menu').click();
    await switchAccountButton.focus();
    await page.keyboard.press('Enter');
    await redirectTarget.waitFor();
    assert.equal(await redirectTarget.textContent(), '/participant', 'Switch account should sign out and return to the participant route, which shows the existing Clerk sign-in flow.');

    await page.getByRole('button', { name: 'Restore synthetic session' }).click();
    await page.getByRole('button', { name: 'Fail the next sign-out' }).click();
    await page.getByTestId('button-participant-account-menu').click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await page.getByRole('alert').getByText('Sign out failed. Please try again.').waitFor();
    await page.getByTestId('button-participant-account-menu').click();
    assert.equal(await page.getByRole('menuitem', { name: 'Sign out', exact: true }).isEnabled(), true, 'A failed sign-out must allow retry.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
