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
