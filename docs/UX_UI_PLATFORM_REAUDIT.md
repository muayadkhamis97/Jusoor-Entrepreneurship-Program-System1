# Jusoor Entrepreneurship Program System — UX/UI re-audit

**Date:** 2026-10-15
**Scope:** Re-audit the 20 findings in `docs/UX_UI_PLATFORM_AUDIT.md` and its route/page coverage, using current source, automated checks, and isolated browser fixtures.

## Executive summary

The original findings register contains 20 items. This re-audit classifies **7 Fixed—Verified, 11 Partially Fixed, and 2 Not Fixed**. No finding is classified as fully blocked or wholly unverifiable because each has source-level evidence; however, actual authenticated page rendering, live Clerk behavior, and complete Arabic visual presentation remain unverified.

The original coverage table contains **33 page/surface groups** (including embedded learning features and shared status pages), rather than 30. All 33 groups are carried forward below; none was dropped to force the count to 30.

The highest remaining UX risk is incomplete Arabic coverage: the focused translation test passes for selected flows, but the `/access` page still contains substantial literal English copy. Other notable remaining issues are small functional text, incomplete RTL styling, numeric trainer cohort labels, and separate page-specific styling families.

## Method, boundaries, and confidence

- Inspected the original finding register and all 33 route/page groups, then reviewed the current source and targeted tests relevant to the findings.
- Ran automated API and web tests, TypeScript checks, production builds for the Jusoor web and API artifacts, and browser tests against local synthetic HTML fixtures.
- The sidebar and participant-account fixtures use an ephemeral local server and abort requests that are not same-origin local `GET` requests. They do **not** sign in to Clerk or render protected application routes.
- The dialog fixture also uses local Vite, but imports `index.css`, which contains a Google Fonts `@import`; that fixture has no outbound-request interceptor. A font request may have been attempted during its browser test, and the test did not capture whether it succeeded. No provider API, email, or authentication action was intentionally invoked; treat the absence of external font traffic as **not verified**.
- The API test command supplied a synthetic, unreachable database URL at `127.0.0.1:1`; no existing development or production database was contacted. No migrations, workflows, external providers, email, publishing, or deployment were used.
- No production data, authenticated session, or real program record was inspected or changed.
- **Verified** means supported by a passing targeted automated test/build or direct source behavior check. **Partially Fixed** means the implementation or test coverage has improved but the finding remains in some paths, or real-page behavior is not verified. **Not Fixed** means the original risk remains in current source.
- No accessibility tree audit, screen-reader test, authenticated browser session, actual route screenshot, network-throttling test, or Arabic-rendered application screenshot was performed.

## Verification results

### Passed

| Check | Result | Evidence and limits |
| --- | --- | --- |
| API tests | **142 passed, 0 failed** | `pnpm run test:api`. Uses the test suite's synthetic environment; it is not a live API/database test. |
| Web unit tests | **45 passed, 0 failed** | `pnpm --filter @workspace/jusoor-program run test:unit`. Includes selected translation, contrast-token, labels, participant actions, and program-selection checks. |
| Dialog browser fixtures | **2 passed, 0 failed** | `pnpm --filter @workspace/jusoor-program run test:ui-browser`. Synthetic dialog/focus and mobile-navigation fixture, not authenticated app routes. |
| Sidebar and participant account browser fixtures | **2 passed, 0 failed** | Explicit `tsx --test` invocation for `admin-sidebar-layout.browser.test.tsx` and `participant-account-actions.browser.test.tsx`. Tests local fixture behavior at desktop/mobile sizes only. |
| TypeScript | **Passed** | The web typecheck passed separately. The top-level workspace typecheck also passed for libraries, API server, Jusoor web, mockup sandbox, and scripts. |
| Jusoor web build | **Passed** | `PORT=5000 BASE_PATH=/jusoor-program pnpm --filter @workspace/jusoor-program run build`. Vite completed; see build warnings below. |
| API build | **Passed** | `pnpm --filter @workspace/api-server run build`. |

### Failed or blocked checks

- The recursive `pnpm run build` did not complete because the separate `@workspace/mockup-sandbox` Vite config requires build-time `PORT` and `BASE_PATH`. The first attempt lacked `PORT`; the retry supplied `PORT=5173` and then reported missing `BASE_PATH`. This did not prevent the standalone Jusoor web or API builds from passing. The mockup sandbox was not rebuilt with guessed artifact settings.
- The Jusoor web build emitted a non-blocking dropdown-menu source-map warning and the standard large-chunk warning. The main `index` JavaScript chunk was **893.91 kB minified / 249.14 kB gzip**. No throttled-network or real load-time measurement was performed.
- Authenticated app pages and actual Clerk sign-out were not browser-tested. The capture browser has no signed-in session; no authentication bypass was introduced.
- External font traffic from the dialog fixture is not verified: it imports the external Google Fonts stylesheet without an explicit browser request blocker. No provider API, email delivery, or authenticated connection was intentionally exercised.
- No Arabic-rendered page, production behavior, database schema/migration, external-provider integration, or real email delivery was verified.

## Finding-by-finding status

| ID / original severity | Finding | Current status | Evidence from this re-audit | Remaining issue / next action |
| --- | --- | --- | --- | --- |
| UX-01 / High | Remaining custom modals lacked shared focus management | **Fixed—Verified** | The custom application-review and form surfaces use `AccessibleDialogSurface`; the dialog fixture test passed focus entry/containment/restoration, Escape, and preserved form state. The fixture also checks production call-site safeguards. | Re-check the actual protected dialogs with an authorized account and assistive technology; fixture verification is not route-level verification. |
| UX-02 / High | Arabic mode left substantial functional copy in English | **Partially Fixed** | The 45-test suite includes `applicant, coordinator, and profile flow strings have Arabic translations` and dynamic-content/fallback checks. Current `role-access.tsx` still has literal English headings, legend text, and explanatory copy (for example, “Who can do what,” “Allowed,” and “Preview only”). Communications also retains raw English error/filter copy. | Translate all visible fixed strings in key routes and make the automated check detect raw UI literals in the agreed route set without flagging user content or proper nouns. Render and inspect Arabic/RTL pages after that. |
| UX-03 / High | Default secondary text color failed normal-text contrast | **Partially Fixed** | `ui-accessibility-contract.test.tsx` computes the current default `muted-foreground` contrast against both background and card and passes the 4.5:1 threshold. | Opacity-based secondary text remains in feature CSS (including sidebar/role microcopy); the token test does not calculate the blended contrast of those cases or custom branding. Audit actual rendered combinations and adjust remaining low-contrast text. |
| UX-04 / High | Participant sign-out/account-switch flow needed an authenticated Clerk check | **Partially Fixed** | Participant dashboard renders the account action only in the signed-in dashboard and calls the existing Clerk sign-out action. The synthetic account-action browser test passed keyboard, responsive, feedback, and redirect-target assertions at 390 px and 1440 px. | Account switching is not configured as a separate action. Real Clerk sign-out/session invalidation and redirect were not verified because no signed-in account was used. |
| UX-05 / Medium | Functional typography was frequently too small | **Partially Fixed** | Mobile input sizing and reduced-motion support have source-contract tests; responsive styles contain a 16 px mobile input rule. | Very small functional text remains, including 8–10 px labels/question metadata in `role-workspace.css` and other feature CSS. Establish minimum sizes and check actual routes at mobile and desktop sizes. |
| UX-06 / Medium | Application submission errors hid actionable causes | **Fixed—Verified** | The unit test `application submission explains duplicate applications and keeps other failures retryable` passes; API tests validate relevant inputs and error paths. | No populated application was submitted through the UI; keep an end-to-end check for duplicate and retry outcomes in an approved fixture. |
| UX-07 / Medium | Business-team request errors were described as ongoing setup | **Fixed—Verified** | The accessibility contract test confirms a participant team-load failure has an alert and retry action, and the current source calls `query.refetch()`. | A real request failure was not induced in the authenticated participant route. |
| UX-08 / Medium | Draft dialog content could be dismissed without warning | **Partially Fixed** | Analytics attendance and KPI editors now use dirty-state dismissal guards and confirmation dialogs; the dialog fixture test passed dirty-form and pending-action safeguards. | The fixture is synthetic. Perform a route-level inventory of every remaining edit/receipt/activity dialog and verify cancel, Escape, outside-click, and pending-save behavior. |
| UX-09 / Medium | Program context was local to individual operations pages | **Partially Fixed** | A shared `useProgramSelection` helper now restores the selected program from session storage only when it is in the current authorized options; unit tests cover stale IDs and default selection. It is adopted by analytics, course management, and team assignments. | It is not a global route context and is not used by every program-scoped page; navigation/deep links do not consistently preserve program selection. |
| UX-10 / Medium | Participant dashboard stacked major tasks without section navigation | **Partially Fixed** | The dashboard now has a contextual next-action panel and an anchor index for progress, team, updates, and learning. | The page remains a long dashboard; actual scroll behavior, anchor visibility, and mobile usefulness were not visually tested. |
| UX-11 / Medium | RTL handling was incomplete in feature styles and icons | **Partially Fixed** | Arabic document direction and an RTL arrow rule are present and covered by a source-contract test. | Feature CSS still includes physical-direction rules, including left alignment/padding in role-access tables. No complete Arabic page was rendered, so layout, icon, table, and dialog direction are not verified. |
| UX-12 / Medium | Session text-response controls lacked persistent individual labels | **Fixed—Verified** | The unit contract test confirms persistent associated labels and matching `id`/`htmlFor` for short answers and trainer questions. | Screen-reader announcement behavior was not checked in an actual accessibility tree. |
| UX-13 / Medium | Mobile staff navigation depended on discovering horizontal scrolling | **Partially Fixed** | The synthetic fixture checks navigation labels; the sidebar fixture verifies pinned opaque layout, scrolling, and viewport resizing. Dialog/browser fixture coverage also exercises mobile navigation labels. | Tests do not establish that the horizontal overflow affordance is discoverable to touch users on the real signed-in shell. Inspect actual mobile pages and consider a persistent cue or alternate menu. |
| UX-14 / Medium | Dense tables needed better mobile and large-cohort ergonomics | **Partially Fixed** | Assignment and role-access tables are keyboard-focusable labelled scroll regions; a unit contract test enforces that structure. | This covers selected tables, not all business/analytics tables. Pagination, very large cohorts, and touch behavior on real pages remain unverified. |
| UX-15 / Medium | Reduced-motion support was limited to one loading family | **Fixed—Verified** | A global `prefers-reduced-motion: reduce` rule is present, and the accessibility contract test checks its presence alongside mobile control sizing. | The browser fixture did not emulate reduced-motion preference or inspect the resulting motion on actual routes. |
| UX-16 / Medium | Role-preview tabs had incomplete keyboard tab behavior | **Fixed—Verified** | The role preview now uses the existing Radix `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` primitives rather than a custom selector. | The actual `/access` page and its keyboard sequence were not rendered in the browser fixture. |
| UX-17 / Medium | Parallel styling/component families increased inconsistent behavior | **Not Fixed** | Current source still uses shared shell styles plus multiple independent feature CSS files and component-specific button/form families (for example analytics, grants, API integrations, and role workspaces). | Consolidate only through a separately scoped design-system/component task; avoid broad refactoring during this audit. |
| UX-18 / Medium | Trainer assignment cohorts were numeric and session-derived | **Not Fixed** | `role-surfaces.tsx` derives cohort options from assigned sessions and labels each option `Cohort {id}` rather than using a program name. | Supply the trainer’s authorized program choices and display stable program names; include programs with no current session. |
| UX-19 / Low | Invitation wording could imply email delivery that does not happen | **Fixed—Verified** | The unit test `participant invitation instructions truthfully explain account access without claiming an email was sent` passes. No invitation email was sent during this audit. | Keep the no-email limitation visible in the actual invite success state; email delivery remains a separate integration and was not tested. |
| UX-20 / Low | Arabic typography did not consistently inherit the Arabic font choice | **Partially Fixed** | `--app-font-sans` includes `Noto Sans Arabic` as a fallback; the language CSS has explicit Arabic direction and the style-contract test passes. | The external font import loads DM Sans, Manrope, and IBM Plex Mono—not Noto Sans Arabic—and headings/components still explicitly select Manrope. Arabic font availability and shaping are not visually verified. |

## Route and surface coverage

The table below reproduces every page/surface group listed in the original audit. “Source/test only” means code and relevant automated checks were inspected; it does **not** mean the signed-in route was opened or visually verified.

| # | Route or surface group | Roles / scope | Re-audit evidence and limits |
| ---: | --- | --- | --- |
| 1 | `/` public landing | Visitor | Source only; no landing-page screenshot. |
| 2 | `/sign-in/*`, `/sign-up/*` | All account types | Source only; Clerk widget and account recovery not rendered. |
| 3 | `/apply` | Applicant | Source and application-error/translation tests; no application submitted. |
| 4 | `/verify-certificate` | Public | Certificate tests exist; no verification route request made. |
| 5 | `/participant` | Participant | Source plus isolated account-action fixture; dashboard itself not rendered. |
| 6 | `/participant/profile` | Participant | Source and profile permission tests; no profile changed or page rendered. |
| 7 | `/` operations overview | Admin / project staff | Source only; no authenticated overview. |
| 8 | `/businesses` | Admin / project staff | Source only; no list or edit action executed. |
| 9 | `/programs` | Admin / project staff | Source and API lifecycle/assignment tests; no live archive/restore action. |
| 10 | `/sessions` | Admin / project staff | Source and automated attendance/session tests; no live attendance or provider sync. |
| 11 | `/communications` | Admin | Source and API targeted-message tests; no message sent; raw English UI copy remains. |
| 12 | `/support` | Admin / project staff | Source only; no booking/provider action. |
| 13 | `/mentor-booking` | Admin | Source only; no provider flow executed. Calendly OAuth was excluded. |
| 14 | `/pitches` | Admin / project staff | Source only; no evaluation or assignment submitted. |
| 15 | `/grants` | Admin | Source and grant-ledger tests; no grant record changed. |
| 16 | `/courses` | Admin / project staff | Source and API role/release tests; no course page rendered. |
| 17 | Embedded quizzes / assessments | Admin / trainer / participant | Source plus grading/draft tests; no interactive route session. |
| 18 | Embedded discussions / live activities | Trainer / participant / admin | Source and API interaction tests; no live course/session page. |
| 19 | Embedded packages / recordings / offline materials | Authorized learners / staff | Source and link-validation tests; no media, captions, package, or offline playback checked. |
| 20 | Embedded learning progress / certificates | Participant / admin | Source and progress/certificate tests; no certificate issued, revoked, or downloaded in the UI. |
| 21 | `/analytics` | Admin | Source, API tests, and export-unit tests; no chart/table rendered or report exported. |
| 22 | Embedded idea validation / business plan | Accepted participant | API privacy tests and source; no participant workbook page rendered or saved. |
| 23 | Embedded peer directory / business teams | Accepted participant | API access/privacy tests and source; no directory preference changed. |
| 24 | `/team` | Admin | Source and invitation-copy test; no invitation issued. |
| 25 | `/team-assignments` | Admin / project staff | Source and API role/audit tests; no assignment changed. |
| 26 | `/access` | Admin | Source only; tab semantics inspected, no keyboard interaction on the actual page. |
| 27 | `/profile`, `/profiles` | Staff / Admin | Source and profile permission tests; no profile edited in the UI. |
| 28 | `/branding` | Admin | Source only; no brand changed and custom-brand contrast not measured. |
| 29 | `/api-integrations` | Admin | Source and API permission tests; no key created or revoked. |
| 30 | `/trainer`, `/trainer/courses`, `/trainer/sessions` | Trainer | Source and related API role tests; no trainer route rendered. |
| 31 | `/mentor` | Mentor | Source only; no assigned mentor account used. |
| 32 | `/judge` | Judge | Source only; no scorecard submitted. |
| 33 | Loading / denied / failure / not-found / fallback | All | Source only; no actual auth-denial or route failure induced. |

### Viewport and language coverage

- **Synthetic browser fixtures:** dialog fixture at 1280×800, 390×844, and 320×800; participant account-action fixture at 390×844 and 1440×844; Admin sidebar fixture at 1280×640 with scroll/resize and 1440×900.
- These dimensions exercise isolated fixtures only. No authenticated page was inspected at desktop, tablet, or mobile widths.
- The dialog fixture includes an Arabic/RTL test state, but no complete Arabic applicant, participant, Admin, trainer, mentor, or judge page was rendered.
- Actual Clerk sign-in/sign-out, real assistive technology, screen-reader announcements, touch interaction on live routes, and custom-brand colors remain not verified.

## Newly surfaced issue

| Severity | Issue | Evidence | Impact / recommended next action |
| --- | --- | --- | --- |
| Medium (potential performance risk) | The main web JavaScript bundle is large. | Jusoor Vite build reports `index-CNNAxRRV.js` at 893.91 kB minified (249.14 kB gzip) and emits the >500 kB chunk warning. | First-load transfer/parse cost may affect slower devices or connections. Measure with a production-like network profile, then consider route-level/lazy splitting. No real load-time regression was measured in this audit. |

## Remaining limitations

1. The app's protected pages were not opened in a real signed-in browser session. Sidebar and account-action browser results apply only to synthetic fixtures.
2. Arabic translation and RTL tests cover selected strings/contracts; they do not prove full translation coverage or rendered Arabic typography.
3. Source-based findings about role-scoped flows are not a substitute for an authenticated end-to-end test using isolated synthetic accounts.
4. Custom branding, dense-table behavior, visual contrast of opacity-based text, and actual reduced-motion behavior need rendered-page checks.
5. The aggregate workspace build remains blocked by build-time environment requirements in the separate mockup sandbox; the Jusoor web and API artifact builds passed independently.
