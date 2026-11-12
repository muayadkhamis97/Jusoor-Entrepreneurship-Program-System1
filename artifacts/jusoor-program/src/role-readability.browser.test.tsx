import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright-core';

const css = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const theme = css('../../program-editorial/src/index.css');
const tokenNames = ['--text-sm', '--text-sm--line-height'];
const tokens = tokenNames.map(name => {
  const value = theme.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];
  assert.ok(value, `Shared theme exports ${name}`);
  return `${name}:${value};`;
}).join('');
const styles = [
  css('./index.css').replaceAll(/@import[^;]+;/g, ''),
  css('./workspace.css'),
  css('./role-workspace.css'),
  css('./language.css'),
  css('./program-controls.css'),
].join('\n');

test('role helpers and labels use readable shared sizes in English and Arabic', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    for (const language of ['en', 'ar']) {
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const hint = language === 'ar'
          ? 'أضف رابط جدول المواعيد ليتمكن رواد الأعمال من الحجز معك.'
          : 'Add your appointment-schedule link so founders can book with you.';
        await page.setContent(`<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}">
          <head><style>${styles}
          :root{${tokens};--type-body-min:14px;--type-caption-min:12px}*{box-sizing:border-box}body{margin:0}
          </style></head><body>
          <div class="brand"><b>ENT system</b><small data-tracking-check="brand">PROGRAM HUB</small></div>
          <div class="intake-hero"><h1 data-tracking-check="heading">كل خطوة تبدأ بفكرة</h1></div>
          <div class="eyebrow" data-tracking-check="eyebrow">PROGRAM OPERATIONS</div>
          <div class="role-workspace"><main class="role-main">
          <div class="role-form-grid">
            <label class="field" data-helper>Schedule link<input class="form-control" value="https://calendar.google.com/" /><small data-helper>${hint}</small></label>
            <fieldset class="field"><legend data-helper>Founders will book through</legend><label class="mentor-booking-choice"><input type="radio" /><span>Google Calendar<small data-helper>${hint}</small></span></label></fieldset>
          </div>
          <p class="mentor-provider" data-helper>${hint}</p><p class="role-inline-note" data-helper>${hint}</p>
          <div class="role-row-copy"><span data-helper>${hint}</span><small data-helper>${hint}</small></div>
          <div class="answer-meta"><div><span data-helper>${hint}</span></div></div>
          <div class="score-submit-row"><span data-helper>${hint}</span></div>
          <div class="role-note"><div><span data-helper>${hint}</span></div></div>
          <span class="role-count" data-meta>3 engagements</span><span class="role-date" data-meta>19 Oct</span>
          <div class="role-user" data-meta>MK <b data-meta>Mentor name</b></div>
          <div class="eyebrow" data-meta>SESSION BOOKING</div>
          </main></div><div class="participant-question"><p data-outside>${hint}</p></div></body></html>`);
        const result = await page.evaluate(() => {
          const [helpers, metadata, inputs, outside] = ['[data-helper]', '[data-meta]', '.form-control', '[data-outside]'].map(selector =>
            [...document.querySelectorAll(selector)].map(element => {
              const style = getComputedStyle(element);
              return { size: parseFloat(style.fontSize), height: parseFloat(style.lineHeight) };
            }));
          return {
            helpers, metadata, input: inputs[0], outside: outside[0],
            scrollWidth: document.documentElement.scrollWidth,
            tracking: [...document.querySelectorAll('[data-tracking-check]')].map(element => ({
              name: (element as HTMLElement).dataset.trackingCheck,
              letterSpacing: getComputedStyle(element).letterSpacing,
            })),
          };
        });
        const context = `${language}, ${width}px`;
        if (language === 'ar') {
          for (const text of result.tracking) {
            assert.ok(
              text.letterSpacing === 'normal' || Number.parseFloat(text.letterSpacing) === 0,
              `Arabic ${text.name} letter spacing is reset: ${context}`,
            );
          }
        } else {
          assert.ok(
            result.tracking.every(text => text.letterSpacing !== 'normal' && Number.parseFloat(text.letterSpacing) !== 0),
            `English display tracking remains active: ${context}`,
          );
        }
        for (const text of result.helpers) {
          assert.ok(text.size >= 14, `Helper at least 14px: ${context}`);
          assert.ok(text.height >= text.size * 1.4, `Comfortable helper leading: ${context}`);
        }
        for (const text of result.metadata) assert.ok(text.size >= 12, `Metadata at least 12px: ${context}`);
        assert.ok(result.input.size >= (width <= 700 ? 16 : 14), `Input size retained: ${context}`);
        assert.ok(result.outside.size >= 12, `Participant copy retains readable text sizing: ${context}`);
        assert.ok(result.scrollWidth <= width + 1, `No document overflow: ${context}`);
      }
    }
  } finally {
    await browser.close();
  }
});
