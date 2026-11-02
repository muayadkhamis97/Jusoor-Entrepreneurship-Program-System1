import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getThemeStyle } from '@workspace/program-editorial/lib/theme';
import { tokens } from '@workspace/program-editorial/tokens';
import { getDisplayBrandName, hasArabicTranslation, loadArabicTranslations } from './language';
import { getAccessibleBrandForeground, getBrandingThemeTokens } from './branding-contrast';

await loadArabicTranslations();

const source = readFileSync(new URL('./public-landing.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./public-landing.css', import.meta.url), 'utf8');
const readUiFile = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
const hexToHslChannels = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta) {
    hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return `${hue.toFixed(4)} ${(saturation * 100).toFixed(4)}% ${(lightness * 100).toFixed(4)}%`;
};

test('landing retains the existing application and account entry routes', () => {
  assert.match(source, /navigate\('\/apply'\)/);
  assert.match(source, /href="\/participant"/);
  assert.match(source, /href="\/sign-in"/);
  assert.doesNotMatch(source, /openSignIn|ClerkProvider|fetch\(/);
});

test('landing prioritizes the entry actions and keeps its stage list responsive', () => {
  assert.match(source, /className="editorial-hero"/);
  assert.match(source, /PaperSurface variant="panel" className="editorial-entry"/);
  assert.match(source, /className="editorial-route editorial-route-apply"/);
  assert.match(source, /className="editorial-route editorial-route-return"/);
  assert.match(source, /className="editorial-stages"/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.1fr\) minmax\(320px, 0\.9fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.editorial-hero\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.editorial-stages\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test('landing uses configured branding with a neutral fallback and package primitives', () => {
  assert.match(source, /getDisplayBrandName\(brandName\)/);
  assert.match(source, /logoUrl \? \(/);
  assert.match(source, /<img src=\{logoUrl\}/);
  assert.equal(getDisplayBrandName(null), 'Program Hub');
  assert.equal(getDisplayBrandName('Legacy program name'), 'Legacy program name');
  assert.equal(getDisplayBrandName('Jusoor'), 'Program Hub');
  assert.equal(getDisplayBrandName('جسور'), 'Program Hub');
  for (const family of ['button', 'typography', 'paper-surface']) {
    assert.ok(source.includes(`@workspace/program-editorial/components/ui/${family}`));
  }
});

test('landing applies saved primary and accent colors with readable action text', () => {
  const primaryColor = '#28665a';
  const accentColor = '#d98a46';
  const theme = getBrandingThemeTokens(primaryColor, accentColor);
  assert.match(source, /getBrandingThemeTokens\(primaryColor, accentColor\)/);
  assert.match(source, /accentColor\?: string \| null/);
  assert.equal(theme['--accent-foreground'], getAccessibleBrandForeground(accentColor));
  assert.ok(theme['--accent']);
  assert.ok(theme['--primary']);
});

test('core user-facing screens and service errors contain no fixed retired identity', () => {
  const files = [
    'App.tsx', 'public-landing.tsx', 'role-surfaces.tsx', 'intake-surfaces.tsx',
    'profile-surfaces.tsx', 'clerk-auth-page.tsx', 'role-access.tsx',
    'course-surfaces.tsx', 'branding-surfaces.tsx', 'learning-progress.tsx',
    'certificate-pdf.tsx', 'analytics-surfaces.tsx', 'api-integrations.tsx',
    'participant-dashboard-helpers.ts',
  ];
  for (const file of files) {
    assert.doesNotMatch(readUiFile(file), /jusoor|جسور/i, `Fixed brand text remains in ${file}`);
  }
});

test('user-facing server response copy uses neutral product labels', () => {
  const checks = [
    ['../../api-server/src/routes/googleCalendarOAuth.ts', 'Return to the program and try again.'],
    ['../../api-server/src/routes/calendlyOAuth.ts', 'Return to the program and try again.'],
    ['../../api-server/src/routes/zoom.ts', 'Return to the program and try again.'],
    ['../../api-server/src/routes/integrationApiKeys.ts', 'A valid integration API key is required.'],
    ['../../api-server/src/routes/externalIntegrationApi.ts', 'must be managed in the platform.'],
    ['../../api-server/src/middlewares/staffAccess.ts', 'not approved for staff access.'],
    ['../../api-server/src/routes/xapi.ts', 'Basic realm="Learning Record Store"'],
  ];
  for (const [file, expectedCopy] of checks) {
    assert.ok(readUiFile(file).includes(expectedCopy), `Missing neutral response copy in ${file}`);
  }
});

test('every literal landing translation key has Arabic coverage', () => {
  for (const match of source.matchAll(/\bt\('([^']+)'\)/g)) {
    assert.ok(hasArabicTranslation(match[1]), `Missing Arabic: ${match[1]}`);
  }
  assert.match(source, /dir=\{language === 'ar' \? 'rtl' : 'ltr'\}/);
});

test('scoped theme derives color, radius and fonts from the shared tokens without changing the document', () => {
  const light = getThemeStyle() as Record<string, string>;
  const dark = getThemeStyle('dark') as Record<string, string>;
  assert.equal(light['--radius'], tokens.radius);
  assert.match(light['--editorial-font-serif'], /DM Sans/);
  assert.match(light['--editorial-font-serif'], /sans-serif/);
  assert.doesNotMatch(light['--editorial-font-serif'], /Fraunces|Georgia/);
  assert.match(light['--app-font-sans'], /Noto Sans Arabic/);
  assert.equal(tokens.color.light.background, '#F8F7FA');
  assert.equal(tokens.color.light.primary, '#3f6f8f');
  assert.equal(light['--primary'], hexToHslChannels(tokens.color.light.primary));
  assert.equal(Object.keys(light).filter(key => key.startsWith('--')).length, 36);
  assert.notEqual(light['--background'], dark['--background']);
  assert.match(light['--chart-1'], /^\d/);
  assert.equal(getThemeStyle()['--radius' as keyof ReturnType<typeof getThemeStyle>], tokens.radius);
});
