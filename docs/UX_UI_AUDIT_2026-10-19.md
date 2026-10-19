# UX/UI audit — 19 October 2026

## Summary

The public entry page is readable at a 390 px phone width. Current frontend
unit checks pass, including the recent mentor connection and Settings changes.
The largest remaining source-based risks are signed-in mobile navigation and
unsaved mentor settings. This is a targeted audit, not a claim of platform-wide
accessibility compliance or a completed authenticated usability test.

No screens, APIs, database records, OAuth configuration or production settings
were changed during this audit.

## Method and confidence

- Direct visual check: development `/`, 390 × 844 viewport, full-page capture.
  Text and entry actions fit visibly; no obvious clipping or horizontal overflow.
  This does not measure DOM scroll width, contrast ratios or keyboard behavior.
- Current source review: public landing, shared staff shell, mentor/trainer/judge
  role surfaces, mentor Settings, communications, profile form, shared controls,
  responsive styles and language rules.
- Ran `pnpm --filter @workspace/jusoor-program run test:unit`:
  **78 passed, 0 failed, 0 skipped**.
- The unit suite includes logic and source-contract tests. Passing these does
  not prove actual layout, screen-reader announcements or end-to-end persistence.
- The fresh preview console showed normal development output and the existing
  Clerk development-key warning, without a runtime exception.
- Supplied screenshots inform context, but are historical, not current visual
  verification. No signed-in page was accessed.

## Findings

### AUD-01 — High priority: role header can outgrow narrow screens

**Follow-up status:** Remediated in development. The header/action rows now wrap
instead of forcing actions outside the viewport. A CSS layout fixture passed
12 width/direction combinations and keyboard reachability checks.
See [responsive role navigation QA](QA_ROLE_NAVIGATION_RESPONSIVE.md). Actual
signed-in page verification remains outstanding. The evidence below describes
the pre-fix state.

**Evidence:** `src/role-surfaces.tsx`, `RoleFrame`, renders trainer links, other
role links, operations link, Profile, role badge, language switch and Sign out
inside one `.role-top-actions` row. `src/role-workspace.css` keeps this row
non-wrapping with `flex: 0 0 auto` at mobile sizes; the enclosing workspace clips
horizontal overflow. Hiding the user name does not reduce the number of actions.

**Impact:** Some actions may become cramped or inaccessible, especially for
multi-role accounts, longer brand names and Arabic. **Source-based risk, not
reproduced in an authenticated viewport.**

**Recommendation:** Use a compact accessible menu at narrow widths. Keep the
current workspace, language control and account actions discoverable. Verify
320/390/768 px, Arabic and multi-role accounts with keyboard and touch.

### AUD-02 — Medium priority: small role-page labels remain outside readability floor

**Follow-up status:** Remediated in development with scoped shared-theme sizes:
14 px form labels/helper copy and 12 px compact metadata, retaining 16 px phone
inputs. Computed-style fixture checks passed at three widths in English and
Arabic. See [role text readability QA](QA_ROLE_TEXT_READABILITY.md). Actual
signed-in page verification remains outstanding. The evidence below describes
the pre-fix state.

**Evidence:** `src/role-workspace.css` sets booking helper text to 9 px,
role form labels to 10 px and role dates to 10 px. The desktop readability
floor in `src/index.css` is scoped to `.workspace` and `.intake-page`, not
the `.role-workspace` root used by mentor, trainer and judge pages.

**Impact:** Booking instructions, privacy details and dates are harder to read.
Mobile role inputs already have a 16 px rule; that does not enlarge helper text.
These are declared source sizes, not a complete computed-style measurement.

**Recommendation:** Apply shared design-system text tokens consistently to role
labels and helper copy. Preserve contrast and verify browser zoom and Arabic
line height rather than merely increasing headings.

### AUD-03 — Medium priority: mentor settings errors are not actionable enough

**Follow-up status:** Remediated in development. The frontend now maps known URL,
provider-connection, access, rate-limit, service and network failures to translated
guidance. URL errors are associated with the field and focus it. Tests and
limitations: [booking-save error QA](QA_MENTOR_BOOKING_SAVE_ERRORS.md).
The evidence below describes the pre-fix behavior; signed-in browser verification
remains outstanding.

**Evidence:** `src/role-surfaces.tsx`, `saveBookingSettings.isError`, always shows
the same message about connection and schedule validity. It does not distinguish
a rejected URL, expired connection, authorization failure or server outage.

**Impact:** A valid connected account can appear to be the user's mistake.
The page offers no field-associated explanation for correcting the URL.

**Recommendation:** Map safe structured API errors to specific guidance, associate
URL errors using `aria-invalid` and `aria-describedby`, and retain a generic
retryable message for unknown failures. Do not expose tokens or raw server errors.

### AUD-04 — Medium priority: unsaved mentor settings can disappear

**Evidence:** `MentorDashboardPage` holds provider and URL edits only in component
state. Settings/workspace links navigate without a dirty-state guard, and the
router keys the page by location, causing a new instance on navigation.
The dashboard-sync effect also copies server provider/URL changes into local
state when those values change.

**Impact:** Navigating away loses an edited schedule URL without warning.
An externally changed server value can also replace an in-progress local draft.
No intentional browser data-loss test was performed.

**Recommendation:** Track dirty state, confirm leaving when edits are unsaved,
and do not overwrite dirty inputs on refetch. Clear dirty state only after a
successful save or an explicit discard.

### AUD-05 — Medium priority: mentor engagement feedback is shared across cards

**Evidence:** `MentorDashboardPage` uses one `useUpdateAssignedMentoring`
mutation. Every engagement card reads that same mutation's `isError` and
`isPending`.

**Impact:** A failure on one engagement can display the same error on unrelated
cards, while all cards show saving/disabled state for one request. Error ownership
is unclear when several founder engagements are visible.

**Recommendation:** Track the submitted engagement ID and show pending/error/
success state beside the affected card, while retaining duplicate-submit
protection for that request.

### AUD-06 — Medium priority: several wide tables have no explicit keyboard scroll affordance

**Evidence:** `src/App.tsx` renders ordinary `div.table-wrap` containers for mentor
status, staff access and participant invitation tables without labelled,
focusable scroll-region attributes. `src/workspace.css` uses horizontal overflow
and sets tables to a 660 px minimum at narrow widths.

**Impact:** Discovering and operating horizontal scrolling may be difficult,
especially with a keyboard or assistive technology. Browser default scroll
focusability varies, so this is not a claim that all keyboards are blocked.

**Recommendation:** Reuse the labelled focusable scroll-region pattern already
used by selected assignment tables, add a visible scroll cue, and assess whether
the most important mobile table columns should be summarized in cards.

## Improvements retained / not current defects

- Connected mentors now get a compact dashboard status with Settings navigation;
  the setup form remains available in Settings. Logic/source tests pass; actual
  signed-in presentation is not verified.
- Communications explicitly distinguishes a successful empty response
  (“No messages have been sent yet”) from a failed query and provides retry.
  Replacing real request failures with an empty state would be misleading.
- The profile form has persistent field labels, a read-only sign-in-email
  explanation, and an alert for form errors.
- Shared focus-visible and reduced-motion rules exist.
- Current `index.html` loads Noto Sans Arabic. The older re-audit's statement
  that the Arabic font is not loaded is no longer current.
- Neutral-brand regression tests pass for their scanned surfaces. They are not
  proof that all persisted program names or user-entered text were reviewed.

## Historical report corrections

`UX_UI_PLATFORM_REAUDIT.md` is a historical snapshot. In addition to Arabic font
loading, its invitation finding describes a no-email workflow that is no longer
current: the present unit suite expects truthful email-delivery/expiry wording.
No email was sent or delivery verified during this audit. Do not interpret the
old report's “Fixed—Verified” wording as current authenticated browser evidence.

## Recommended order

1. Prevent unsaved Settings loss and make mobile role navigation reachable.
2. Improve booking error specificity and per-engagement feedback.
3. Standardize role-page small text and wide-table keyboard access.
4. Verify the changed flows signed in, at desktop/phone widths and in Arabic,
   including reload persistence and failed-save recovery.

## Remaining verification limitations

No signed-in admin, mentor, participant, trainer or judge journey was exercised.
No live OAuth operations, saves, invitations, emails, destructive actions,
production access or publishing were performed. Full contrast measurement,
screen-reader output, keyboard tab order, actual touch scrolling, Arabic rendered
pages and large populated datasets remain unverified. This report does not audit
every course, grant, analytics or certificate workflow.
