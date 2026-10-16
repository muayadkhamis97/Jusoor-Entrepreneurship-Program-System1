# Workspace build and test checks

Run the repeatable, non-mutating validation path from the workspace root:

```sh
pnpm run verify
```

It runs:

1. `pnpm run typecheck` for the TypeScript project references, artifacts, and scripts.
2. API-server tests using a deliberately unreachable local PostgreSQL URL at `127.0.0.1:1`. The test suite is expected to use stubs; the URL is not an application database and must not be changed to a development or production connection.
3. Jusoor web unit tests, excluding the browser-only certificate PDF test.
4. Production builds for the API server and Jusoor web artifact. The web build receives local `PORT`, `BASE_PATH`, and `NODE_ENV` values required by its Vite configuration.

The API tests use local HTTP servers and stub provider requests. The check does not run the application server, apply migrations, invoke Drizzle push, send email, or connect to external providers.

## Browser test availability

The browser-only certificate test is available separately:

```sh
pnpm --filter @workspace/jusoor-program run test:browser
```

It starts a local Vite server and requires Chromium, Firefox, and WebKit. In the inspected workspace, Chromium was present, while the Playwright Firefox and WebKit executables were absent. Therefore `pnpm run verify` reports this browser test as skipped rather than treating it as passed. Run it in a compatible browser-enabled environment to claim browser coverage.

## Dialog and mobile navigation browser check

Run the focused Chromium UI check with:

```sh
pnpm --filter @workspace/jusoor-program run test:ui-browser
```

The test starts a temporary local Vite server and uses a synthetic UI fixture; it does not sign in, call the API, access a database, or contact external providers. It checks dialog focus entry, Tab and Shift+Tab containment, Escape closing, focus restoration, form value retention after an error, alert-dialog cancel focus, and mobile navigation labels, active state, and horizontal overflow at a 390-pixel viewport.

In the inspected workspace, this check passed in Chromium. It verifies the shared dialog and navigation components through a local synthetic fixture; authenticated coordinator and program-staff pages were not visually verified.

## UX/UI change validation (2026-10-14)

| Check | Result | Evidence |
| --- | --- | --- |
| Jusoor web typecheck | PASS | `pnpm --filter @workspace/jusoor-program run typecheck` exited 0. |
| Jusoor web unit tests | PASS | 20 passed, 0 failed. |
| Dialog/mobile navigation browser test | PASS | 1 Chromium test passed at 390×844; it uses the synthetic fixture described above. |
| Jusoor web production build | PASS | Vite completed with exit code 0. |

The production build reports the main JavaScript chunk at 814.54 kB minified (227.72 kB gzip), above Vite’s 500 kB advisory threshold. This is a warning, not a build failure. No authenticated role page, external browser engine, database, API provider, or production runtime was exercised for this UI change.

## Dialog accessibility and Arabic coverage (2026-10-14)

The application-review dialog and shared coordinator form dialogs use the existing Radix-based accessible dialog surface. A focused Chromium fixture covers application-review heading focus, dialog name/description, Escape dismissal and focus return; shared form focus entry, Tab/Shift+Tab containment, retained values after a save error, explicit cancel focus return; and alert-dialog cancel focus and Escape behavior. The existing Arabic fallback behavior remains for dynamic staff-entered descriptions and participant-provided content.

The Arabic coverage test statically checks literal translation calls in applicant and coordinator flows, shared form labels/placeholders/help text, form-dialog titles/descriptions/errors, status options, and applicant validation messages. Example URL placeholders are intentionally kept in their original form. The language browser check confirms that switching languages updates rendered sample text and the document `lang`/`dir` attributes (`ar`/`rtl`, then `en`/`ltr`).

| Check | Result | Evidence |
| --- | --- | --- |
| Jusoor web typecheck | PASS | `pnpm --filter @workspace/jusoor-program run typecheck` exited 0. |
| Jusoor web unit tests | PASS | 22 passed, 0 failed, including two Arabic coverage/fallback checks. |
| Dialog and language browser test | PASS | 1 Chromium test passed in the synthetic local fixture at 390×844. |
| Jusoor web production build | PASS | Vite completed with exit code 0. |
| Development app startup | PASS | Restarted managed web workflow reported Vite ready; local app root returned HTTP 200. |
| `git diff --check` | PASS | No whitespace errors. |

Limitations: the browser fixture is not the signed-in application. Authenticated application-review and coordinator form pages were not directly rendered. Arabic text and RTL document state were asserted in the fixture, but a full Arabic screenshot or visual inspection of authenticated pages was not performed. No database, migration, external provider, email, production data, or deployment was used.

The successful production build still emits Vite’s non-blocking large-chunk advisory: the main JavaScript chunk is 823.61 kB minified (230.60 kB gzip), above the 500 kB threshold.

## Recorded validation result

`pnpm run verify` completed successfully in this workspace:

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace typechecks | PASS | `tsc --build` and recursive artifact/script typechecks completed with exit code 0. |
| API-server tests | PASS | 111 passed, 0 failed, using the isolated synthetic environment. |
| Jusoor web unit tests | PASS | 16 passed, 0 failed. |
| API-server production build | PASS | esbuild completed with exit code 0. |
| Jusoor web production build | PASS | Vite completed with exit code 0. |
| Browser-only certificate tests | SKIPPED | Playwright Firefox and WebKit executables were absent; Chromium was present. |

The web build emitted source-map location warnings for `tooltip.tsx` and `label.tsx`, plus a large-chunk warning for its 2.6 MB minified JavaScript bundle. These warnings did not fail the build.

The API tests ran with a synthetic `DATABASE_URL` pointed at `127.0.0.1:1` and a fake session secret. No application database, migration, Drizzle push, external provider, email, browser engine, or deployment was used. Passing these checks does not establish live database, provider, browser, or deployment behavior.

## Participant account action validation (2026-10-15)

The participant dashboard and participant profile now render “Sign out” and “Switch account” controls backed by the existing Clerk `useClerk().signOut` function. Sign-out redirects to the app base path; switching signs out and redirects to `/participant`, which the existing router sends through the participant Clerk sign-in flow. Signed-out participant routes do not render the participant pages containing these controls. No role checks or permissions were changed.

| Check | Result | Evidence |
| --- | --- | --- |
| Jusoor web typecheck | PASS | `pnpm --filter @workspace/jusoor-program run typecheck`, exit code 0. |
| Jusoor web unit tests | PASS | `pnpm --filter @workspace/jusoor-program run test:unit`: 28 passed, 0 failed. Includes redirect-base-path and Arabic label/feedback checks. |
| Participant account browser fixture | PASS | `pnpm --filter @workspace/jusoor-program exec tsx --test src/participant-account-actions.browser.test.tsx`: 1 passed, 0 failed. Chromium checked visible controls, keyboard activation, requested redirect paths, signed-out fixture visibility, retry after failure, and 390px/1440px button bounds. The fixture injects a synthetic callback; it does not authenticate with Clerk. |
| Full existing UI browser suite | FAIL — unrelated existing assertion | `pnpm --filter @workspace/jusoor-program run test:ui-browser` stopped at the staff-navigation fixture: it expected 16 coordinator links but received 19. This mismatch is outside this participant account task and was left unchanged. |
| `git diff --check` | PASS | No whitespace errors. |

**Not verified:** actual Clerk session invalidation, Clerk redirect behavior, signing in with a different email, or the signed-in participant dashboard/profile in a real browser. No production or development database was accessed; no provider, email, deployment, or publishing action was performed. Only the new account-action labels/status/error were added in Arabic (reusing the existing “Sign out” translation); this does not resolve the broader Arabic coverage finding.

## Platform-wide dialog accessibility follow-up (2026-10-15)

### Source inventory and root cause

The custom application, form, confirmation, archival/history, application-review, analytics (attendance/KPI/value/delete/report), grant receipt/correction, API-key secret/revocation, interactive-session activity, course module/material/delete, quiz-editor, and learning-package surfaces use `AccessibleDialogSurface`, which is backed by Radix Dialog. Certificate issuance preview uses the shared Radix `DialogContent` primitive with a visible `DialogTitle` and `DialogDescription`; its controlled state prevents closing while issuance is pending. The generic `CommandDialog` wrapper is present but had no application call site in the inspected source. No raw application modal overlay bypassing these patterns was found in the inspected feature files.

The shared focus cleanup previously returned without a restoration target if its opener had been removed. A nested dirty-form confirmation also exposed a timing case: the parent and child portals can unmount together while Radix is still clearing background `aria-hidden`/inert state, leaving focus on the document body or letting a late fallback override the parent opener.

The shared surface now captures the opener once when opening, restores to it when still usable, otherwise prefers the topmost remaining dialog and then a focusable main landmark. It retries briefly after unmount so portal cleanup can complete, and it preserves a successful focus restoration from a concurrently closing nested dialog. Course module/material forms now prompt before discarding changed fields. Program archival, record/course/KPI deletion, and API-key revocation cannot be dismissed with Escape while their mutation is pending, and their cancel controls are disabled until completion. Quiz-editor close/discard controls are disabled while saving.

### Verification recorded

| Check | Result | Evidence |
| --- | --- | --- |
| Dialog/mobile-navigation Chromium test | PASS | `pnpm --filter @workspace/jusoor-program run test:ui-browser`: 2 passed, 0 failed. Includes a source-contract check and synthetic browser fixture at 1280×800, 390×844 and 320×800; checks focus entry/containment/restoration, opener removal/unavailability, dirty-form keep/discard, form error retention, destructive confirmation, pending revoke, one-time synthetic-key acknowledgement, and Arabic RTL dialog text. |
| Jusoor web unit tests | PASS | `pnpm --filter @workspace/jusoor-program run test:unit`: 40 passed, 0 failed. |
| Jusoor web production build | PASS | `PORT=5000 BASE_PATH=/jusoor-program pnpm --filter @workspace/jusoor-program run build`: Vite completed. Existing dropdown-menu source-map warning and >500 kB chunk advisory remain; main bundle is 890.93 kB minified (248.41 kB gzip). |
| Jusoor web typecheck | FAIL — existing errors | `pnpm --filter @workspace/jusoor-program run typecheck` reports missing generated export `useGetStaffAssignmentHistory` and implicit `any` on its callback in `src/team-assignments.tsx`; no dialog-related errors were reported. |
| `git diff --check` | PASS | No whitespace errors. |

The browser check uses only a local synthetic fixture and Chromium; the copy/revoke examples contain synthetic values and do not call the API. It covers English and the existing Arabic discard prompt at a mobile viewport, plus desktop bounds. Authenticated dialogs were not rendered, and no screen reader was used. Actual signed-in Admin/participant behavior, other browser engines, external services, email, databases, production data, publishing, and deployment were not tested.

The managed `artifacts/jusoor-program: web` workflow restarted successfully and Vite reported ready. A preview request for `/courses` rendered the public signed-out landing page because the browser has no authenticated staff session; therefore no authenticated dialog page was visually verified. The screenshot browser console showed the React DevTools information message and Clerk development-key warning, with no dialog/runtime error.

## Business-targeted in-app communications (2026-10-15)

The Admin Communications page can now publish or schedule an in-app message for all cohorts, one cohort, or one business team. Business choices are limited to the selected program. Every accepted participant linked to that same program/business can see the message; participants from another business or program are denied both listing and read-receipt access. Read state remains per participant. No email or external messaging provider is used.

The schema change is additive: a nullable business target, a restrictive business foreign key, a check requiring a program for business-targeted messages, and an index for business/schedule lookups. The migration is intentionally **not applied**. Existing all-cohort/cohort messages continue to use the legacy schema; if the column is absent, existing reads fall back to the old projection and a business-specific send returns a clear unavailable response rather than broadening its audience. Apply the migration through the project's approved database migration process before enabling business-targeted sends against a live database.

| Check | Result | Evidence |
| --- | --- | --- |
| API tests | PASS | `pnpm run test:api`: 142 passed, 0 failed. Uses a synthetic database URL at `127.0.0.1:1`; it does not connect to an application database. |
| API typecheck and production build | PASS | `pnpm --filter @workspace/api-server run typecheck` and `pnpm --filter @workspace/api-server run build` completed with exit code 0. |
| Web typecheck | PASS | `pnpm --filter @workspace/jusoor-program run typecheck` completed with exit code 0. |
| Web unit tests | PASS | `pnpm --filter @workspace/jusoor-program run test:unit`: 44 passed, 0 failed, including message target selection and Arabic translation coverage. |
| Web production build | PASS | `PORT=5000 BASE_PATH=/jusoor-program pnpm --filter @workspace/jusoor-program run build` completed. Existing dropdown source-map warning and >500 kB chunk advisory remain; the main bundle is 893.89 kB minified (249.13 kB gzip). |
| Migration review test | PASS | API test asserts additive column/FK/check/index and transaction markers and rejects destructive SQL tokens. This is a static check, not execution against PostgreSQL. |
| `git diff --check` | PASS | No whitespace errors. |

**Not verified:** the migration was not run; no development or production database was accessed. Authenticated Admin/participant browser behavior, visual rendering of the message form, email delivery, external providers, production data, publishing, and deployment were not tested. The preview browser has no signed-in Admin session, so it cannot render the protected Communications page.

## Signed-in dialog workflow QA (2026-10-16)

The requested authenticated verification could not be completed safely: no authorized non-production Clerk test session or test account was available, and the API Server workflow was not running. No authentication bypass, test identity fabrication, or production data was used.

| Real route | Expected role and dialog workflow | Desktop 1280×800 | Mobile 390×844 | Result |
| --- | --- | --- | --- | --- |
| `/applications` | Admin — review application; protect unsaved status/notes and pending review | Direct local Vite visit reached the app error boundary before the review list/dialog; the proxied app had no signed-in session | Same error boundary before the review list/dialog | Blocked; no application record or real review dialog was available |
| `/analytics` | Admin — attendance, KPI/value/report, destructive KPI removal, certificate preview | Proxied preview showed the public signed-out landing page; direct local Vite visit reached the app error boundary | Direct local Vite visit reached the same error boundary | Blocked; no real analytics or certificate dialog was available |
| `/grants` | Admin — grant receipt and correction | Direct local Vite visit reached the app error boundary; no grant data was loaded | Same error boundary | Blocked; no real grant dialog was available |
| `/api-integrations` | Admin — acknowledge one-time key and safely confirm revocation | Direct local Vite visit reached the app error boundary; no key data was loaded | Same error boundary | Blocked; no real key or destructive dialog was available |
| `/courses` | Admin / Program Staff — course module/material editor, quiz editor and deletion (staff is scheduling-only) | Direct local Vite visit reached the app error boundary | Same error boundary | Blocked; no real course dialog was available |
| `/sessions` | Admin / Program Staff / assigned trainer — session activity editor | Direct local Vite visit reached the app error boundary | Same error boundary | Blocked; no real session dialog was available |
| `/participant` | Participant — own progress and learning-package player | Direct local Vite visit reached the app error boundary; the signed-out proxy did not provide an authorized participant session | Same error boundary | Blocked; no real participant package dialog was available |
| `/participant/profile` | Participant — own profile and account actions | Direct local Vite visit reached the app error boundary; no participant session was available | Same error boundary | Blocked; no real participant page/dialog was available |

The local route probe visited each path at both listed viewport sizes. In that direct Vite run, each path displayed the error-boundary message `Cannot read properties of undefined (reading 'slice')`; the cause was not isolated because the API Server workflow was not running. A separate screenshot of the proxied `/analytics` route at 1280×800 showed the public signed-out landing page, not analytics. These results are route-access blockers, not evidence that any real dialog passed or failed.

| Check | Result | Evidence |
| --- | --- | --- |
| Existing dialog Chromium suite | PASS | `pnpm --filter @workspace/jusoor-program run test:ui-browser`: 2 passed, 0 failed. It exercises the synthetic fixture at desktop and mobile sizes and checks source-level policies at production dialog call sites; it does not authenticate or call the API. |
| Signed-in route dialog verification | BLOCKED | No authorized non-production test session was available. The web workflow ran, but the API Server workflow was not started and no route dialog could be opened. |
| Production data/authentication safety | PASS | No production URL/data was used; no credentials were accessed, no auth bypass was added, and no application records or destructive actions were changed. |

Synthetic coverage remains useful but is not a substitute for route-level evidence. The browser fixture verifies representative accessible names, focus entry/containment/return, retained form values after errors, dirty-form keep/discard, destructive confirmation, pending revocation protection, one-time-secret acknowledgement, and responsive bounds. The actual `/applications`, `/analytics`, `/grants`, `/api-integrations`, `/courses`, `/sessions`, `/participant`, and `/participant/profile` dialog workflows remain unverified until an authorized non-production session and a functioning non-production API are available.
