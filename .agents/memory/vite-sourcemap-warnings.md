---
name: Vite source-map warnings
description: Source-map warning behavior for unused React Server Component directives in the Jusoor Vite frontend.
---

Do not retain `"use client"` module directives in Vite-only client components unless an actual React Server Components consumer needs them. For affected TSX modules, Rollup can fail to map its module-directive diagnostic through Vite's transform chain, reporting an unmapped blank source line.

**Why:** Removing the unnecessary directive resolved the tooltip and label source-map diagnostics while preserving unrelated production build warnings.

**How to apply:** When Vite reports `SOURCEMAP_ERROR` at the beginning of a client component, check for an unused framework-specific module directive before changing sourcemap or warning configuration.
