# Dependency security remediation — 2026-10-18

## Result: partially resolved; one upstream blocker remains

The initial `pnpm audit --json` reported eight advisories: one critical, four high, and three moderate. The final audit reports **one high**, zero critical, and zero moderate (exit status 1). This is not a clean security audit.

### Resolved findings

| Dependency | Installed target | Evidence |
| --- | --- | --- |
| `proxy-addr` | 2.0.8 | Updated direct parent Express to 5.3.0; lockfile and dependency tree confirm the patched child. |
| `source-map-js` | 1.2.2 | Targeted override and lockfile; absent from final audit. |
| `brace-expansion` (three advisories) | 5.0.12 | Targeted override and lockfile; all three absent from final audit. |
| `fast-uri` | 3.1.8 | Targeted override stays on the existing major; absent from final audit. |
| `postcss-selector-parser` | 7.1.6 | Typography parent still pins an affected version, so an override selects the patched target; all frontend builds passed. |

The workspace's 1440-minute minimum release age, existing exclusions, and platform overrides remain intact. Security override targets are exact versions rather than unbounded minimum ranges.

### Blocked: `braces` stack-exhaustion denial of service

- Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- Installed version: 3.0.3; advisory affected range: `<=3.0.3`. Registry audit reports no patched version (`<0.0.0`).
- `pnpm why -r` identifies `http-proxy-middleware@4.2.0 -> micromatch@4.0.8 -> braces@3.0.3` in the API and `fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3` in the preview tooling. These parents and micromatch were already the latest registry versions inspected.
- Source inspection: the authentication proxy does not configure glob path filters; preview discovery supplies a fixed, source-controlled pattern. This narrows the apparent exposure but **does not establish that the advisory is fixed or prove exploitability is impossible**. No exploit test was performed.
- No advisory suppression, fabricated package version, unreviewed fork, or custom authentication-proxy replacement was introduced.
- Next action: adopt a supported upstream fix when available, or separately review and test replacement of both dependency paths. This finding remains unresolved.

## Automated verification

- `pnpm install`: passed. Existing Clerk/React peer-range warnings remain; no unrelated React upgrade was attempted.
- `pnpm run typecheck`: passed across shared libraries and configured artifact/script checks.
- `pnpm run test`: API **204 passed**, web **58 passed**; zero failures and zero skipped tests. API tests used the existing validation script with a dummy local database URL, not a live database.
- `pnpm run build:artifacts`: API and application production bundles passed.
- `PORT=19334 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/program-editorial run build`: passed.
- `PORT=19335 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/mockup-sandbox run build`: passed.
- Non-failing application build warnings: dropdown-menu source-map location and large chunks. These were not changed in this dependency-only remediation.
- `git diff --check`: passed.
- API and application development workflows restarted successfully. Logs showed API listening on port 8080 and Vite ready.

## Visual evidence and limits

A 1280×720 screenshot of the public development landing page rendered normally after restart. This is not an authenticated sign-in, account-access, or production verification. No browser journey tests, production changes, schema operations, email sends, or deployment were performed.
