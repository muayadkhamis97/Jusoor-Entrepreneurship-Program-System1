import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { tokens } from '@workspace/program-editorial/tokens';

const indexCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const sharedThemeCss = readFileSync(new URL('../../program-editorial/src/index.css', import.meta.url), 'utf8');
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
  assert.deepEqual(tokens.fontFamily.serif, tokens.fontFamily.sans);
  assert.doesNotMatch(indexHtml, /Fraunces/);
  assert.match(indexHtml, /Noto\+Sans\+Arabic/);
  assert.match(languageCss, /lang="ar"/);
  assert.match(languageCss, /html\[dir="rtl"\]\s+\.analytics-page \.ana-table\s*\{\s*direction:\s*rtl/);
  assert.match(roleAccessCss, /padding-inline-start/);
  assert.match(roleAccessCss, /text-align:start/);
  assert.match(languageCss, /lucide-arrow-up-right\s*\{\s*transform:\s*scaleX\(-1\)/);
});

test('small fixed UI text and placeholders use readable contrast and minimum sizing', () => {
  assert.equal(tokens.fontSize.captionMinimum, '0.75rem');
  assert.equal(tokens.fontSize.bodyMinimum, '0.875rem');
  assert.match(sharedThemeCss, /--text-body:\s*var\(--type-body-min\)/);
  assert.match(sharedThemeCss, /--text-caption:\s*var\(--type-caption-min\)/);
  assert.match(sharedThemeCss, /--text-xs:\s*var\(--type-caption-min\)/);
  assert.match(sharedThemeCss, /--text-sm:\s*var\(--type-body-min\)/);
  assert.doesNotMatch(indexCss, /--ui-readable-min|font-size:\s*max\(12px,\s*1em\)|font-size:\s*max\(var\(--ui-readable-min\)/);
  assert.match(indexCss, /::placeholder\s*\{\s*color:\s*hsl\(var\(--muted-foreground\)\);\s*opacity:\s*1/);
  assert.match(indexCss, /\.participant-entry-links a\s*\{[^}]*font-size:\s*var\(--type-body-min\)/);
  assert.match(indexCss, /\.participant-entry-links a\.participant-session-join\s*\{[^}]*color:\s*hsl\(var\(--accent-foreground\)\)/);
  assert.match(analyticsCss, /\.ana-panel-foot\s*\{[^}]*font-size:\s*var\(--type-body-min\)/);
});

test('participants get a prominent Join session button only when a scheduled meeting link exists', () => {
  assert.match(
    intakeSurfaces,
    /session\.zoomUrl && session\.status === 'scheduled' && <EditorialButton asChild variant="primary" size="md" className="participant-session-join min-h-11">/,
  );
  assert.match(
    intakeSurfaces,
    /<a href=\{session\.zoomUrl\} target="_blank" rel="noopener noreferrer"><Video size=\{16\} aria-hidden="true" \/> \{t\('Join session'\)\}<\/a>/,
  );
});

test('Admin overview links directly to the admin-only applications queue', () => {
  assert.match(
    appSource,
    /const headingAction = coordinator \? \([\s\S]*?<Button asChild variant="primary"><Link href="\/applications">[\s\S]*?t\('Review applications'\)/,
  );
  assert.match(appSource, /<Route path="\/applications" component=\{isAdmin \? ApplicationsReviewPage : NotFoundPage\} \/>/);
});

test('dashboard pipeline and session shortcuts use compact secondary link buttons', () => {
  assert.match(
    appSource,
    /<Button asChild variant="secondary" size="sm"><Link href="\/businesses">\{t\('Open pipeline'\)\} <ArrowRight size=\{14\} aria-hidden="true" \/><\/Link><\/Button>/,
  );
  assert.match(
    appSource,
    /<Button asChild variant="secondary" size="sm"><Link href="\/sessions">\{t\('All sessions'\)\} <ArrowRight size=\{14\} aria-hidden="true" \/><\/Link><\/Button>/,
  );
});

test('shared loading and error states announce updates to screen readers', () => {
  assert.match(appSource, /function LoadingState[^]*?className="loading-panel" role="status" aria-busy="true" aria-label=\{t\(label\)\}/);
  assert.match(appSource, /function ErrorState[^]*?className="empty-panel error-panel" role="alert"/);
});

test('session date labels select an Arabic locale when Arabic is active', () => {
  assert.match(appSource, /toLocaleDateString\(currentLanguage\(\) === 'ar' \? 'ar-JO' : 'en'/);
});

test('dense assignment tables expose a keyboard-focusable labelled scroll region', () => {
  for (const source of [teamAssignments, roleAccess]) {
    assert.match(source, /role="region"\s+tabIndex=\{0\}\s+aria-label=\{t\('Scrollable results table'\)\}/);
  }
});

test('permission columns can wrap instead of forcing an oversized RTL matrix', () => {
  assert.match(roleAccessCss, /\.access-table\{[^}]*table-layout:fixed/);
  assert.match(roleAccessCss, /\.matrix-area\{[^}]*min-width:0/);
  assert.match(roleAccessCss, /\.access-mark\{[^}]*white-space:normal/);
});

test('integration headings do not render HTML line-break strings as visible text', () => {
  const source = readFileSync(new URL('./api-integrations.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /copy\(['"][^'"]*<br\s*\/?>/);
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
