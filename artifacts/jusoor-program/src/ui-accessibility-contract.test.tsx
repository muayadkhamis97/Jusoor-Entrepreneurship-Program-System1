import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { tokens } from '@workspace/program-editorial/tokens';

const indexCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const languageCss = readFileSync(new URL('./language.css', import.meta.url), 'utf8');
const analyticsCss = readFileSync(new URL('./analytics.css', import.meta.url), 'utf8');
const roleAccessCss = readFileSync(new URL('./role-access.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const teamAssignments = readFileSync(new URL('./team-assignments.tsx', import.meta.url), 'utf8');
const roleAccess = readFileSync(new URL('./role-access.tsx', import.meta.url), 'utf8');
const intakeSurfaces = readFileSync(new URL('./intake-surfaces.tsx', import.meta.url), 'utf8');
const sessionInteractions = readFileSync(new URL('./session-interactions.tsx', import.meta.url), 'utf8');

function hexToRgb(hex: string): [number, number, number] {
  const channels = hex.replace('#', '').match(/.{2}/g);
  assert.ok(channels, `Expected a hex color, received ${hex}`);
  return channels.map(channel => parseInt(channel, 16) / 255) as [number, number, number];
}

function luminance(rgb: [number, number, number]): number {
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('default muted text meets 4.5:1 contrast on background and card', () => {
  const foreground = hexToRgb(tokens.color.light.mutedForeground);
  assert.ok(contrast(foreground, hexToRgb(tokens.color.light.background)) >= 4.5);
  assert.ok(contrast(foreground, hexToRgb(tokens.color.light.card)) >= 4.5);
});

test('functional controls retain mobile text sizing and reduced-motion support', () => {
  assert.match(indexCss, /@media\s*\(max-width:\s*760px\)/);
  assert.match(indexCss, /font-size:\s*16px/);
  assert.match(indexCss, /prefers-reduced-motion:\s*reduce/);
});

test('Arabic font and direction support remain explicit in the style contract', () => {
  assert.ok(tokens.fontFamily.sans.includes('Noto Sans Arabic'));
  assert.match(indexHtml, /Noto\+Sans\+Arabic/);
  assert.match(languageCss, /lang="ar"/);
  assert.match(languageCss, /html\[dir="rtl"\]\s+\.analytics-page \.ana-table\s*\{\s*direction:\s*rtl/);
  assert.match(roleAccessCss, /padding-inline-start/);
  assert.match(roleAccessCss, /text-align:start/);
  assert.match(languageCss, /lucide-arrow-up-right\s*\{\s*transform:\s*scaleX\(-1\)/);
});

test('small fixed UI text and placeholders use readable contrast and minimum sizing', () => {
  assert.match(indexCss, /--ui-readable-min:\s*0\.75rem/);
  assert.match(indexCss, /font-size:\s*max\(var\(--ui-readable-min\),\s*0\.9em\)/);
  assert.match(indexCss, /::placeholder\s*\{\s*color:\s*hsl\(var\(--muted-foreground\)\);\s*opacity:\s*1/);
  assert.match(indexCss, /\.participant-wrap :is\([^]*\.participant-entry-links a/);
  assert.match(indexCss, /\.analytics-page :is\([^]*\.ana-panel-foot/);
});

test('session date labels select an Arabic locale when Arabic is active', () => {
  assert.match(appSource, /toLocaleDateString\(currentLanguage\(\) === 'ar' \? 'ar-JO' : 'en'/);
});

test('dense assignment tables expose a keyboard-focusable labelled scroll region', () => {
  for (const source of [teamAssignments, roleAccess]) {
    assert.match(source, /role="region"\s+tabIndex=\{0\}\s+aria-label=\{t\('Scrollable results table'\)\}/);
  }
});

test('participant business-team failures have an alert and a retry action', () => {
  assert.match(intakeSurfaces, /participant-team-error[^]*role="alert"/);
  assert.match(intakeSurfaces, /button-retry-business-team/);
  assert.match(intakeSurfaces, /query\.refetch\(\)/);
});

test('short-answer and participant-question fields have persistent associated labels', () => {
  assert.match(sessionInteractions, /className="si-input-label" htmlFor=\{answerId\}/);
  assert.match(sessionInteractions, /id=\{answerId\}/);
  assert.match(sessionInteractions, /data-testid=\{`input-short-answer-/);
  assert.match(sessionInteractions, /htmlFor=\{`session-question-\$\{sessionId\}`\}/);
  assert.match(sessionInteractions, /id=\{`session-question-\$\{sessionId\}`\}/);
});
