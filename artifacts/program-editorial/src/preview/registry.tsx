import { lazy, type ComponentType } from "react";
import { Overview, BrandColors, SupportingColors, Fonts, Layout } from "./foundations";

export const DESIGN_SYSTEM = {
  title: "Program Editorial Design System",
  description: "Warm paper. Clear sans-serif type. Direct next steps.",
};
export type Entry = { id: string; name: string; description: string; Page: ComponentType };
export type NavGroup = { name: string; entries: Entry[] };
export const OVERVIEW_ENTRY: Entry = { id: "overview", name: "Overview", description: "Source-extracted foundations and five component families", Page: Overview };
export const NAV_GROUPS: NavGroup[] = [
  { name: "Colors", entries: [
    { id: "colors-brand", name: "Brand palette", description: "Primary, secondary, accent", Page: BrandColors },
    { id: "colors-supporting", name: "Supporting roles", description: "Surfaces, text, semantic and extension colors", Page: SupportingColors },
  ] },
  { name: "Fonts", entries: [{ id: "fonts-families", name: "Font families", description: "DM Sans, IBM Plex Mono, Noto Sans Arabic", Page: Fonts }] },
  { name: "Layout", entries: [{ id: "layout-principles", name: "Space, shape & motion", description: "Source geometry and responsive behavior", Page: Layout }] },
  { name: "Actions", entries: [{ id: "component-button", name: "Buttons", description: "Primary, text and pill variants", Page: lazy(() => import("./demos/button")) }] },
  { name: "Typography", entries: [{ id: "component-typography", name: "Editorial type", description: "Hero, heading, body and label", Page: lazy(() => import("./demos/typography")) }] },
  { name: "Structure", entries: [
    { id: "component-paper-surface", name: "Paper surfaces", description: "Paper, panel and optional grain", Page: lazy(() => import("./demos/paper-surface")) },
    { id: "component-rule", name: "Divider rules", description: "Horizontal, vertical and accent rules", Page: lazy(() => import("./demos/rule")) },
  ] },
  { name: "Overlays", entries: [{ id: "component-dialog", name: "Dialogs", description: "Controlled modal with native keyboard behavior", Page: lazy(() => import("./demos/dialog")) }] },
];
export const ALL_ENTRIES = [OVERVIEW_ENTRY, ...NAV_GROUPS.flatMap(group => group.entries)];
if (new Set(ALL_ENTRIES.map(entry => entry.id)).size !== ALL_ENTRIES.length) throw new Error("Duplicate design-system page id");
