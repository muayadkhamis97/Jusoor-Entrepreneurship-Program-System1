# Button build reference

- Source: `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, lines 47–48, 66–71, 105–107, 124–129, 147; source screenshot: `../source-landing.jpg`.
- Provenance: local project-owned code, no external license or runtime dependency.
- Source API: native `<button>` with native disabled/click/keyboard behavior and page-owned state; no headless library.
- Source styles: primary `#245c70`, text `#fff5e9`, `3px 14px 3px 14px` corners, `15px 17px` padding, `700 12px DM Sans`; hover lift `-2px/200ms`; text action blue → terracotta; pill `9px 14px` padding and capsule radius.
- Export: `@workspace/program-editorial/components/ui/button`; native props, `variant="primary" | "text" | "pill"`, optional decorative `arrow`.
- Adaptations: reusable props/ref, token variables, visible focus, disabled state, reduced-motion hover suppression. Primary actions use the Accent and Accent foreground tokens; hover uses brightness rather than a new hardcoded color.
- Validation: story covers all three variants, primary with/without arrow, disabled variants, click counter and toggle. Theme/keyboard results are in `../../QA.md`.

## Revision: compact workspace composition

- Children render directly inside the inline-flex button (no wrapper span), so `<Icon /> Label` stays on one line; svg children are sized 16px and do not shrink.
- Added `size="sm" | "md"` (32px / 36px heights) for dense desktop rows and page actions.
- Added `variant="secondary"` (bordered card action) and `variant="danger"` (destructive, uses `--destructive`). Primary keeps the Accent token with a standard radius; the old asymmetric corners were dropped for operational density.
- `asChild` composes a single semantic link through Radix Slot; Slottable preserves direct icon/text composition and optional arrows. The exported `buttonStyles` recipe lets headless calendar and dialog actions share the same treatment.
- The Program Hub's legacy button import is a compatibility adapter only: variant names map to these shared variants and no second palette or density recipe is defined locally.
