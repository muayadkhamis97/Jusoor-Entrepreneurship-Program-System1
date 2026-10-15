# UX/UI audit remediation checklist

**Source:** `docs/UX_UI_PLATFORM_AUDIT.md`  
**Scope:** Frontend-only remediation for UX-01 through UX-20. Preserve current authentication, role permissions, program scoping, data integrity, and user-authored content. No database, provider, email, production, or deployment actions.

| Finding | Area | Planned remediation | Verification | Status |
|---|---|---|---|---|
| UX-01 High | Custom dialogs | Reuse the shared Radix dialog surface for application review, analytics, grant, API-key, activity, and package dialogs; preserve pending/secret/destructive safeguards. | Generic Chromium dialog fixture passes focus entry, containment, Escape, restoration and form-retention assertions. Per-route signed-in flows not browser-tested. | Implemented in source; per-route browser coverage remains |
| UX-02 High | Arabic coverage | Add audited functional translations and extend static key coverage while preserving dynamic values and English fallback. | Arabic key coverage and fallback tests pass. Full signed-in Arabic rendering not verified. | Implemented; visual review remains |
| UX-03 High | Contrast | Darken shared secondary text and verify default normal-text combinations. | Automated sRGB calculation passes 4.5:1 for muted text on default background and card; custom brand palettes not scanned. | Implemented for default theme |
| UX-04 High | Participant account actions | Keep Clerk-backed participant sign-out/account-switch controls. | `participant-account-actions.browser.test.tsx`: 1 passed; live Clerk session and signed-in UI remain unverified. | Implemented; live auth not verified |
| UX-05 Medium | Functional typography | Establish a minimum body/label/helper scale and readable mobile form controls. | CSS contract test checks the 16px mobile control rule and functional minimums. Full viewport readability not verified. | Implemented in source |
| UX-06 Medium | Application errors | Distinguish duplicate, closed/unavailable, validation and temporary submission errors while preserving entered values. | Unit tests cover 409, closed-message, 404, 400/422 and fallback mapping. No live submission was made. | Implemented in source |
| UX-07 Medium | Business-team errors | Separate request failure from empty/pending state and provide retry. | Static regression test checks alert semantics and retry action; no live failing API response was triggered. | Implemented in source |
| UX-08 Medium | Draft dismissal | Guard dirty/pending shared forms and application-review, grant receipt, session activity and analytics attendance/KPI/value editors. Report-builder selections persist in component state when closed. | Source guards are present; generic dialog fixture passes. Authenticated route-specific draft flows not browser-tested. | Implemented in source; route-level browser coverage remains |
| UX-09 Medium | Program context | Preserve program selection on analytics, course, and team-assignment pages, validating saved IDs against each authorized option set. | Program-selection unit tests cover unauthorized saved-ID rejection and default-first behavior. Not unified across every destination or URL-tested. | Partially implemented |
| UX-10 Medium | Participant dashboard | Add a next-action summary and in-page section navigation without removing dashboard content. | Helper tests cover accepted and non-accepted paths. Authenticated mobile/desktop anchor behavior not browser-tested. | Implemented in source |
| UX-11 Medium | RTL/directional UI | Add RTL alignment overrides, directional icon corrections, and Arabic heading fallbacks. | CSS/source checks pass. Complete Arabic/RTL visual review is not verified. | Partially implemented |
| UX-12 Medium | Session responses | Add persistent labels linked to each short-answer and participant-question textarea. | Source contract test checks label/control associations; live participant DOM not browser-tested. | Implemented in source |
| UX-13 Medium | Mobile staff navigation | Add a compact all-pages menu while retaining existing route links. | Chromium fixture passes route count, labels in English/Arabic, active state, keyboard opening, Escape and focus restoration. | Implemented; fixture-tested |
| UX-14 Medium | Dense tables | Improve horizontal-scroll discoverability and keyboard access without removing data or filters. | Shared scrollbars/touch styling added; application, role-access and assignment tables expose labelled focusable regions. Not every table wrapper or viewport width has a browser assertion. | Partially implemented |
| UX-15 Medium | Reduced motion | Reduce nonessential motion under the system preference. | CSS contract test checks the reduced-motion rule; browser emulation not run. | Implemented in source |
| UX-16 Medium | Role preview tabs | Use the installed Radix Tabs primitives for tab semantics and keyboard behavior. | Source confirms Radix tabs and tab panels; dedicated Arrow/Home/End browser interaction was not run. | Implemented in source |
| UX-17 Medium | Component consistency | Reuse shared dialog and tab primitives without broad redesign. | Shared dialog and Radix tabs adopted; buttons/fields/status patterns remain mixed across feature surfaces. | Partially implemented |
| UX-18 Medium | Trainer cohort choices | Show program names only from an authorized program/cohort response; do not broaden trainer access. | Source review found trainer choices derived from session `programId` values; the dashboard response does not provide a complete authorized named-program list. No broader program listing was used. | Blocked on authorized API contract |
| UX-19 Low | Invitation wording | Make participant invitation success truthful and provide copyable sign-in instructions without sending email. | Unit test verifies the email and no-email wording. Clipboard interaction was not browser-tested; no email was sent. | Implemented in source |
| UX-20 Low | Arabic typography | Add local Arabic font fallbacks and heading spacing without remote font dependencies. | CSS contract checks the Arabic fallback stack and line-height. Arabic glyphs were not visually inspected. | Implemented in source; visual review remains |

## Baseline evidence before remediation

- Jusoor unit tests: 28 passed, 0 failed.
- Focused Admin-sidebar Chromium fixture: 1 passed, 0 failed. The fixture uses production sidebar CSS/navigation data but is not the authenticated app shell.
- Participant account-action Chromium fixture: 1 passed, 0 failed.
- Existing dialog/mobile-navigation Chromium fixture: failed before remediation because it expected 16 coordinator destinations but the current navigation contains 19.
- Jusoor typecheck: failed before remediation with two errors in `src/team-assignments.tsx`: missing generated API export `useGetStaffAssignmentHistory` and implicit `any` for the assignment-history callback. Do not attribute these baseline errors to UX changes unless later evidence changes.
- No production application, database, identity provider, external service, email, or deployment was accessed.

## Verification after remediation

Recorded 2026-10-15:

- `pnpm --filter @workspace/jusoor-program run test:unit`: **39 passed, 0 failed**.
- `pnpm --filter @workspace/jusoor-program run test:ui-browser`: **1 passed, 0 failed**. This fixture exercises shared-dialog keyboard/focus behavior and mobile staff-navigation routes; it is not an authenticated application session.
- `pnpm --filter @workspace/jusoor-program exec tsx --test src/participant-account-actions.browser.test.tsx`: **1 passed, 0 failed** in its synthetic account-action fixture.
- `pnpm --filter @workspace/jusoor-program run typecheck`: **failed with the same two pre-existing assignment-history errors** recorded in the baseline: missing generated export `useGetStaffAssignmentHistory` and implicit `any` for the history callback in `src/team-assignments.tsx`. No other errors were reported.
- `PORT=5000 BASE_PATH=/jusoor-program pnpm --filter @workspace/jusoor-program run build`: **succeeded**. Vite reported an existing dropdown-menu source-map warning and large-chunk warnings.
- `git diff --check`: **passed**.
- A 1440×900 preview request for `/support` rendered the public landing page because the browser had no authenticated staff session. Admin sidebar, protected dialogs, participant dashboard, and Arabic authenticated pages are therefore **not visually verified**. Browser console showed only the Clerk development-key warning.
- Existing development API logs also show `GET /api/profile` returning HTTP 500 while querying `jusoor_user_profiles`. The underlying cause was not determined; no database inspection or modification was performed. Treat profile flows as a runtime blocker until the authorized database/schema owner investigates.
- No production data, database operations, external-provider calls, email, publishing, or deployment were performed.
