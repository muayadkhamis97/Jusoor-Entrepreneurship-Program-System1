# Dialog build reference

- Source: `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, lines 4, 76–81, 140–149.
- Provenance: project-owned controlled state, markup and CSS. The source does not use Radix or another behavior library.
- Source behavior: page-owned open state selects application/sign-in copy; outside overlay and close/action controls dismiss it. Role dialog, modal semantics and title association are present.
- Source styles: fixed tinted overlay, 420px panel, 22px viewport inset, 31px padding, warm border/card, 30px Fraunces heading, close control at the trailing top corner, `0 20px 70px` shadow.
- Export: `@workspace/program-editorial/components/ui/dialog`; controlled `open`, `onOpenChange`, required `title`, optional `eyebrow`, `description`, `children`. Dependencies: the Button, Typography and PaperSurface families in this same chunk.
- Accessibility adaptation: a native `<dialog>` replaces the source overlay wrapper for modal focus, Escape and opener restoration; an explicit Tab/Shift+Tab boundary wrap keeps focus on the in-dialog controls rather than Chromium's browser-chrome focus boundary. Core controlled state/backdrop/close behavior is preserved; page-local copy/routing are not library concerns.
- No new behavior library is substituted. Use modern browsers supporting `showModal`.
- Validation: the family story starts closed with a real opener; opening, keyboard containment, Escape, close/action controls, backdrop and return focus are covered in `../../QA.md`.
