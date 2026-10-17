import type { CSSProperties } from "react";
import { tokens } from "../generated/tokens";

function hslChannels(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min, lightness = (max + min) / 2;
  let hue = 0;
  if (delta) {
    hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return `${hue.toFixed(4)} ${(saturation * 100).toFixed(4)}% ${(lightness * 100).toFixed(4)}%`;
}

/** Scope the exported theme to one region during an incremental migration. */
export function getThemeStyle(mode: "light" | "dark" = "light"): CSSProperties {
  const style: Record<string, string> = {};
  for (const [name, hex] of Object.entries(tokens.color[mode])) {
    const variable = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/(\D)(\d)/g, "$1-$2");
    style[`--${variable}`] = hslChannels(hex);
  }
  const stack = (fonts: readonly string[]) => fonts.map(font => font.includes(" ") ? `"${font}"` : font).join(", ");
  return {
    ...style,
    "--app-font-sans": stack(tokens.fontFamily.sans),
    "--app-font-mono": stack(tokens.fontFamily.mono),
    "--editorial-font-serif": stack(tokens.fontFamily.serif),
    "--radius": tokens.radius,
    fontFamily: stack(tokens.fontFamily.sans),
  } as CSSProperties;
}
