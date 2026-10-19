# Dialog scroll-lock runtime fix — 2026-10-19

## Observed failure and diagnosis

- The development browser reported `Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.`
- The Vite source map traced the exception to `react-remove-scroll` 2.7.2, `handleScroll`, called by the Radix dialog scroll-lock side effect.
- That handler read computed styles from its boundary without checking that the boundary was still an Element. Its caller obtains the boundary from a mutable lock ref. A cleared ref therefore raises the observed exception rather than safely handling an in-flight event.
- A regression test against the installed package reproduced the invalid-boundary failure before the fix: **1 passed, 1 failed**. The original authenticated interaction and specific triggering dialog were not reproduced; teardown is the lifecycle case covered by the regression test, not a recorded inspection of the original ref value.

## Fix

- Added a tracked pnpm patch in `patches/react-remove-scroll@2.7.2.patch`, registered in `pnpm-workspace.yaml` and `pnpm-lock.yaml`.
- All three distributed JavaScript entry variants now reject a non-Element boundary before querying its styles. The handler conservatively blocks that scroll event, retaining modal background-scroll protection.
- Valid boundaries continue through the existing scroll calculations. No dialogs were made non-modal, no browser API was globally replaced, and focus trapping, dismissal rules, routes, forms, authentication, and permissions were not changed.
- Restored package-manager formatting churn so existing workspace security settings, comments, and dependency versions remain unchanged.

## Automated verification

- `pnpm --filter @workspace/jusoor-program run test:unit`: **71 passed, 0 failed**. Includes cleared/non-Element boundaries, normal in-bound scrolling, and overscroll blocking.
- `pnpm --filter @workspace/jusoor-program run typecheck`: **passed**, exit 0.
- `git diff --check`: **passed**, exit 0.

## Browser verification

- `pnpm --filter @workspace/jusoor-program run test:ui-browser`: **2 passed, 0 failed**, approximately 85 seconds.
- This used a local synthetic fixture with the production dialog component. The test covers dialog opening, a wheel event in a scrollable dialog, close/Escape behavior, focus restoration, retained form state, nested confirmation flows, and mobile staff navigation. It now fails on any browser `pageerror`; none were recorded.
- The fixture blocks requests other than local GET requests. It does not sign in, query application records, send email, or contact providers.
- Restarted the managed web workflow. A fresh 1280×800 preview screenshot rendered the public landing page without the runtime-error overlay; its browser log contained no runtime exception.

## Remaining limitations and safety

- Actual signed-in page behavior and the original triggering interaction: **not verified**.
- Published build/Publish validation and production behavior: **not verified** in this fix.
- This is a narrow dependency patch, not an upstream release. Keep its regression tests when upgrading the dialog/scroll-lock dependencies.
- No database access, schema changes, migration, email, production modification, publishing, or deployment was performed.
