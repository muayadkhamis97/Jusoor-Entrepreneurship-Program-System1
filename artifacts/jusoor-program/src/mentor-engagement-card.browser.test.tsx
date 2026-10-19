import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { chromium, type Route } from 'playwright-core';
import { createServer } from 'vite';

test('concurrent engagement requests keep pending, errors, success and retries on their own cards', { timeout: 60_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const priorPort = process.env.PORT;
  const priorBase = process.env.BASE_PATH;
  process.env.PORT = '1';
  process.env.BASE_PATH = '/';
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = new Map<number, Route[]>();
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const match = url.pathname.match(/\/api\/mentor\/support\/(\d+)$/);
      if (!match) return route.continue();
      const id = Number(match[1]);
      requests.set(id, [...(requests.get(id) || []), route]);
      return undefined;
    });
    await page.goto(`${origin}/src/test-fixtures/mentor-engagement-cards.html`);
    const first = page.getByTestId('card-mentor-engagement-1');
    const second = page.getByTestId('card-mentor-engagement-2');
    const button1 = first.getByRole('button', { name: 'Save engagement' });
    const button2 = second.getByRole('button', { name: 'Save engagement' });
    await first.getByLabel('Working notes').fill('First draft');
    await second.getByLabel('Working notes').fill('Second draft');
    await button1.click();
    await first.getByRole('button', { name: 'Saving…' }).waitFor();
    assert.equal(await button2.isEnabled(), true);
    assert.equal(await second.getByLabel('Working notes').isEnabled(), true);
    // Two immediate submit events must not produce duplicate requests on card 1.
    await first.locator('form').evaluate(form => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await button2.click();
    await second.getByRole('button', { name: 'Saving…' }).waitFor();
    await page.waitForTimeout(50);
    assert.equal(requests.get(1)?.length, 1);
    assert.equal(requests.get(2)?.length, 1);
    assert.equal(requests.get(2)![0].request().postDataJSON().notes, 'Second draft');
    const succeed = async (route: Route, id: number) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id, businessId: id, businessName: `Business ${id}`, founderName: `Founder ${id}`,
      programName: 'Sample program', type: 'mentor', provider: 'Mentor', topic: `Engagement ${id}`,
      ...route.request().postDataJSON(),
    }) });
    // Complete out of order: card 2 success cannot clear card 1 pending.
    await succeed(requests.get(2)![0], 2);
    await second.getByRole('status').waitFor();
    assert.equal(await first.getByRole('status').count(), 0);
    assert.equal(await first.getByRole('button', { name: 'Saving…' }).isDisabled(), true);
    await requests.get(1)![0].fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fixture failure"}' });
    await first.getByRole('alert').waitFor();
    assert.equal(await second.getByRole('alert').count(), 0);
    assert.equal(await first.getByLabel('Working notes').inputValue(), 'First draft');
    assert.equal(await second.getByLabel('Working notes').inputValue(), 'Second draft');
    await first.getByLabel('Working notes').fill('First retry');
    assert.equal(await first.getByRole('alert').count(), 0);
    assert.equal(await second.getByRole('status').textContent(), 'Engagement saved.');
    await button1.click();
    await first.getByRole('button', { name: 'Saving…' }).waitFor();
    await page.waitForTimeout(50);
    assert.equal(requests.get(1)?.length, 2);
    assert.equal(requests.get(1)![1].request().postDataJSON().notes, 'First retry');
    await succeed(requests.get(1)![1], 1);
    await first.getByRole('status').waitFor();
    await second.getByLabel('Working notes').fill('Second edit');
    assert.equal(await second.getByRole('status').count(), 0);
    assert.equal(await first.getByRole('status').textContent(), 'Engagement saved.');
  } finally {
    await browser?.close();
    await server.close();
    if (priorPort === undefined) delete process.env.PORT; else process.env.PORT = priorPort;
    if (priorBase === undefined) delete process.env.BASE_PATH; else process.env.BASE_PATH = priorBase;
  }
});
