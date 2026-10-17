/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "primary": "#245c70",
      "primaryForeground": "#fff5e9",
      "secondary": "#eddfd1",
      "secondaryForeground": "#192f40",
      "accent": "#c74935",
      "accentForeground": "#ffffff",
      "background": "#f7eee4",
      "foreground": "#192f40",
      "border": "#d8c8b8",
      "card": "#fff8f0",
      "cardForeground": "#192f40",
      "popover": "#fff8f0",
      "popoverForeground": "#192f40",
      "muted": "#eddfd1",
      "mutedForeground": "#52636e",
      "destructive": "#b43c29",
      "destructiveForeground": "#fff5e9",
      "input": "#586b76",
      "ring": "#245c70",
      "chart1": "#245c70",
      "chart2": "#c74935",
      "chart3": "#63744b",
      "chart4": "#a77b30",
      "chart5": "#805a79",
      "sidebar": "#eddfd1",
      "sidebarForeground": "#192f40",
      "sidebarBorder": "#d8c8b8",
      "sidebarPrimary": "#245c70",
      "sidebarPrimaryForeground": "#fff5e9",
      "sidebarAccent": "#f7eee4",
      "sidebarAccentForeground": "#192f40",
      "sidebarRing": "#245c70"
    },
    "dark": {
      "primary": "#9bc8d5",
      "primaryForeground": "#132734",
      "secondary": "#314c59",
      "secondaryForeground": "#f7eee4",
      "accent": "#e78d73",
      "accentForeground": "#132734",
      "background": "#132734",
      "foreground": "#f7eee4",
      "border": "#49616b",
      "card": "#192f40",
      "cardForeground": "#f7eee4",
      "popover": "#192f40",
      "popoverForeground": "#f7eee4",
      "muted": "#213d4c",
      "mutedForeground": "#b9c5c9",
      "destructive": "#ef9b89",
      "destructiveForeground": "#132734",
      "input": "#91a9b2",
      "ring": "#9bc8d5",
      "chart1": "#9bc8d5",
      "chart2": "#e78d73",
      "chart3": "#aabb87",
      "chart4": "#d9b776",
      "chart5": "#c7a4c1",
      "sidebar": "#192f40",
      "sidebarForeground": "#f7eee4",
      "sidebarBorder": "#49616b",
      "sidebarPrimary": "#9bc8d5",
      "sidebarPrimaryForeground": "#132734",
      "sidebarAccent": "#314c59",
      "sidebarAccentForeground": "#f7eee4",
      "sidebarRing": "#9bc8d5"
    }
  },
  "fontFamily": {
    "sans": [
      "DM Sans",
      "Noto Sans Arabic",
      "sans-serif"
    ],
    "serif": [
      "Fraunces",
      "Noto Sans Arabic",
      "Georgia",
      "serif"
    ],
    "mono": [
      "IBM Plex Mono",
      "Noto Sans Arabic",
      "monospace"
    ]
  },
  "radius": "0.1875rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
