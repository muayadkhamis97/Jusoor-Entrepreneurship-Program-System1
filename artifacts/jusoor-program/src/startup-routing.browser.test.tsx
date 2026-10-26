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

test('public landing and sign-in avoid downloading the authenticated workspace', { timeout: 120_000 }, async () => {
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

    const page = await browser.newPage();
    const requested = new Set<string>();
    page.on('request', request => requested.add(new URL(request.url()).pathname));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        await route.abort();
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable in route test.' }) });
        return;
      }
      await route.continue();
    });

    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Every founder/i }).waitFor();
    await page.waitForTimeout(500);
    assert.equal([...requested].some(pathname => /\/src\/App\.tsx$/.test(pathname)), false, 'The public landing must not request the authenticated app module.');
    assert.equal([...requested].some(pathname => /\/src\/analytics-surfaces\.tsx$/.test(pathname)), false, 'The public landing must not request the analytics module.');

    await page.goto(`${origin}/sign-in`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Welcome back/i }).waitFor();
    assert.equal([...requested].some(pathname => /\/src\/App\.tsx$/.test(pathname)), false, 'The sign-in page must not request the authenticated app module.');
    assert.equal([...requested].some(pathname => /\/src\/analytics-surfaces\.tsx$/.test(pathname)), false, 'The sign-in page must not request the analytics module.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
