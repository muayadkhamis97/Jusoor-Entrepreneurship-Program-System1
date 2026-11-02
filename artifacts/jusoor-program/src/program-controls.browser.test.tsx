import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { getAccessibleBrandForeground } from './branding-contrast';

const packageRoot = path.resolve(import.meta.dirname, '..');
const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert.ok(channels && channels.length === 3, `Expected an RGB color, received ${color}`);
    const linear = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexToHslToken(hex: string): string {
  const [red, green, blue] = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  const lightness = (maximum + minimum) / 2;
  let saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

async function unusedPort(): Promise<number> {
  const listener = createNetServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local browser-test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

test('workspace, analytics, API and grant controls share the same design tokens', { timeout: 120_000 }, async () => {
  const port = await unusedPort();
  const previousPort = process.env.PORT;
  const previousBasePath = process.env.BASE_PATH;
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === `http://127.0.0.1:${port}` && route.request().method() === 'GET') {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });
    await page.goto(`http://127.0.0.1:${port}/src/test-fixtures/program-controls.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.api-page .api-button-primary').waitFor();
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    await page.evaluate(() => {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
    });

    const arabicDocument = await page.evaluate(() => ({
      language: document.documentElement.lang,
      direction: document.documentElement.dir,
      text: document.querySelector('.workspace .button-primary')?.textContent?.trim(),
      inputDirection: getComputedStyle(document.querySelector('.workspace .form-control')!).direction,
      iconTransform: getComputedStyle(document.querySelector('.icon-directional')!).transform,
    }));
    assert.deepEqual(arabicDocument, {
      language: 'ar',
      direction: 'rtl',
      text: 'حفظ التغييرات وإرسال التحديثات إلى جميع أعضاء البرنامج ومراجعة بيانات المشاركين والأنشطة والتقارير والتحقق من ملخص النتائج قبل المتابعة',
      inputDirection: 'rtl',
      iconTransform: 'matrix(-1, 0, 0, -1, 0, 0)',
    }, 'Arabic staff controls should render in RTL with mirrored directional icons.');

    const primaryButtons = await page.locator(
      '.workspace [data-primary-family="workspace"], .analytics-page .ana-button.primary, .api-page .api-button-primary',
    ).evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {
        minHeight: style.minHeight,
        radius: style.borderRadius,
        fontSize: style.fontSize,
        background: style.backgroundColor,
        color: style.color,
      };
    }));
    assert.equal(primaryButtons.length, 3);
    assert.ok(primaryButtons.every(style => JSON.stringify(style) === JSON.stringify(primaryButtons[0])), 'Primary actions should resolve to identical minimum sizing and theme styles.');

    const compactVariants = await page.locator(
      '.api-button-revoke, .ana-tool, .grant-action-button, .session-admin-actions .button, .recording-ready-email .button, .mentor-follow-up-actions .button, .participant-account-actions .button, .announcement-confirm .button',
    ).evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { height: style.height, fontSize: style.fontSize, radius: style.borderRadius };
    }));
    assert.deepEqual(compactVariants, [
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '36px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '34px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
      { height: '32px', fontSize: '12px', radius: '6px' },
    ], 'Feature-specific compact actions should use the shared sizing scale.');

    const fields = await page.locator(
      '.workspace .form-control, .mentor-follow-up-editor .form-control, .announcement-form .form-control, .analytics-page .ana-field input, .api-page .api-field input, .workspace .grant-status-filter select',
    ).evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {
        height: style.height,
        radius: style.borderRadius,
        fontSize: style.fontSize,
        background: style.backgroundColor,
        color: style.color,
      };
    }));
    assert.equal(fields.length, 6);
    assert.ok(fields.every(style =>
      style.height === fields[0].height &&
      style.radius === fields[0].radius &&
      style.background === fields[0].background &&
      style.color === fields[0].color
    ), `Common form fields and grant filters should resolve to identical size and theme styles. Actual: ${JSON.stringify(fields)}`);
    assert.ok(fields.every(style => Number.parseFloat(style.fontSize) >= 14), 'Shared form controls should retain readable minimum text sizing.');

    await page.keyboard.press('Tab');
    const focusStyle = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.deepEqual(focusStyle, { outlineStyle: 'solid', outlineWidth: '2px' }, 'Keyboard focus should use the shared visible focus ring.');

    const primaryColor = '#713ab8';
    const accentColor = '#e8a33d';
    const primaryForeground = getAccessibleBrandForeground(primaryColor);
    const accentForeground = getAccessibleBrandForeground(accentColor);
    await page.evaluate(({ primaryToken, accentToken, foreground, accentForeground, accentHex }) => {
      document.documentElement.style.setProperty('--primary', primaryToken);
      document.documentElement.style.setProperty('--ring', primaryToken);
      document.documentElement.style.setProperty('--accent', accentToken);
      document.documentElement.style.setProperty('--primary-foreground', foreground);
      document.documentElement.style.setProperty('--accent-foreground', accentForeground);
      document.documentElement.style.setProperty('--app-font-sans', 'Georgia, serif');
      const preview = document.querySelector('.branding-preview') as HTMLElement;
      preview.style.setProperty('--preview-accent', accentHex);
      preview.style.setProperty('--preview-accent-foreground', `hsl(${accentForeground})`);
    }, {
      primaryToken: hexToHslToken(primaryColor),
      accentToken: hexToHslToken(accentColor),
      foreground: primaryForeground,
      accentForeground,
      accentHex: accentColor,
    });
    const customTheme = await page.evaluate(() => {
      const primaryButton = document.querySelector('.workspace .button-primary')!;
      const secondaryButton = document.querySelector('.workspace .button-outline')!;
      const dangerButton = document.querySelector('.workspace .button-danger')!;
      const disabledButton = document.querySelector('.workspace button:disabled')!;
      const previewButton = document.querySelector('.branding-preview button')!;
      const brandingField = document.querySelector('.branding-field input')!;
      const iconButton = document.querySelector('.icon-button')!;
      const field = document.querySelector('.workspace .form-control')!;
      const buttonStyle = getComputedStyle(primaryButton);
      const secondaryStyle = getComputedStyle(secondaryButton);
      const dangerStyle = getComputedStyle(dangerButton);
      const disabledStyle = getComputedStyle(disabledButton);
      const previewStyle = getComputedStyle(previewButton);
      const iconStyle = getComputedStyle(iconButton);
      const fieldStyle = getComputedStyle(field);
      const rootStyle = getComputedStyle(document.documentElement);
      const accentProbe = document.createElement('span');
      accentProbe.style.backgroundColor = 'hsl(var(--accent))';
      document.body.append(accentProbe);
      const accentBackground = getComputedStyle(accentProbe).backgroundColor;
      accentProbe.remove();
      const previewAccentProbe = document.createElement('span');
      previewAccentProbe.style.backgroundColor = 'var(--preview-accent)';
      const preview = document.querySelector('.branding-preview')!;
      preview.append(previewAccentProbe);
      const previewAccentBackground = getComputedStyle(previewAccentProbe).backgroundColor;
      previewAccentProbe.remove();
      return {
        primary: rootStyle.getPropertyValue('--primary').trim(),
        accent: rootStyle.getPropertyValue('--accent').trim(),
        accentBackground,
        previewAccentBackground,
        buttonBackground: buttonStyle.backgroundColor,
        buttonForeground: buttonStyle.color,
        secondaryBackground: secondaryStyle.backgroundColor,
        secondaryForeground: secondaryStyle.color,
        dangerBackground: dangerStyle.backgroundColor,
        dangerForeground: dangerStyle.color,
        disabledBackground: disabledStyle.backgroundColor,
        disabledForeground: disabledStyle.color,
        disabledOpacity: disabledStyle.opacity,
        previewBackground: previewStyle.backgroundColor,
        previewForeground: previewStyle.color,
        brandingFieldBackground: getComputedStyle(brandingField).backgroundColor,
        brandingFieldForeground: getComputedStyle(brandingField).color,
        iconForeground: iconStyle.color,
        cardBackground: getComputedStyle(document.querySelector('.workspace')!).backgroundColor,
        fieldBackground: fieldStyle.backgroundColor,
        fieldForeground: fieldStyle.color,
        buttonFont: buttonStyle.fontFamily,
        fieldFont: fieldStyle.fontFamily,
      };
    });
    assert.equal(customTheme.primary, hexToHslToken(primaryColor), 'The fixture should apply the custom brand primary.');
    assert.equal(customTheme.accent, hexToHslToken(accentColor), 'The fixture should apply the light custom brand accent.');
    assert.equal(customTheme.buttonBackground, customTheme.accentBackground, 'Primary actions should use the Accent color, not Primary.');
    assert.equal(customTheme.previewBackground, customTheme.previewAccentBackground, 'The live branding preview should show Accent on its action button.');
    assert.ok(contrastRatio(customTheme.buttonForeground, customTheme.buttonBackground) >= 4.5, 'Custom accent-button text should meet WCAG AA contrast.');
    assert.ok(contrastRatio(customTheme.secondaryForeground, customTheme.secondaryBackground) >= 4.5, 'Secondary-button text should remain readable with custom branding.');
    assert.ok(contrastRatio(customTheme.dangerForeground, customTheme.dangerBackground) >= 4.5, 'Destructive-button text should remain readable with custom branding.');
    assert.equal(customTheme.disabledOpacity, '1', 'Disabled controls should not fade their text and background together.');
    assert.ok(contrastRatio(customTheme.disabledForeground, customTheme.disabledBackground) >= 4.5, 'Disabled-button labels should remain readable.');
    assert.ok(contrastRatio(customTheme.previewForeground, customTheme.previewBackground) >= 4.5, 'The branding preview should choose a readable label color for a light primary.');
    assert.ok(contrastRatio(customTheme.brandingFieldForeground, customTheme.brandingFieldBackground) >= 4.5, 'Brand-setting field text should remain readable under custom colors.');
    assert.ok(contrastRatio(customTheme.iconForeground, customTheme.cardBackground) >= 4.5, 'Icon-button glyphs should remain readable on the custom-brand card.');
    assert.ok(contrastRatio(customTheme.fieldForeground, customTheme.fieldBackground) >= 4.5, 'Field text should remain readable under custom branding.');
    assert.match(customTheme.buttonFont, /Georgia/);
    assert.match(customTheme.fieldFont, /Georgia/);

    await page.locator('.workspace [data-primary-family="workspace"]').hover();
    const customHover = await page.locator('.workspace [data-primary-family="workspace"]').evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color };
    });
    assert.ok(contrastRatio(customHover.foreground, customHover.background) >= 4.5, `The branded primary action should retain readable text on hover. ${JSON.stringify(customHover)}; contrast ${contrastRatio(customHover.foreground, customHover.background)}`);

    await page.locator('.workspace [data-primary-family="workspace"]').focus();
    await page.keyboard.press('Tab');
    const customFocus = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      const parentBackground = getComputedStyle(document.querySelector('.workspace')!).backgroundColor;
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, parentBackground };
    });
    assert.equal(customFocus.outlineStyle, 'solid');
    assert.equal(customFocus.outlineWidth, '2px');
    assert.ok(contrastRatio(customFocus.outlineColor, customFocus.parentBackground) >= 3, 'The custom-brand keyboard focus ring should remain distinguishable from its surface.');

    const brandingInput = page.locator('.branding-field input');
    await brandingInput.focus();
    const brandingFocus = await brandingInput.evaluate(element => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor };
    });
    assert.deepEqual({ outlineStyle: brandingFocus.outlineStyle, outlineWidth: brandingFocus.outlineWidth }, { outlineStyle: 'solid', outlineWidth: '2px' });
    assert.ok(contrastRatio(brandingFocus.outlineColor, 'rgb(252, 250, 245)') >= 3, 'Brand-setting inputs should keep visible keyboard focus with a pale custom primary.');

    const desktopButton = await page.locator('.workspace [data-primary-family="workspace"]').evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      height: element.getBoundingClientRect().height,
    }));
    assert.ok(desktopButton.scrollWidth <= desktopButton.clientWidth, 'Long Arabic button labels should wrap instead of clipping at desktop width.');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      columns: getComputedStyle(document.querySelector('.controls-fixture')!).gridTemplateColumns,
      rtl: getComputedStyle(document.querySelector('.controls-fixture')!).direction,
      longButton: (() => {
        const button = document.querySelector('.workspace [data-primary-family="workspace"]') as HTMLButtonElement;
        return { scrollWidth: button.scrollWidth, clientWidth: button.clientWidth, height: button.getBoundingClientRect().height };
      })(),
    }));
    assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'Shared controls should not force horizontal overflow at mobile width.');
    assert.equal(mobileLayout.columns.split(' ').length, 1, 'Feature control groups should stack on narrow screens.');
    assert.equal(mobileLayout.rtl, 'rtl', 'The responsive Arabic fixture should retain RTL direction.');
    assert.ok(mobileLayout.longButton.scrollWidth <= mobileLayout.longButton.clientWidth, 'Long Arabic button labels should wrap instead of clipping on mobile.');
    assert.ok(mobileLayout.longButton.height > 38, 'Long button labels should expand the control height to fit wrapped lines.');
  } finally {
    await browser?.close();
    await vite?.close();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previousBasePath;
  }
});
