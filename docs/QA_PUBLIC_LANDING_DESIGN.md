# Public landing design integration

## Scope

Applied the selected canvas landing composition to the existing web artifact's
signed-out landing page, with the approved Program Editorial typography revision.
The canvas source remains available as a reference. This is not a dashboard-wide
theme migration.

Preserved:
- Existing `/apply`, `/participant`, and `/sign-in` destinations and router.
- Existing authentication, role permissions, branding lookup, logo, and language
  preference behavior.
- Configured brand name rather than the prototype's historical brand copy.

Implemented the centered serif hero, terracotta italic emphasis, warm paper grain,
teal primary action, ruled three-column entry panel, language pill, privacy note,
and mobile stacked layout. Footer text is neutral. No mock confirmation dialogs
were carried into the app: the actions use the existing real routes.

## Theme boundary

The landing imports Button, Typography and PaperSurface directly from the shared
package. A reusable scoped-theme helper derives custom properties from exported
tokens; no palette values are copied into the app. Tailwind registers the shared
component source. Existing dashboard theme variables and local components remain
unchanged because migrating those screens was not requested.

## Automated evidence

- `pnpm --filter @workspace/jusoor-program exec tsx --test src/public-landing.test.tsx`:
  **4 passed, 0 failed**. These are source-contract/token checks, not end-to-end
  browser journeys: retained routes, configurable branding and shared primitives,
  complete literal Arabic translation keys/RTL branch, and scoped token values.
- `pnpm --filter @workspace/jusoor-program run typecheck`: **passed**.
- `pnpm --filter @workspace/program-editorial run typecheck`: **passed**.
- `PORT=19333 BASE_PATH=/ pnpm --filter @workspace/jusoor-program run build`:
  **passed**. Vite reports a source-map warning in the existing dropdown-menu
  module and chunks larger than 500 kB; these were not changed in this task.
- Package install completed without new downloaded packages. Existing Clerk /
  React peer-version warnings remain; dependency upgrades are outside this scope.

## Preview evidence

The existing web workflow was restarted and reported Vite ready.
Inspected actual signed-out app screenshots at:
- Desktop: **1440 × 1000** — hero, three-column panel, header and footer visible.
- Mobile: **390 × 844**, full page — vertically stacked entry panel, readable
  controls, and no visible horizontal clipping.

The screenshots showed the brand returned by the development branding API, not
a hardcoded prototype name. Browser logs showed Vite connection messages and the
expected Clerk development-key warning, with no page errors.

## Not verified / boundaries

- No sign-in, application submission, account permissions, or signed-in dashboard
  journeys were exercised. Route preservation is source-checked.
- Arabic strings and RTL wiring were checked in code/tests, but an Arabic-rendered
  app screenshot was not inspected in this task.
- No physical-device, Safari, or screen-reader testing.
- No database inspection/migration, provider configuration, email sending, or
  publishing/deployment was performed as part of this design integration.
