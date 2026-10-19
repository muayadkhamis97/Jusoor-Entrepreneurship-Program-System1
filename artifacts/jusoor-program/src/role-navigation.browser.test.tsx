import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright-core';

// Layout-only fixture: actual styles, representative header actions, no auth or providers.
// Protected React/authenticated phone checks are recorded separately in
// docs/QA_ROLE_NAVIGATION_RESPONSIVE.md; this fixture is not evidence for them.
const styles = ['workspace.css', 'program-controls.css', 'role-workspace.css', 'language.css']
  .map(file => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')).join('\n');

test('role actions stay visible and keyboard reachable at narrow widths in LTR and RTL', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    for (const direction of ['ltr', 'rtl']) {
      const labels = direction === 'rtl'
        ? ['الجلسات المباشرة', 'التعلم بالدورات', 'افتح مساحة عمل المرشد', 'افتح مساحة عمل المحكم', 'مساحة عمل المسؤول', 'الملف الشخصي', 'English', 'تسجيل الخروج']
        : ['Live sessions', 'Course learning', 'Open mentor workspace', 'Open judge workspace', 'Admin workspace', 'Profile', 'العربية', 'Sign out'];
      for (const width of [320, 390, 700, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(`<!doctype html><html lang="${direction === 'rtl' ? 'ar' : 'en'}" dir="${direction}">
          <head><style>
          :root{--spacing:.25rem;--background:39 34% 96%;--card:0 0% 100%;--foreground:200 30% 18%;--primary:170 40% 28%;--border:37 22% 86%;--muted-foreground:200 10% 35%;--ring:170 40% 28%;--app-font-sans:Arial,sans-serif;--app-font-mono:monospace}
          *{box-sizing:border-box}body{margin:0} ${styles}
          </style></head><body><div class="role-workspace">
          <header class="role-topbar"><a class="brand" href="#home"><span class="brand-mark">P</span><span><b>${'A very long configured program brand '.repeat(4)}</b><small>PROGRAM HUB</small></span></a>
          <div class="role-top-actions">
          ${labels.slice(0, 6).map((label, index) => `<a href="#action-${index}" class="button button-quiet">${label}</a>`).join('')}
          <span class="role-chip">trainer</span><span class="role-user">MK <b>${'Long Account Name '.repeat(5)}</b></span>
          <button class="button button-quiet">${labels[6]}</button><button class="button button-quiet">${labels[7]}</button>
          </div></header><main class="role-main">Workspace content</main></div></body></html>`);
        const context = `${direction}, ${width}px`;
        const metrics = await page.evaluate(() => {
          const header = document.querySelector('.role-topbar')!.getBoundingClientRect();
          const actions = [...document.querySelectorAll('.role-top-actions a, .role-top-actions button')].map(element => {
            const bounds = element.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
          });
          return { header: { bottom: header.bottom }, actions, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
        });
        assert.ok(metrics.scrollWidth <= width + 1, `No page overflow: ${context}`);
        assert.equal(metrics.actions.length, 8);
        for (const bounds of metrics.actions) {
          assert.ok(bounds.left >= -1 && bounds.right <= metrics.viewport + 1, `Action within viewport: ${context}`);
          assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.bottom <= metrics.header.bottom + 1, `Action remains in header: ${context}`);
        }
        for (let index = 0; index < metrics.actions.length; index++) {
          const first = metrics.actions[index];
          for (const second of metrics.actions.slice(index + 1)) {
            const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
            const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
            assert.ok(overlapX <= 1 || overlapY <= 1, `Actions do not overlap: ${context}`);
          }
        }
        await page.locator('.brand').focus();
        for (let index = 0; index < labels.length; index++) {
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement?.textContent), labels[index], `Tab reaches action ${index}: ${context}`);
        }
        const contentTop = await page.locator('main').evaluate(element => element.getBoundingClientRect().top);
        assert.ok(contentTop >= metrics.header.bottom - 1, `Header does not overlap content: ${context}`);
      }
    }
  } finally {
    await browser.close();
  }
});
