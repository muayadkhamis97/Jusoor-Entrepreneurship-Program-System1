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

test('Admin and participant workspaces render Arabic copy and RTL in an isolated browser', { timeout: 120_000 }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const blockedExternalRequests: string[] = [];
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') {
        if (url.origin !== origin) blockedExternalRequests.push(request.url());
        await route.abort();
        return;
      }
      if (url.pathname.includes('/api/')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      await route.continue();
    });
    await page.goto(`${origin}/src/test-fixtures/arabic-role-workspaces.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="page-role-access"]').waitFor();
    await page.getByTestId('button-language-toggle').click();

    assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('html').evaluate(element => getComputedStyle(element).direction), 'rtl');
    await page.getByRole('heading', { name: 'أدوار واضحة، وهدف مشترك.' }).waitFor();
    await page.getByRole('heading', { name: 'من يستطيع القيام بماذا' }).waitFor();
    await page.getByRole('heading', { name: 'التواصل' }).waitFor();

    for (const [role, expectedHeadline] of [
      ['coordinator', 'نظرة سريعة على عمليات البرنامج'],
      ['staff', 'نظرة عامة على تنفيذ البرنامج'],
      ['participant', 'رحلتك الريادية'],
      ['trainer', 'مهام المجموعة المسندة'],
      ['mentor', 'جلسات الدعم المسندة'],
      ['judge', 'المشاريع المسندة للتقييم'],
    ] as const) {
      await page.getByTestId(`button-preview-${role}`).click();
      await page.getByRole('heading', { name: expectedHeadline }).waitFor();
    }

    await page.getByText('Founder-provided English subject', { exact: true }).waitFor();
    await page.getByText('Founder-provided English message', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'تحديد كمقروء' }).waitFor();
    assert.ok(blockedExternalRequests.length > 0, 'The fixture should intercept external font or asset requests.');
    assert.ok(blockedExternalRequests.every(url => new URL(url).origin !== origin), 'Every external request should be intercepted and blocked.');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
