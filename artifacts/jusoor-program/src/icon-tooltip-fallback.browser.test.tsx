import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { installIconTooltipFallback } from './icon-tooltip-fallback';

const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

test('icon-only controls show accessible labels on hover without replacing custom titles', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(`
      <button aria-label="Close dialog"><svg></svg></button>
      <button aria-label="Refresh data" title="Refresh now"><svg></svg></button>
    `);

    await page.evaluate(source => {
      const install = new Function(`const __name = fn => fn; return (${source})`)() as (root: HTMLElement) => () => void;
      install(document.body);
    }, installIconTooltipFallback.toString());

    assert.equal(await page.locator('button').nth(0).getAttribute('title'), 'Close dialog');
    assert.equal(await page.locator('button').nth(1).getAttribute('title'), 'Refresh now');

    await page.evaluate(() => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Remove item');
      button.innerHTML = '<svg></svg>';
      document.body.append(button);
    });
    await page.waitForFunction(() => document.querySelectorAll('button')[2]?.getAttribute('title') === 'Remove item');
  } finally {
    await browser.close();
  }
});
