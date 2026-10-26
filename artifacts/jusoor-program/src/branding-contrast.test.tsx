import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccessiblePanelForeground, getPanelSurfaceColors } from './branding-contrast';

function luminance(hex: string): number {
  const values = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

test('panel foreground stays readable for dark, light, and mid-tone custom colors', () => {
  for (const background of ['#1f3445', '#2d4453', '#f4f7fa', '#767676']) {
    const foreground = getAccessiblePanelForeground(background);
    assert.ok(contrast(background, foreground) >= 4.5, `${foreground} is not readable on ${background}`);
  }
});

test('panel surface colors derive a subtle accent and border from the selected color', () => {
  const colors = getPanelSurfaceColors('#1f3445');
  assert.deepEqual(colors, {
    background: '#1f3445',
    foreground: '#ffffff',
    accent: '#3a4c5b',
    border: '#5e6d79',
  });
});
