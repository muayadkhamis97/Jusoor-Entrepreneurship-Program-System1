# Mentor, trainer and judge text readability

## Root cause

Legacy role-workspace styles declared form labels at 10 px and booking/helper
copy at 9 px. Existing index-level readability rules covered selected role dates
and metadata but did not cover all field labels, booking hints or guidance.

## Fix

Scoped overrides in `artifacts/jusoor-program/src/role-workspace.css` use the
Program Editorial theme's `--text-sm` and `--text-xs` sizes and associated
line-height tokens:

- Form labels, legends, booking hints, feedback, provider details and descriptive
  metadata use the 14 px small-text scale.
- Compact counts, dates, section labels and account metadata use the 12 px scale.
- Helper copy can wrap rather than overflow.
- Arabic form/guidance text receives extra line-height headroom.
- Existing 16 px mobile input rules remain unchanged.

The changes are scoped to `.role-workspace`; participant and admin screens,
headings, content, data, permissions and provider configuration are unchanged.
No new visual primitives or hardcoded color/font values were introduced.

## Verification

`src/role-readability.browser.test.tsx` uses production CSS and shared theme size
tokens with representative form/booking, trainer metadata and judge feedback
markup. Chromium computed-style checks passed for English/LTR and Arabic/RTL at
320, 390 and 1280 px:

- Helpers and labels at least 14 px, line height at least 1.4 times font size.
- Compact metadata at least 12 px.
- Inputs at least 16 px on phones, 14 px on desktop.
- No document horizontal overflow.
- A participant selector outside the role root retains its previous size.

The role-navigation browser fixture and eight existing accessibility-contract
unit checks also passed. Frontend TypeScript and `git diff --check` passed.
The frontend workflow restarted successfully. A fresh phone-sized Settings
preview displayed the signed-out landing page without runtime errors; it did
not expose the protected role page. The existing Clerk development-key warning
remains.

## Limits

These are synthetic markup/layout checks, not authenticated route tests. They
do not load external production fonts or measure every rendered contrast pair,
screen-reader output, browser zoom or all content combinations.
No production access, emails, migrations or publishing performed.
