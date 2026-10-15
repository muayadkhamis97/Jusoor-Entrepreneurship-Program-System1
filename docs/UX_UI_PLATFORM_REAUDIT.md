# Jusoor Entrepreneurship Program System — UX/UI re-audit

**Date:** 2026-10-15
**Scope:** Re-audit the 20 findings in `docs/UX_UI_PLATFORM_AUDIT.md` and its route/page coverage, using current source, automated checks, and isolated browser fixtures.

## Executive summary

The original findings register contains 20 items. This re-audit classifies **9 Fixed—Verified, 11 Partially Fixed, and 0 Not Fixed**. The October 15 follow-up expanded Arabic coverage in applicant, participant, trainer, and key Admin flows; corrected trainer program labels; raised minimum sizing for selected small UI copy; and verified the shared button and form-control styling across feature families. Actual authenticated page rendering, live Clerk behavior, and complete Arabic visual presentation remain unverified.

The original coverage table contains **33 page/surface groups** (including embedded learning features and shared status pages), rather than 30. All 33 groups are carried forward below; none was dropped to force the count to 30.

The highest remaining UX risk is incomplete Arabic coverage and the absence of a full Arabic/RTL visual check. Focused automated checks now cover role access, participant learning, trainer screens, and key Admin sessions, support, pitch, analytics, and shared-control styling. Remaining issues include text sizing outside the covered selectors and other untranslated app surfaces.

## Method, boundaries, and confidence

- Inspected the original finding register and all 33 route/page groups, then reviewed the current source and targeted tests relevant to the findings.
- Ran automated API and web tests, TypeScript checks, production builds for the Jusoor web and API artifacts, and browser tests against local synthetic HTML fixtures.
- The sidebar and participant-account fixtures use an ephemeral local server and abort requests that are not same-origin local `GET` requests. They do **not** sign in to Clerk or render protected application routes.
- The dialog fixture uses local Vite and imports `index.css`, which contains a Google Fonts `@import`. Its browser page now aborts requests unless they are same-origin local `GET` requests, so external font requests are blocked. No provider API, email, or authentication action was invoked.
- The API test command supplied a synthetic, unreachable database URL at `127.0.0.1:1`; no existing development or production database was contacted. No migrations, workflows, external providers, email, publishing, or deployment were used.
- No production data, authenticated session, or real program record was inspected or changed.
- **Verified** means supported by a passing targeted automated test/build or direct source behavior check. **Partially Fixed** means the implementation or test coverage has improved but the finding remains in some paths, or real-page behavior is not verified. **Not Fixed** means the original risk remains in current source.
- No accessibility tree audit, screen-reader test, authenticated browser session, actual route screenshot, network-throttling test, or Arabic-rendered application screenshot was performed.

## Verification results

### Passed

| Check | Result | Evidence and limits |
| --- | --- | --- |
| API tests | **142 passed, 0 failed** | `pnpm run test:api`. Uses the test suite's synthetic environment; it is not a live API/database test. |
| Web unit tests | **48 passed, 0 failed** | `pnpm --filter @workspace/jusoor-program run test:unit` (October 15 follow-up). Includes Arabic coverage, readability/RTL contract, role, and applicant/participant flow checks. |
| Trainer program label tests | **2 passed, 0 failed** | Direct `tsx --test` of the trainer program option helper; verifies actual program titles and a safe fallback without exposing numeric IDs. |
| Trainer program authorization test | **1 passed, 0 failed** | Direct test of the pure assigned-program filter; excludes unassigned program IDs without importing a database module. |
| Dialog browser fixtures | **2 passed, 0 failed** | Direct `tsx --test` of `src/dialog-accessibility.browser.test.tsx`. Synthetic dialog/focus, mobile navigation, and Arabic direction fixture; network requests outside the local test server are aborted. Not authenticated app routes. |
| Sidebar and participant account browser fixtures | **2 passed, 0 failed** | Explicit `tsx --test` invocation for `admin-sidebar-layout.browser.test.tsx` and `participant-account-actions.browser.test.tsx`. Tests local fixture behavior at desktop/mobile sizes only. |
| Shared program-control browser fixture | **1 passed, 0 failed** | `pnpm --filter @workspace/jusoor-program exec tsx --test src/program-controls.browser.test.tsx`. Synthetic CSS fixture confirms matching primary-button size/colors, common field geometry/colors, compact-size variants, keyboard focus ring, and no horizontal overflow at 1280×800 and 390×844. It does not render authenticated routes. |
| TypeScript | **Passed** | Jusoor web and API server `typecheck` scripts passed on October 15. The top-level workspace typecheck also passed in the earlier re-audit. |
| Jusoor web build | **Passed** | `PORT=5000 BASE_PATH=/jusoor-program pnpm --filter @workspace/jusoor-program run build`. Vite completed on October 15; see build warnings below. |
| API build | **Passed** | `pnpm --filter @workspace/api-server run build`. |

### Failed or blocked checks

- The recursive `pnpm run build` did not complete because the separate `@workspace/mockup-sandbox` Vite config requires build-time `PORT` and `BASE_PATH`. The first attempt lacked `PORT`; the retry supplied `PORT=5173` and then reported missing `BASE_PATH`. This did not prevent the standalone Jusoor web or API builds from passing. The mockup sandbox was not rebuilt with guessed artifact settings.
- The Jusoor web build emitted a non-blocking dropdown-menu source-map warning and the standard large-chunk warning. The main `index` JavaScript chunk was **925.05 kB minified / 257.81 kB gzip** on October 15. No throttled-network or real load-time measurement was performed.
- Authenticated app pages and actual Clerk sign-out were not browser-tested. The capture browser has no signed-in session; no authentication bypass was introduced.
- The synthetic browser fixtures block non-local requests. No provider API, email delivery, or authenticated connection was exercised.
- No Arabic-rendered page, production behavior, database schema/migration, external-provider integration, or real email delivery was verified.

### Signed-in staff-page shared-control review

Task 152 attempted to reach the protected staff routes in the normal preview browser, without changing or bypassing authentication. Opening `/api-integrations` at 1280×800 rendered the public landing page instead of the Admin route because this browser has no signed-in staff session. No actual staff-page controls were visible. The same authentication limitation applies to Admin analytics, grants, communications, and staff role access; their desktop and mobile layouts and control states remain unverified.

The isolated shared-control browser fixture was re-run and passed. It covers default computed styling, keyboard focus, and horizontal overflow/stacking at 1280×800 and 390×844. It does **not** cover hover, disabled, or error states, and it does not mount protected routes. No route-level differences were confirmed or ruled out.

| Protected page | Route | Signed-in desktop/mobile review |
| --- | --- | --- |
| Admin analytics | `/analytics` | Blocked: no authenticated staff session; no controls or states inspected. |
| API integrations | `/api-integrations` | Blocked: the normal preview rendered the public landing page at 1280×800. |
| Grants | `/grants` | Blocked: no authenticated staff session; no controls or states inspected. |
| Communications | `/communications` | Blocked: no authenticated staff session; no controls or states inspected. |
| Staff roles | `/access` | Blocked: no authenticated staff session; no controls or states inspected. |

**Next action:** repeat the review in a browser signed in through the normal Clerk flow as an authorized coordinator, at desktop and mobile sizes. Check default, hover, keyboard-focus, disabled, and error states on each page and record only differences observed there. No test-only auth state or permission bypass should be used.

## Finding-by-finding status

| ID / original severity | Finding | Current status | Evidence from this re-audit | Remaining issue / next action |
| --- | --- | --- | --- | --- |
| UX-01 / High | Remaining custom modals lacked shared focus management | **Fixed—Verified** | The custom application-review and form surfaces use `AccessibleDialogSurface`; the dialog fixture test passed focus entry/containment/restoration, Escape, and preserved form state. The fixture also checks production call-site safeguards. | Re-check the actual protected dialogs with an authorized account and assistive technology; fixture verification is not route-level verification. |
| UX-02 / High | Arabic mode left substantial functional copy in English | **Partially Fixed** | The 48-test web unit suite includes an expanded static-key check for participant learning, trainer, profile, role access, Admin sessions, support, pitch, and analytics flows. It also scans fixed JSX copy in those selected components while excluding participant-entered content and technical Zoom scope/event identifiers; fallback behavior is tested. | Coverage is substantially broader but is not a whole-app scan. Add remaining routes to the key-flow check and render/inspect full Arabic/RTL pages. |
| UX-03 / High | Default secondary text color failed normal-text contrast | **Partially Fixed** | The muted-foreground token still passes the 4.5:1 unit check. Shared styles now enforce a 12 px floor for selected metadata/compact helper text, a 14 px floor for form controls, and full-opacity placeholders with the muted-foreground color. Source-contract assertions pass. | The contract does not calculate rendered/blended contrast for every feature selector or custom brand, and other opacity-based microcopy remains. Check actual rendered combinations and custom branding. |
| UX-04 / High | Participant sign-out/account-switch flow needed an authenticated Clerk check | **Partially Fixed** | Participant dashboard renders the account action only in the signed-in dashboard and calls the existing Clerk sign-out action. The synthetic account-action browser test passed keyboard, responsive, feedback, and redirect-target assertions at 390 px and 1440 px. | Account switching is not configured as a separate action. Real Clerk sign-out/session invalidation and redirect were not verified because no signed-in account was used. |
| UX-05 / Medium | Functional typography was frequently too small | **Partially Fixed** | Shared app styles set a 12 px minimum for selected compact metadata/helper text, 14 px for form controls, and 16 px for mobile inputs. The readability contract test passes. | The override does not cover every feature-specific text rule or illustrative preview; other small text may remain. Check actual routes at mobile and desktop sizes. |
| UX-06 / Medium | Application submission errors hid actionable causes | **Fixed—Verified** | The unit test `application submission explains duplicate applications and keeps other failures retryable` passes; API tests validate relevant inputs and error paths. | No populated application was submitted through the UI; keep an end-to-end check for duplicate and retry outcomes in an approved fixture. |
| UX-07 / Medium | Business-team request errors were described as ongoing setup | **Fixed—Verified** | The accessibility contract test confirms a participant team-load failure has an alert and retry action, and the current source calls `query.refetch()`. | A real request failure was not induced in the authenticated participant route. |
| UX-08 / Medium | Draft dialog content could be dismissed without warning | **Partially Fixed** | Analytics attendance and KPI editors now use dirty-state dismissal guards and confirmation dialogs; the dialog fixture test passed dirty-form and pending-action safeguards. | The fixture is synthetic. Perform a route-level inventory of every remaining edit/receipt/activity dialog and verify cancel, Escape, outside-click, and pending-save behavior. |
| UX-09 / Medium | Program context was local to individual operations pages | **Partially Fixed** | A shared `useProgramSelection` helper now restores the selected program from session storage only when it is in the current authorized options; unit tests cover stale IDs and default selection. It is adopted by analytics, course management, and team assignments. | It is not a global route context and is not used by every program-scoped page; navigation/deep links do not consistently preserve program selection. |
| UX-10 / Medium | Participant dashboard stacked major tasks without section navigation | **Partially Fixed** | The dashboard now has a contextual next-action panel and an anchor index for progress, team, updates, and learning. | The page remains a long dashboard; actual scroll behavior, anchor visibility, and mobile usefulness were not visually tested. |
| UX-11 / Medium | RTL handling was incomplete in feature styles and icons | **Partially Fixed** | Arabic document direction, Arabic-Jordan date formatting in session views, explicit RTL for analytics tables/report controls, logical alignment/padding in role-access tables, and RTL arrow handling are now covered by source-contract tests. | Other feature CSS may still use physical-direction properties. No complete Arabic page was rendered, so overall alignment, typography, icon, table, and dialog direction remain visually unverified. |
| UX-12 / Medium | Session text-response controls lacked persistent individual labels | **Fixed—Verified** | The unit contract test confirms persistent associated labels and matching `id`/`htmlFor` for short answers and trainer questions. | Screen-reader announcement behavior was not checked in an actual accessibility tree. |
| UX-13 / Medium | Mobile staff navigation depended on discovering horizontal scrolling | **Partially Fixed** | The synthetic fixture checks navigation labels; the sidebar fixture verifies pinned opaque layout, scrolling, and viewport resizing. Dialog/browser fixture coverage also exercises mobile navigation labels. | Tests do not establish that the horizontal overflow affordance is discoverable to touch users on the real signed-in shell. Inspect actual mobile pages and consider a persistent cue or alternate menu. |
| UX-14 / Medium | Dense tables needed better mobile and large-cohort ergonomics | **Partially Fixed** | Assignment and role-access tables are keyboard-focusable labelled scroll regions; a unit contract test enforces that structure. | This covers selected tables, not all business/analytics tables. Pagination, very large cohorts, and touch behavior on real pages remain unverified. |
| UX-15 / Medium | Reduced-motion support was limited to one loading family | **Fixed—Verified** | A global `prefers-reduced-motion: reduce` rule is present, and the accessibility contract test checks its presence alongside mobile control sizing. | The browser fixture did not emulate reduced-motion preference or inspect the resulting motion on actual routes. |
| UX-16 / Medium | Role-preview tabs had incomplete keyboard tab behavior | **Fixed—Verified** | The role preview now uses the existing Radix `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` primitives rather than a custom selector. | The actual `/access` page and its keyboard sequence were not rendered in the browser fixture. |
| UX-17 / Medium | Parallel styling/component families increased inconsistent behavior | **Fixed—Verified** | Shared control tokens and base styles define button, icon-button, form-field, focus, and theme treatments. Workspace, analytics, API integration, communications, and grant controls now use the common contract; inconsistent field overrides were removed, and intentional compact button sizes use shared token variables. The isolated browser fixture passed computed-style, keyboard-focus, and mobile-overflow checks. | Actual signed-in feature pages and custom branding were not visually inspected. Confirm the common control treatment on authenticated pages before making further page-specific adjustments. |
| UX-18 / Medium | Trainer assignment cohorts were numeric and session-derived | **Fixed—Verified** | Trainer dashboard now supplies program `{id, name}` values filtered by the trainer’s already-authorized assigned program IDs. The role surface shows the program name, and focused web/API tests verify named options, safe fallback behavior, and exclusion of unassigned programs. | The source and tests verify the contract, but no signed-in trainer route was rendered. |
| UX-19 / Low | Invitation wording could imply email delivery that does not happen | **Fixed—Verified** | The unit test `participant invitation instructions truthfully explain account access without claiming an email was sent` passes. No invitation email was sent during this audit. | Keep the no-email limitation visible in the actual invite success state; email delivery remains a separate integration and was not tested. |
| UX-20 / Low | Arabic typography did not consistently inherit the Arabic font choice | **Partially Fixed** | `--app-font-sans` includes `Noto Sans Arabic` as a fallback, and Arabic direction/locale rules are covered by source-contract tests. | The external font import still does not load Noto Sans Arabic and some components specify Manrope directly. Arabic font availability, shaping, and visual hierarchy are not verified. |

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
| 10 | `/sessions` | Admin / project staff | Source, fixed-copy translation check, and Arabic date-locale contract; no live attendance or provider sync. |
| 11 | `/communications` | Admin | Source and API targeted-message tests; no message sent; raw English UI copy remains. |
| 12 | `/support` | Admin / project staff | Source and fixed-copy translation checks; no booking/provider action. |
| 13 | `/mentor-booking` | Admin | Source only; no provider flow executed. Calendly OAuth was excluded. |
| 14 | `/pitches` | Admin / project staff | Source and fixed-copy translation checks; no evaluation or assignment submitted. |
| 15 | `/grants` | Admin | Source and grant-ledger tests; no grant record changed. |
| 16 | `/courses` | Admin / project staff | Source and API role/release tests; no course page rendered. |
| 17 | Embedded quizzes / assessments | Admin / trainer / participant | Source plus grading/draft tests; no interactive route session. |
| 18 | Embedded discussions / live activities | Trainer / participant / admin | Source and API interaction tests; no live course/session page. |
| 19 | Embedded packages / recordings / offline materials | Authorized learners / staff | Source and link-validation tests; no media, captions, package, or offline playback checked. |
| 20 | Embedded learning progress / certificates | Participant / admin | Source and progress/certificate tests; no certificate issued, revoked, or downloaded in the UI. |
| 21 | `/analytics` | Admin | Source, Arabic translation/RTL contracts, API tests, and export-unit tests; no chart/table rendered or report exported. |
| 22 | Embedded idea validation / business plan | Accepted participant | API privacy tests and source; no participant workbook page rendered or saved. |
| 23 | Embedded peer directory / business teams | Accepted participant | API access/privacy tests and source; no directory preference changed. |
| 24 | `/team` | Admin | Source and invitation-copy test; no invitation issued. |
| 25 | `/team-assignments` | Admin / project staff | Source and API role/audit tests; no assignment changed. |
| 26 | `/access` | Admin | Source and fixed-copy translation checks; tab semantics inspected, no keyboard interaction on the actual page. |
| 27 | `/profile`, `/profiles` | Staff / Admin | Source and profile permission tests; no profile edited in the UI. |
| 28 | `/branding` | Admin | Source only; no brand changed and custom-brand contrast not measured. |
| 29 | `/api-integrations` | Admin | Source and API permission tests; no key created or revoked. |
| 30 | `/trainer`, `/trainer/courses`, `/trainer/sessions` | Trainer | Source, named program-option tests, and API program-scope test; no trainer route rendered. |
| 31 | `/mentor` | Mentor | Source only; no assigned mentor account used. |
| 32 | `/judge` | Judge | Source only; no scorecard submitted. |
| 33 | Loading / denied / failure / not-found / fallback | All | Source only; no actual auth-denial or route failure induced. |

### Viewport and language coverage

- **Synthetic browser fixtures:** dialog fixture at 1280×800, 390×844, and 320×800; participant account-action fixture at 390×844 and 1440×844; Admin sidebar fixture at 1280×640 with scroll/resize and 1440×900; shared-control fixture at 1280×800 and 390×844.
- These dimensions exercise isolated fixtures only. No authenticated page was inspected at desktop, tablet, or mobile widths.
- The dialog fixture includes an Arabic/RTL state and confirms document language/direction and localized dialog labels; no complete Arabic applicant, participant, Admin, trainer, mentor, or judge page was rendered.
- Actual Clerk sign-in/sign-out, real assistive technology, screen-reader announcements, touch interaction on live routes, and custom-brand colors remain not verified.

## Newly surfaced issue

| Severity | Issue | Evidence | Impact / recommended next action |
| --- | --- | --- | --- |
| Medium (potential performance risk) | The main web JavaScript bundle is large. | The October 15 Jusoor Vite build reports the main `index` chunk at 925.05 kB minified (257.81 kB gzip) and emits the >500 kB chunk warning. | First-load transfer/parse cost may affect slower devices or connections. Measure with a production-like network profile, then consider route-level/lazy splitting. No real load-time regression was measured in this audit. |

## Remaining limitations

1. The app's protected pages were not opened in a real signed-in browser session. Sidebar, account-action, and shared-control browser results apply only to synthetic fixtures.
2. Arabic translation and RTL tests cover selected strings/contracts; they do not prove full translation coverage or rendered Arabic typography.
3. Source-based findings about role-scoped flows are not a substitute for an authenticated end-to-end test using isolated synthetic accounts.
4. Custom branding, dense-table behavior, visual contrast of opacity-based text, and actual reduced-motion behavior need rendered-page checks.
5. The aggregate workspace build remains blocked by build-time environment requirements in the separate mockup sandbox; the Jusoor web and API artifact builds passed independently.
