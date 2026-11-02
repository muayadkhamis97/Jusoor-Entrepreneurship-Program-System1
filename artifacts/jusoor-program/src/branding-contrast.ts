const BRAND_DARK_FOREGROUND = '203 28% 19%';
const BRAND_LIGHT_FOREGROUND = '0 0% 100%';
const PANEL_DARK_FOREGROUND = '#000000';
const PANEL_LIGHT_FOREGROUND = '#ffffff';

export function hexToHslToken(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
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
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastAgainst(foregroundLuminance: number, backgroundLuminance: number): number {
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

export function getAccessibleBrandForeground(hex: string): string {
  const brandLuminance = relativeLuminance(hex);
  // This HSL token is the app's shared dark text color (approximately #23313e).
  const darkForegroundLuminance = relativeLuminance('#23313e');
  const darkContrast = contrastAgainst(darkForegroundLuminance, brandLuminance);
  const lightContrast = contrastAgainst(1, brandLuminance);
  return darkContrast >= lightContrast ? BRAND_DARK_FOREGROUND : BRAND_LIGHT_FOREGROUND;
}

export function getBrandingThemeTokens(primaryColor?: string | null, accentColor?: string | null) {
  const tokens: Partial<Record<'--primary' | '--primary-foreground' | '--accent' | '--accent-foreground', string>> = {};
  if (primaryColor) {
    tokens['--primary'] = hexToHslToken(primaryColor);
    tokens['--primary-foreground'] = getAccessibleBrandForeground(primaryColor);
  }
  if (accentColor) {
    tokens['--accent'] = hexToHslToken(accentColor);
    tokens['--accent-foreground'] = getAccessibleBrandForeground(accentColor);
  }
  return tokens;
}

export function getAccessiblePanelForeground(hex: string): string {
  const backgroundLuminance = relativeLuminance(hex);
  const darkContrast = contrastAgainst(relativeLuminance(PANEL_DARK_FOREGROUND), backgroundLuminance);
  const lightContrast = contrastAgainst(relativeLuminance(PANEL_LIGHT_FOREGROUND), backgroundLuminance);
  return darkContrast >= lightContrast ? PANEL_DARK_FOREGROUND : PANEL_LIGHT_FOREGROUND;
}

function mixHex(background: string, foreground: string, foregroundWeight: number): string {
  const channels = [1, 3, 5].map(offset => {
    const back = Number.parseInt(background.slice(offset, offset + 2), 16);
    const front = Number.parseInt(foreground.slice(offset, offset + 2), 16);
    return Math.round(back * (1 - foregroundWeight) + front * foregroundWeight)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export function getPanelSurfaceColors(background: string) {
  const foreground = getAccessiblePanelForeground(background);
  return {
    background,
    foreground,
    accent: mixHex(background, foreground, 0.12),
    border: mixHex(background, foreground, 0.28),
  };
}
