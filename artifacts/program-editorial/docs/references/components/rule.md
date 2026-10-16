# Rule build reference

- Source: `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, lines 42, 52, 58, 63–64, 93–94.
- Provenance: local project-owned CSS; no behavior dependency.
- Source styles: 1px warm neutral separators; 30px terracotta eyebrow segments; vertical route separators disappear when the action rail stacks.
- Export: `@workspace/program-editorial/components/ui/rule`; `orientation="horizontal" | "vertical"`, `tone="neutral" | "accent"` and div attributes.
- Adaptations: separator ARIA semantics and logical inline border. The consumer owns responsive visibility and size.
- Validation: neutral horizontal, accent segments and vertical rule appear in the story; theme and RTL checks in `../../QA.md`.
