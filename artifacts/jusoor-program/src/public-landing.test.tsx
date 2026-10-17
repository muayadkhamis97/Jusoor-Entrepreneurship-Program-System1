import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getThemeStyle } from '@workspace/program-editorial/lib/theme';
import { tokens } from '@workspace/program-editorial/tokens';
import { getDisplayBrandName, hasArabicTranslation } from './language';

const source = readFileSync(new URL('./public-landing.tsx', import.meta.url), 'utf8');
const readUiFile = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

test('landing retains the existing application and account entry routes', () => {
  assert.match(source, /navigate\('\/apply'\)/);
  assert.match(source, /href="\/participant"/);
  assert.match(source, /href="\/sign-in"/);
  assert.doesNotMatch(source, /openSignIn|ClerkProvider|fetch\(/);
});

test('landing uses configured branding with a neutral fallback and package primitives', () => {
  assert.match(source, /getDisplayBrandName\(brandName\)/);
  assert.match(source, /logoUrl \? <img src=\{logoUrl\}/);
  assert.equal(getDisplayBrandName(null), 'Program Hub');
  assert.equal(getDisplayBrandName('Legacy program name'), 'Legacy program name');
  assert.equal(getDisplayBrandName('Jusoor'), 'Program Hub');
  assert.equal(getDisplayBrandName('جسور'), 'Program Hub');
  for (const family of ['button', 'typography', 'paper-surface']) {
    assert.ok(source.includes(`@workspace/program-editorial/components/ui/${family}`));
  }
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
  assert.match(light['--editorial-font-serif'], /Fraunces/);
  assert.match(light['--app-font-sans'], /Noto Sans Arabic/);
  assert.equal(light['--primary'], '195.7895 51.3514% 29.0196%');
  assert.equal(Object.keys(light).filter(key => key.startsWith('--')).length, 36);
  assert.notEqual(light['--background'], dark['--background']);
  assert.match(light['--chart-1'], /^\d/);
  assert.equal(getThemeStyle()['--radius' as keyof ReturnType<typeof getThemeStyle>], tokens.radius);
});
