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
