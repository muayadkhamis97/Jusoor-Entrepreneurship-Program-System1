# Typography build reference

- Source: selected local mockup, `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, lines 33, 45–46, 51, 53–55, 61–62, 65, 75, 78–80.
- Provenance: project-owned markup/CSS. Google Fonts supply the three named typefaces; no application import is retained.
- Source styles: Fraunces 600 hero at `clamp(64px,8.1vw,112px)`, `.87` line height, `-.075em`; 500 italic accent. Fraunces section/dialog heading ~29–30px, `-.04em`; DM Sans body15px/1.75; IBM Plex Mono labels9–10px, `.13em`.
- Export: `@workspace/program-editorial/components/ui/typography`; `variant="hero" | "heading" | "body" | "label"`, semantic `as` and native attributes.
- Current system typography: the user requested sans-serif throughout. Use DM Sans for all Latin headings and body text, Noto Sans Arabic400–700 for Arabic glyphs, and IBM Plex Mono for short labels. Hero size is44–88px/1.12 with−.025em tracking; headings use24–32px/1.3; body uses16px/1.75 up to65ch; labels use11px/1.55/.08em.
- Arabic addition: Noto Sans Arabic400–700 is included in every token font stack. `:lang(ar)` supports explicit or inherited language, switches typography to the sans stack, removes Latin tracking/case/italic treatment, and raises line height (heading1.6, body1.85, label1.75). An explicit Arabic `lang` defaults direction toRTL, while a caller's `dir` takes precedence.
- Accent-tone labels blend85% accent with15% foreground for small-text contrast; large emphasis retains the exact source accent. Labels are for short structure, not essential long-form content.
- Runtime: DM Sans, IBM Plex Mono and Noto Sans Arabic load in `index.html`; consumers load the same fonts once as documented in the web guide. Google Fonts must remain reachable, or the documented system fallbacks apply.
- Validation: all four variants, italic emphasis and RTL Arabic sample in the story; contrast, font loads and screenshots in `../../QA.md`.
