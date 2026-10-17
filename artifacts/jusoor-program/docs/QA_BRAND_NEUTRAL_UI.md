# Brand-neutral platform copy — QA

**Checked:** 2026-10-17

## Changes

- Replaced fixed organization wording in the public entry page, admin and participant navigation, application copy, role-access view, course surfaces, profile screens, branding instructions, certificate output, reports, and user-facing API errors.
- Kept user-selected custom brand names available in brand-aware surfaces. Existing saved names that contain the retired identity are presented as “Program Hub”; new branding updates with that identity are rejected.
- Updated certificate/report download names and the API documentation's product/security labels.
- New integration keys use a neutral visible prefix. The parser still accepts previously issued keys, and their displayed prefixes are normalized without changing stored credentials.
- Existing browser storage keys and provider state/cookie identifiers were retained for compatibility; these are internal identifiers, not rendered copy.
- No database rows were edited or migrated. The branding API returns a normalized display name for older saved settings.

## Verification

### Automated

- `pnpm --filter @workspace/jusoor-program run typecheck` — passed.
- `pnpm --filter @workspace/jusoor-program run test:unit` — **57 passed, 0 failed**. Includes the source scan for fixed retired-brand text in the app, role, intake, profile, branding, and other core user-facing surfaces, plus neutral fallback/configured-brand assertions.
- `pnpm --filter @workspace/jusoor-program exec tsx --test src/admin-sidebar-layout.browser.test.tsx src/arabic-role-workspaces.browser.test.tsx src/program-controls.browser.test.tsx` — **3 passed, 0 failed**. These exercise the admin sidebar, role-access visual previews, and branding-aware controls in isolated browser fixtures; they are not authenticated app sessions.

### Browser checks and screenshots

Screenshots are saved alongside this document:

- [Public landing — desktop, 1440×1000](qa-brand-neutral-landing-desktop.jpg)
- [Public landing — mobile, 390×844](qa-brand-neutral-landing-mobile.jpg)
- [Participant profile URL while signed out — mobile, 390×844](qa-brand-neutral-participant-signin-gate-mobile.jpg)
- [Role-access matrix fixture — desktop, 1440×1000](qa-brand-neutral-access-matrix-desktop.jpg)
- [Role-access matrix fixture — mobile, 390×844](qa-brand-neutral-access-matrix-mobile.jpg)

The live preview showed neutral “Program Hub” labels on the public page at both widths. Visiting `/participant/profile` while signed out showed the Clerk sign-in gate, not a profile screen. The browser was not authenticated, so no live admin, participant, trainer, mentor, judge, profile-editor, or branding-editor screen was visually inspected.

The role-access matrix screenshots are actual browser captures of a clearly labeled static preview fixture (“Preview only”). Its browser test checks the coordinator/admin, staff, participant, trainer, mentor, and judge workspace preview states at 390px, including brand-neutral role headings and no horizontal overflow. The admin sidebar browser test covers its fixture at 1280px and 1440px. The branding-controls browser test checks themed controls and preview contrast at desktop and narrow mobile widths. These fixture checks do not establish how an authenticated user’s live, data-backed workspace or profile/branding editor looks.

After both existing workflows were started, the live page screenshots had no failed API requests or application-error entries in the browser console. The remaining browser messages were the Clerk development-instance notice and React DevTools suggestion. The screenshots show the neutral fallback, not a verified custom saved brand.

### Source-level checks (not browser inspection)

- Core UI source assertions found no fixed retired organization name in the specified user-facing app, role, intake, profile, branding, and related files.
- Brand helpers and tests assert that a blank or retired saved name displays as “Program Hub”, while an allowed configured name can be used in brand-aware labels.
- These assertions do not replace inspection of the authenticated pages with real user and branding data.

## Remaining limitations

- The older configured value remains in storage until an admin saves a replacement; it is normalized in the branding API response and user-facing display, so this change does not rewrite existing data.
- Internal storage, authentication-state, and learning-protocol identifiers remain unchanged to avoid invalidating existing preferences or integrations.
- Authenticated visual verification of the admin, participant, trainer, mentor, judge, profile, and branding screens remains outstanding because the available browser session is signed out. This run confirms source assertions and isolated role/branding fixtures only.
- No production environment, deployment, email, external provider, database migration, or schema push was used for this work.
