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

test('dialogs preserve focus and form state; mobile staff navigation labels its routes', { timeout: 120_000 }, async () => {
  const port = await unusedPort();
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
    await page.goto(`http://127.0.0.1:${port}/src/test-fixtures/dialog-accessibility.html`, { waitUntil: 'domcontentloaded' });

    const reviewOpener = page.getByRole('button', { name: 'Open application review' });
    await reviewOpener.click();
    const applicationReview = page.getByRole('dialog', { name: 'Application review' });
    await applicationReview.waitFor();
    assert.equal(await applicationReview.getAttribute('aria-modal'), 'true');
    assert.equal(await applicationReview.getAttribute('aria-describedby'), 'fixture-review-description');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-review-title', 'Application review should focus its heading.');
    await page.keyboard.press('Escape');
    await applicationReview.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-application-review');

    const openForm = page.getByRole('button', { name: 'Open sample form' });
    await openForm.click();
    const formDialog = page.getByRole('dialog', { name: 'Edit sample record' });
    await formDialog.waitFor();
    assert.equal(await formDialog.getAttribute('aria-modal'), 'true');
    assert.equal(await formDialog.getAttribute('aria-labelledby'), 'fixture-form-title');
    assert.equal(await formDialog.getAttribute('aria-describedby'), 'fixture-form-description');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-form-input', 'Opening a form should focus its first field.');
    const formBounds = await formDialog.boundingBox();
    assert.ok(formBounds && formBounds.x >= 0 && formBounds.y >= 0 && formBounds.x + formBounds.width <= 390 && formBounds.y + formBounds.height <= 844, 'Dialog should fit the mobile viewport.');

    const field = page.getByLabel('Record name');
    await field.fill('Synthetic value stays here');
    await page.getByRole('button', { name: 'Save record' }).click();
    await page.getByRole('alert').getByText('The record could not be saved. Try again.').waitFor();
    assert.equal(await field.inputValue(), 'Synthetic value stays here', 'A failed save must not clear form input.');
    assert.equal(await formDialog.count(), 1, 'A validation/server error should leave the dialog open.');

    await page.getByRole('button', { name: 'Save record' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close sample form', 'Tab from the last dialog action should wrap to the first.');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Save record', 'Shift+Tab from the first control should wrap to the last.');

    await field.focus();
    await page.keyboard.press('Escape');
    await formDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-sample-form');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-sample-form', 'Closing with Escape should restore focus to the opener.');

    await openForm.click();
    const reopenedForm = page.getByRole('dialog', { name: 'Edit sample record' });
    await reopenedForm.waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await reopenedForm.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-sample-form');

    const openConfirm = page.getByRole('button', { name: 'Open confirmation' });
    await openConfirm.click();
    const confirmDialog = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await confirmDialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'fixture-confirm-cancel', 'Confirmation should initially focus its safe cancel action.');
    await page.keyboard.press('Escape');
    await confirmDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'open-confirmation');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-confirmation', 'Closing a confirmation should restore focus to its opener.');

    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    assert.equal(await navigation.getByRole('link', { name: 'Sessions' }).getAttribute('aria-current'), 'page');
    assert.match(await navigation.getByRole('link', { name: 'Sessions' }).getAttribute('class') || '', /mobile-active/);
    assert.ok(await navigation.getByRole('link', { name: 'Programs' }).isVisible(), 'Mobile navigation items should have visible text labels.');
    assert.ok(await navigation.getByRole('button', { name: 'Sign out' }).isVisible(), 'The sign-out action should keep a visible text label.');
    const scrolling = await navigation.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));
    assert.equal(scrolling.overflowX, 'auto');
    assert.ok(scrolling.scrollWidth > scrolling.clientWidth, 'All labeled destinations should remain available in the scrollable navigation.');

    const languageToggle = page.getByTestId('button-language-toggle').first();
    assert.equal(await page.getByTestId('localized-copy').textContent(), 'Choose your cohort');
    await languageToggle.click();
    await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
    assert.equal(await page.getByTestId('language-state').textContent(), 'ar');
    assert.equal(await page.getByTestId('localized-copy').textContent(), 'اختر المجموعة');
    await languageToggle.click();
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (priorPort === undefined) delete process.env.PORT;
    else process.env.PORT = priorPort;
    if (priorBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = priorBasePath;
  }
});
