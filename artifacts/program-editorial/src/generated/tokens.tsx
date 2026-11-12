/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "primary": "#3f6f8f",
      "primaryForeground": "#ffffff",
      "secondary": "#e8eef3",
      "secondaryForeground": "#1f3445",
      "accent": "#506f85",
      "accentForeground": "#ffffff",
      "background": "#F8F7FA",
      "foreground": "#1f3445",
      "border": "#E8E2ED",
      "card": "#FFFFFF",
      "cardForeground": "#1f3445",
      "popover": "#ffffff",
      "popoverForeground": "#1f3445",
      "muted": "#e8eef3",
      "mutedForeground": "#526777",
      "destructive": "#b43c29",
      "destructiveForeground": "#ffffff",
      "input": "#718494",
      "ring": "#3f6f8f",
      "chart1": "#3f6f8f",
      "chart2": "#557f98",
      "chart3": "#71899a",
      "chart4": "#8b7c68",
      "chart5": "#6e708f",
      "sidebar": "#1f3445",
      "sidebarForeground": "#ffffff",
      "sidebarBorder": "#435460",
      "sidebarPrimary": "#c5dce9",
      "sidebarPrimaryForeground": "#1f3445",
      "sidebarAccent": "#2d4453",
      "sidebarAccentForeground": "#ffffff",
      "sidebarRing": "#c5dce9"
    },
    "dark": {
      "primary": "#8eb8cf",
      "primaryForeground": "#10202c",
      "secondary": "#2d4453",
      "secondaryForeground": "#eaf1f5",
      "accent": "#a0bfd0",
      "accentForeground": "#10202c",
      "background": "#111d28",
      "foreground": "#eaf1f5",
      "border": "#435460",
      "card": "#1b2b37",
      "cardForeground": "#eaf1f5",
      "popover": "#1b2b37",
      "popoverForeground": "#eaf1f5",
      "muted": "#293b48",
      "mutedForeground": "#bec9d0",
      "destructive": "#ef9b89",
      "destructiveForeground": "#10202c",
      "input": "#91a2ad",
      "ring": "#8eb8cf",
      "chart1": "#8eb8cf",
      "chart2": "#a0bfd0",
      "chart3": "#83a3b7",
      "chart4": "#b2a690",
      "chart5": "#a5a2c2",
      "sidebar": "#172632",
      "sidebarForeground": "#eaf1f5",
      "sidebarBorder": "#435460",
      "sidebarPrimary": "#8eb8cf",
      "sidebarPrimaryForeground": "#10202c",
      "sidebarAccent": "#2d4453",
      "sidebarAccentForeground": "#eaf1f5",
      "sidebarRing": "#8eb8cf"
    }
  },
  "fontFamily": {
    "sans": [
      "DM Sans",
      "Noto Sans Arabic",
      "sans-serif"
    ],
    "serif": [
      "DM Sans",
      "Noto Sans Arabic",
      "sans-serif"
    ],
    "mono": [
      "IBM Plex Mono",
      "Noto Sans Arabic",
      "monospace"
    ]
  },
  "fontSize": {
    "bodyMinimum": "0.875rem",
    "captionMinimum": "0.75rem"
  },
  "radius": "0.1875rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
