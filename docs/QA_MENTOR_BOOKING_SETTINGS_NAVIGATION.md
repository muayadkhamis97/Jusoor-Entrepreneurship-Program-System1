# Mentor booking settings navigation

## Request and cause
The mentor dashboard unconditionally displayed the full connection and booking
settings form, even after an account was connected.

## Change
- `/mentor/settings` reuses the existing mentor booking form, query and mutations.
- Both mentor pages provide Workspace and Settings navigation.
- On `/mentor`, either a Google Calendar connection or a Calendly booking account
  replaces the setup form with a compact connected status and Settings link.
- Disconnected mentors retain dashboard setup. Loading and failed queries do not
  render connection controls.
- A connected Google account without a schedule link still hides dashboard setup,
  but shows guidance to complete the link in Settings.
- Settings does not show the engagement list. Existing save, disconnect, reconnect,
  OAuth feedback and query invalidation remain intact.
- No backend authorization, OAuth tokens, provider configuration or schema changed.
- Navigation and new guidance include Arabic translations.

## Verification
- `tsx --test src/mentor-settings.test.tsx src/mentor-booking-status.test.tsx`:
  7 passed. These are logic/source-wiring regressions, not authenticated browser
  tests. They cover guarded routing, form visibility, settings navigation, retained
  mutations, callback messages and Arabic copy.
- Frontend TypeScript check and `git diff --check` passed.
- Restarted the existing frontend workflow; Vite started successfully.
- Fresh `/mentor/settings` preview rendered the signed-out landing page without a
  runtime error. Its browser log contained only normal development messages and
  the existing Clerk development-key warning. Earlier hot-reload failures in the
  shared log predated the restart; none appeared in this fresh preview.

## Limitations
Signed-in visual behavior and live OAuth flows have not been exercised. An
unauthenticated preview cannot verify the mentor-only screen. No production
changes, email sending or publishing are part of this change.
