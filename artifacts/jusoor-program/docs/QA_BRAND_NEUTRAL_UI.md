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
- `pnpm --filter @workspace/api-server run typecheck` — passed.
- Public landing, Arabic translation coverage, certificate output, lifecycle export, and assignment-history export tests — **22 passed, 0 failed**.
- Integration API key format tests — **3 passed, 0 failed**. This includes parsing old and new keys, normalized display prefixes, and malformed values.
- `pnpm --filter @workspace/api-spec run codegen` — passed.
- `PORT=19333 BASE_PATH=/ pnpm --filter @workspace/jusoor-program run build` — passed.
- `pnpm --filter @workspace/api-server run build` — passed.
- `git diff --check` — passed.

The web build still prints a source-map location warning for the existing dropdown-menu component and the usual large-chunk advisory. Neither caused the build to fail.

### Browser

- Captured the public landing page at 1440×1000. Its visible identity, navigation and footer use the neutral program wording.
- The browser console showed the existing Clerk development-instance notice and React DevTools suggestion; no new application error appeared.
- Authenticated admin and participant pages were not visually inspected in this run. Arabic text received automated translation checks, but an Arabic-rendered browser screenshot was not inspected.

## Remaining limitations

- The older configured value remains in storage until an admin saves a replacement; it is normalized in the branding API response and user-facing display, so this change does not rewrite existing data.
- Internal storage, authentication-state, and learning-protocol identifiers remain unchanged to avoid invalidating existing preferences or integrations.
- No production environment, deployment, email, external provider, database migration, or schema push was used for this work.
