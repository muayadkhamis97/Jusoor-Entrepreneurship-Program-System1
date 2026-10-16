# PaperSurface build reference

- Source: `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, lines 34–40, 77.
- Provenance: local project-owned code; no external dependencies beyond React/cn.
- Source styles: page paper `#f7eee4`, paper2 `#eddfd1`, panel `#fff8f0`, ink `#192f40`, line `#d8c8b8`. Grain is a `.55px` radial dot in a `7px` repeat.
- Export: `@workspace/program-editorial/components/ui/paper-surface`; native div props, `variant="paper" | "panel"`, optional `grain`.
- Adaptation: grain uses the border token and a local background rather than the source's fixed full-page pseudo-element. It does not introduce a global overlay or stacking interaction. Panel shadow belongs to Dialog, not every surface.
- Validation: all four variant/texture combinations are in the family story and both themes are checked. See `../../QA.md`.
