# Extraction verification — 2026-10-16

Scope: the new Program Editorial package and its standalone guide only. The selected mockup and application screens remain unchanged, pending approval.

## Typography revision — current review

The user requested a typography revision and delegated the direction. The
system retains its editorial Latin faces but reduces heading compression,
increases body/label sizes, and adds Noto Sans Arabic. The extraction results
below are historical evidence; these are the additional revision checks:

- Typecheck exited0 and Vite build exited0 for this revision.
- Chromium measured the desktop hero at72px /80.64px line height, weight500,
  −1.8px tracking; body at16px /28px line height.
- Explicit and inherited Arabic language both use RTL, normal tracking and
  normal case. Browser platform-font inspection confirmed Noto Sans Arabic
  actually rendered Arabic heading glyphs, rather than merely appearing in a
  fallback stack.
-12 responsive page checks passed: Overview, Fonts, Typography and Dialog at
  320px,390px and1440px. No document horizontal overflow. Open dialogs fit the
  viewport in all three sizes.
- The dark Typography page rendered. No console/page errors or application API
  requests were recorded during the browser checks.
- Desktop light Overview and mobile light Typography screenshots were rendered
  and inspected, including the Arabic samples. Story sections use explicit grid
  gaps so the component's margin reset cannot collapse the specimen spacing.
- Existing mockup/application diffs remained empty; no screens or canvas frames
  were updated and no publishing occurred.

Limits: this is Chromium desktop/mobile-viewport evidence, not Safari/iOS,
screen-reader, physical-device or full platform Arabic verification. Web fonts
still require access to Google Fonts, otherwise the configured system fallbacks
apply.

## Initial extraction — passed

| Check | Actual evidence |
|---|---|
| TypeScript | `pnpm --filter @workspace/program-editorial run typecheck` exited0. Includes token generation and `tsc --noEmit`. |
| Production bundle | `PORT=21236 BASE_PATH=/program-editorial/ pnpm --filter @workspace/program-editorial run build` exited0; Vite transformed48 modules and emitted the guide plus five lazy family bundles. This is a local bundle, not a publish. |
| Development runtime | Managed `artifacts/program-editorial: web` workflow restarted and served the preview. Vite reported ready without package runtime errors. |
| Fonts | Theme contract tests confirm DM Sans is used for proportional text, the legacy serif slot resolves to the same sans stack, and the app no longer requests Fraunces. Arabic and mono font imports remain present. |
| Catalog | Exactly five component files and five default-export story files. Registry has unique IDs and ten pages. All ten light pages loaded with one main heading and no horizontal overflow at1440px. |
| Colors |32 light plus32 dark roles.22 foreground/background pair calculations passed4.5:1; minimum4.74:1. This is a paired-token check, not a full WCAG audit. All three core swatches displayed nontransparent fills. |
| Button interaction | Primary click updates the story status, Enter activates the native button, all unavailable variants are disabled, and the language pill toggles its pressed state. |
| Modal interaction | Chromium verified focus entry, Shift+Tab to the final control, eight forward Tabs contained in the modal, Escape dismissal, close/action/backdrop dismissal and opener focus restoration after each path. |
| Dark preview | All ten pages loaded in the derived dark palette without horizontal overflow. Desktop dark overview screenshot rendered and was inspected. |
| Mobile | All ten pages checked at320px and390px;20 checks with no document horizontal overflow. Mobile modal bounds fit the viewport. The320px full-page overview screenshot was inspected. |
| RTL sample | The Arabic sample computes `direction: rtl` and normal letter spacing. This is a sample-level check only. |
| Reduced motion | With reduced motion enabled, the action computes `transition-property: none` and `translate: 0px`. Focused final check exited0, with zero console/page errors and no application API requests. |
| Final visual review | The final1440×1100 light overview screenshot showed filled swatches, the source type hierarchy, the five-family composition and readable guide navigation; browser capture reported no errors. |
| Original scope | `git diff -- artifacts/mockup-sandbox artifacts/jusoor-program` was empty after implementation. No canvas frame was repointed and no source mockup was re-homed. |

Browser checks were performed directly with the existing Playwright Core1.64 runtime and `/repl/tools/bin/chromium` against the development preview, without sign-in or application API calls.

## Issues found and resolved during verification

- Runtime color swatches initially referenced Tailwind compilation aliases instead of emitted theme variables. Swatches, grain and shadow now use the generated HSL custom properties; final swatch fills were checked.
- Native modal focus reached Chromium's outside DOM focus boundary on the second Tab. An explicit first/last control wrap corrected this; forward/backward boundary checks passed.
- Warm off-white on the source terracotta and source-muted text on paper2 did not meet normal-text contrast. Mapped semantic text colors were adjusted; raw source accent remains for large emphasis. Small accent labels/hover use an explicit contrast adaptation, rather than being claimed as exact source CSS.
- The first build command lacked the managed workflow's required PORT metadata and failed before compilation. Supplying the artifact's existing process metadata produced a successful bundle; configuration was not weakened.
- An intermediate reduced-motion test incorrectly required transition duration to become0s. A retained duration is harmless when transition-property is none. The focused corrected assertion passed without changing component behavior.

## Not verified / intentionally excluded

- Firefox, Safari/WebKit, physical mobile devices, screen readers and full Arabic visual/content coverage.
- Every possible color combination, user-generated colors, long translated copy or all component combinations.
- Native Expo components and hooks: not implemented; only portable tokens are available.
- Full admin component coverage: inputs, tables, navigation and course/application pages are not part of the selected source catalog.
- Existing application sign-in, databases, provider integrations, production health and deployment behavior. No production access, database changes, email or publish was part of this extraction.

## Source versus extensions

Source references and screenshots are indexed in `references/README.md` and `references/component-inventory.md`. The light brand/page palette and three typefaces are extracted. Dark mode, semantic/sidebar/chart roles, small-text contrast refinements and native-modal keyboard refinements are labeled adaptations. No standalone logo asset was supplied. The current guide is not applied to existing screens.
