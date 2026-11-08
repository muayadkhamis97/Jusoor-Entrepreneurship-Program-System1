import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getIconTooltipPosition } from './icon-tooltip-position';

const viewport = { width: 1024, height: 768 };
const tooltip = { width: 180, height: 40 };

test('icon descriptions are centered above controls with room', () => {
  assert.deepEqual(getIconTooltipPosition(
    { left: 400, right: 432, top: 200, bottom: 232, width: 32 }, tooltip, viewport,
  ), { left: 326, top: 152 });
});

test('tooltips remain reachable at either horizontal viewport edge', () => {
  assert.equal(getIconTooltipPosition(
    { left: 0, right: 32, top: 100, bottom: 132, width: 32 }, tooltip, viewport,
  ).left, 8);
  assert.equal(getIconTooltipPosition(
    { left: 992, right: 1024, top: 100, bottom: 132, width: 32 }, tooltip, viewport,
  ).left, 836);
});

test('descriptions below top-edge controls do not leave the viewport', () => {
  const position = getIconTooltipPosition(
    { left: 100, right: 132, top: 4, bottom: 36, width: 32 }, tooltip, viewport,
  );
  assert.equal(position.top, 44);
  assert.ok(position.top + tooltip.height <= viewport.height);
});

test('small screens clamp the tooltip inside the visible height', () => {
  assert.deepEqual(getIconTooltipPosition(
    { left: 8, right: 40, top: 4, bottom: 36, width: 32 },
    { width: 180, height: 90 }, { width: 220, height: 110 },
  ), { left: 8, top: 12 });
});

test('fallback descriptions support focus, dismissal, translations and cleanup', () => {
  const source = readFileSync(new URL('./icon-tooltip-fallback.ts', import.meta.url), 'utf8');
  assert.match(source, /setAttribute\('role', 'tooltip'\)/);
  assert.match(source, /addEventListener\('focusin', focusIn\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /setAttribute\('aria-describedby'/);
  assert.match(source, /tooltip\.textContent = labelFor/);
  assert.match(source, /removeEventListener\('focusin', focusIn\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /tooltip\.remove\(\)/);
});
