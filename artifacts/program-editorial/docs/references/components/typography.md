# Typography build reference

- Source: selected local mockup, `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, lines 33, 45–46, 51, 53–55, 61–62, 65, 75, 78–80.
- Provenance: project-owned markup/CSS. Google Fonts supply the three named typefaces; no application import is retained.
- Source styles: Fraunces 600 hero at `clamp(64px,8.1vw,112px)`, `.87` line height, `-.075em`; 500 italic accent. Fraunces section/dialog heading ~29–30px, `-.04em`; DM Sans body15px/1.75; IBM Plex Mono labels9–10px, `.13em`.
- Export: `@workspace/program-editorial/components/ui/typography`; `variant="hero" | "heading" | "body" | "label"`, semantic `as` and native attributes.
- Adaptations: hero minimum58px reflects the source mobile minimum; label10px unifies small-label variants; script-specific tracking reset when `lang="ar"`. Accent-tone labels blend 85% accent with 15% foreground for small-text contrast; large emphasis retains the exact source accent. Do not use tiny labels as essential long-form content.
- Runtime: fonts load in `index.html`; consumers load the same fonts once as documented in the web guide. No dedicated Arabic font is supplied.
- Validation: all four variants, italic emphasis and RTL Arabic sample in the story; contrast, font loads and screenshots in `../../QA.md`.
