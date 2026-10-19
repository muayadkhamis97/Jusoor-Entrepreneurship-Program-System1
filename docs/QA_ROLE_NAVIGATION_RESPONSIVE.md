# Responsive role navigation

## Root cause

The shared trainer/mentor/judge header rendered every action in a single
non-wrapping flex row. Its mobile rules made the action group inflexible while
the workspace clipped horizontal overflow. Multi-role links and account controls
could therefore extend outside the visible viewport.

## Fix

`artifacts/jusoor-program/src/role-workspace.css` now allows both the header and
its action group to wrap. Below the existing 700 px breakpoint, actions occupy
their own full-width row and wrap naturally. Logical flex alignment respects RTL.
The brand and action items are constrained to the available width, while logo
marks do not collapse and long account names can wrap.

This intentionally keeps all actions visible rather than adding a hidden menu.
No route, role permission, sign-out behavior, translation or OAuth behavior changed.
Spacing uses the existing design-system spacing variable and existing controls.

## Verification

`src/role-navigation.browser.test.tsx` uses actual workspace, shared-control,
role-workspace and language CSS with a synthetic multi-role header:

- Chromium layout checks at 320, 390, 700, 768, 1024 and 1440 px.
- Both LTR and RTL, including Arabic labels.
- Long brand and account-name stress cases.
- All eight representative actions remain within the viewport/header.
- No action overlap, no document horizontal overflow, no content overlap.
- Tab reaches each action in DOM order.

The browser fixture test passed all 12 viewport/direction combinations.
Frontend TypeScript and `git diff --check` passed.
The existing frontend workflow restarted successfully. A fresh 390 px `/mentor`
preview loaded the signed-out landing page without runtime errors; it does not
verify the protected header. The preview retained the existing development-key
warning.

## Limitations

The fixture does not sign in or render the production React header. It validates
the shared CSS with representative markup, not authorized role filtering,
navigation destinations or Clerk session behavior. Production fonts, real saved
branding, browser zoom, assistive technology and live authenticated pages were
not separately tested. No production changes or publishing performed.

## Authenticated phone verification — 2026-10-19

**Status: passed after fixing the trainer sessions destination.** This was one
focused authenticated pass using the same persistent tester, paused for the
destination fix and continued over the unfinished checks.

The initial read-only prerequisite check found only one coordinator and no
specialist accounts. The user then explicitly approved creating isolated
development-only test accounts and role assignments. Supported programmatic
Clerk test sign-in established four synthetic identities; real `/api/auth/me`
responses confirmed their roles from the application database. No API responses,
claims granting roles, or React markup were mocked.

The isolated setup added one active program, four active linked staff accounts,
four base program assignments and six specialist assignments: one trainer, one
mentor, one judge and one trainer-primary account with all three specialist
roles. These fixtures remain available for reproducibility. Existing accounts
and permissions were unchanged. No invitations, messages, calendar connections,
profile edits or other form submissions were performed.

### Actual protected React matrix

Each cell below covers the production header rendered by `RoleFrame`, expected
control filtering, translated labels and document direction, measured layout,
and keyboard order/focus. Viewport height was 900 px.

| Required account/header | 320 px English | 320 px Arabic | 390 px English | 390 px Arabic |
| --- | --- | --- | --- | --- |
| Single-role trainer | Pass | Pass | Pass | Pass |
| Single-role mentor | Pass | Pass | Pass | Pass |
| Single-role judge | Pass | Pass | Pass | Pass |
| Multi-role trainer | Pass | Pass | Pass | Pass |
| Multi-role mentor | Pass | Pass | Pass | Pass |
| Multi-role judge | Pass | Pass | Pass | Pass |

All 24 cells had no document horizontal overflow, overlapping actions, offscreen
elements or detected clipped content. Main content started at the header bottom.
Tab followed DOM order and every recorded focus stop had visible focus. English
used `en/ltr`; Arabic used `ar/rtl`, changed through the actual language control.

Single-role accounts showed no cross-role links. Each multi-role header showed
exactly the other two specialist workspaces. All headers included brand,
Profile, language and Sign out; trainers also showed sessions/courses links.
Mentor workspace/settings navigation was present. Operations links were absent,
as expected for these four specialist-primary accounts.

### Destination and session checks

Destination checks were performed across the focused pass; this does not claim
every destination was independently activated in every matrix cell.

- Keyboard activation of Live sessions reached `/trainer/sessions` but initially
  produced an error panel: `/api/sessions` and `/api/programs` returned 403
  because those lists are operations-only.
- `SessionsPage` now disables both operations queries in trainer mode and reads
  sessions/program names from the existing `/api/trainer/dashboard`, which
  already limits sessions to the assigned trainer and active programs. The type
  filter is applied to those returned sessions. No server permissions changed.
  The trainer empty state also no longer offers scheduling or its form.
- After the frontend restart, reopening `/trainer/sessions` rendered its real
  calendar and empty state without errors or post-fix browser 403s.
  `/api/auth/me` and `/api/trainer/dashboard` returned 200. The link's href and
  pre-fix keyboard activation established the destination; post-fix navigation
  to it was direct. Keyboard activation of Training workspace returned home.
- Keyboard activation reached `/trainer/courses`, rendered the real empty
  learning view, and its Training workspace back-link returned to `/trainer`.
- Keyboard activation reached `/mentor/settings` and rendered booking settings.
  Its brand link returned to `/mentor`. No connection or save control was used.
- All six directed multi-role cross-workspace links were keyboard-activated and
  reached their correct protected destinations. Brand activation returned to
  the active role home.
- Profile was keyboard-activated and `/profile` rendered its protected form
  after the transient access check. No fields were edited.
- Each identity keyboard-activated Sign out once and returned to the public
  landing. `/api/auth/me` then returned 401. Direct protected role URLs rendered
  public landing content with no protected role header.

All four authenticated identities received 200 from `/api/auth/me`. Trainer,
mentor and judge dashboard requests succeeded. The multi-role requests used the
production `x-jusoor-staff-role` scope; unscoped mentor/judge API probes correctly
returned 403 when defaulting to the trainer primary role. This was not a
browser-page failure.

### Evidence and remaining limits

The tester captured real protected-page screenshots for single-role trainer,
mentor and judge, all three multi-role workspaces, corrected sessions, courses,
mentor settings and the signed-out landing. Sanitized 24-cell observations are
available in the current test environment at `/tmp/role-navigation/results.json`;
that temporary file is not a durable test suite or committed credential store.

Frontend TypeScript passed after the fix. The frontend workflow restarted
cleanly. The existing Clerk development-key warning is expected.

The CSS-only browser regression remains explicitly synthetic; the signed-in
matrix above is separate manual-to-the-tester evidence, not recurring automated
coverage. This pass used the current branding and empty specialist workspaces.
It does not cover long saved branding while authenticated, populated session
filters, browser zoom, assistive technology, other browser engines, or the
presence of operations links on a coordinator/staff-primary specialist account.
No production changes or publishing performed.
