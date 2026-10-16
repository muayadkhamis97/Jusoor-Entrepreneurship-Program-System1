# Consuming Program Editorial in web apps

Read `artifacts/program-editorial/docs/AGENTS.md` first. This guide covers
React/Vite and Tailwind web consumers. If the app already contains
a local theme or component library, also read
`artifacts/program-editorial/docs/migrating-web.md` before writing UI.

## Theme

Import this package's theme once from the app's main CSS:

```css
@import "@workspace/program-editorial/styles.css";
```

`styles.css` already imports Tailwind, its plugins, and this package's token
theme. It also registers this package's component sources. Do not add a separate
Tailwind import or a `node_modules` source path in a Tailwind v4 consumer.
Tailwind v3 consumers keep their existing `@tailwind` directives and add
`node_modules/@workspace/program-editorial/src/components` to `content`.

## Components and helpers

The package provides only five primitive families. Import them directly:

```tsx
import { Button } from "@workspace/program-editorial/components/ui/button";
import { cn } from "@workspace/program-editorial/lib/utils";
import { Typography } from "@workspace/program-editorial/components/ui/typography";
import { PaperSurface } from "@workspace/program-editorial/components/ui/paper-surface";
import { Rule } from "@workspace/program-editorial/components/ui/rule";
import { Dialog } from "@workspace/program-editorial/components/ui/dialog";
```

Use the package component whenever it provides the required family. Keep
product-specific compositions in the app, but compose them from package
primitives rather than recreating those primitives locally.

There is no Toaster, toast hook, form input or table in this extracted catalog.
Do not delete local components the package does not replace.

Load DM Sans 400–700, Fraunces 500–700 (including italic500), and IBM Plex Mono
400–500 once in the consumer; `index.html` in this package has the exact Google
Fonts link. Font stacks have system fallbacks; Arabic uses script fallback.

Button accepts native button props and `variant="primary" | "text" | "pill"`,
with an optional decorative `arrow`. It is not an anchor or routing component.
Typography accepts `variant="hero" | "heading" | "body" | "label"` and
`tone="default" | "accent"` (small accent labels have a contrast-adjusted blend), native
attributes and semantic `as`. PaperSurface accepts `variant="paper" | "panel"`
and `grain`. Rule accepts `orientation` and `tone`. Dialog is controlled by
`open` / `onOpenChange`, with required `title` and optional `eyebrow`,
`description`, `children`; it requires native HTML dialog support.

Dark mode uses a `.dark` ancestor and is explicitly derived, not source-extracted.

## Verify

After wiring the workspace dependency, import and render
`@workspace/program-editorial/components/ui/button`. Run the app's typecheck
and dev server. The import must resolve and the Button must use this package's
theme before broader UI work begins.

## Ongoing rules

- Keep one source of theme variables.
- Import package-provided primitives and helpers from the package path.
- Add reusable product-agnostic components to this package first.
- For a non-shadcn app, use the tokens as the source of truth and adapt existing
  components to the token CSS variables without copying token values.
