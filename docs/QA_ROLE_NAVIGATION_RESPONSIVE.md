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
