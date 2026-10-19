import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

test('cancelled same-document Back restores Settings without losing its booking draft', { timeout: 60_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const priorPort = process.env.PORT;
  const priorBasePath = process.env.BASE_PATH;
  process.env.PORT = '1'; // Config validation only; the test server uses an OS-assigned port.
  process.env.BASE_PATH = '/';
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const editor = `${origin}/src/test-fixtures/mentor-booking-draft.html`;
    await page.goto(editor);
    await page.getByRole('link', { name: 'Workspace', exact: true }).click();
    await page.getByRole('link', { name: 'Return to Settings' }).click();
    await page.getByLabel('Schedule URL').fill('https://calendar.app.google/ProtectedDraft');

    const cancelled = page.waitForEvent('dialog');
    const cancelNavigation = page.evaluate(() => history.back());
    const prompt = await cancelled;
    assert.equal(prompt.type(), 'confirm', 'SPA Back uses the discard confirmation, not beforeunload');
    await prompt.dismiss();
    await cancelNavigation;
    await page.waitForURL(editor);
    assert.equal(await page.getByLabel('Schedule URL').inputValue(), 'https://calendar.app.google/ProtectedDraft');
    assert.equal(await page.getByRole('status').textContent(), 'Unsaved changes');

    const accepted = page.waitForEvent('dialog');
    const acceptNavigation = page.evaluate(() => history.back());
    await (await accepted).accept();
    await acceptNavigation;
    await page.getByRole('heading', { name: 'Other page' }).waitFor();
    await page.goForward();
    await page.getByLabel('Schedule URL').waitFor();
    assert.equal(await page.getByRole('status').textContent(), 'No unsaved changes');
    assert.equal(await page.getByLabel('Schedule URL').inputValue(), 'https://calendar.app.google/InitialSchedule');
  } finally {
    await browser?.close();
    await server.close();
    if (priorPort === undefined) delete process.env.PORT; else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH; else process.env.BASE_PATH = priorBasePath;
  }
});
