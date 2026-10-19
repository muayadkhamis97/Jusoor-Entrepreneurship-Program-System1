# Mentor booking-save error guidance

## Root cause

The mentor booking endpoint already returned distinct 400 responses for invalid
Google appointment links, missing schedule links, and disconnected providers.
The frontend ignored the response and displayed one connection/URL message for
every mutation failure, including access failures and server outages.

## Change

- `src/mentor-booking-errors.ts` maps actual API error status and allowlisted
  response messages to safe UI guidance.
- Known malformed/missing Google schedule links receive a URL-field error.
- Google and Calendly missing-connection responses have separate connection
  guidance. Calendly configuration is unchanged.
- 401, 403, 429, 5xx and transport failures receive distinct sign-in, permissions,
  retry-delay, service or network guidance.
- Unknown validation responses use a safe validation fallback.
- Arbitrary server/exception text is never displayed. HTTP status takes
  precedence over response wording.
- `src/role-surfaces.tsx` renders URL errors inline with `aria-invalid`, associated
  help/error IDs, an alert and input focus. Other errors are alerts in the form.
- Editing the URL or provider resets stale error/success feedback. Existing
  controlled values remain available for correction and retry.
- `src/language.tsx` includes Arabic translations for all new messages.

No endpoint, schema, authentication guard, URL allowlist, token handling or
provider configuration changed. The existing endpoint continues to derive the
mentor from the authenticated identity.

## Verification

- Frontend unit suite: **82 passed**, including four new error-mapping/wiring
  checks covering all message classes, safe fallbacks, status precedence, Arabic
  coverage, field associations, focus and resetting feedback.
- `test/mentorGoogleCalendarConnection.test.ts`: **12 passed**. These isolated API
  tests exercise the real route and role guard with mocked database writes.
  They confirm accepted URL formats, rejected URLs, missing connection/link,
  invalid input, authenticated ownership, access denials and disconnect behavior.
- Frontend TypeScript and `git diff --check`: passed.
- Frontend workflow restarted successfully. A fresh phone preview of
  `/mentor/settings` rendered the signed-out landing page without runtime errors;
  it did not verify the protected error UI. The existing Clerk development-key
  warning remains.

## Limitations

No authenticated browser save or screen-reader announcement was tested.
The frontend accessibility assertions are source-wiring checks, not a live
accessibility-tree inspection. API fixture tests do not prove real database
persistence. No OAuth calls, external email, production writes or publishing
were performed.

The mapping intentionally recognizes the current endpoint's exact safe response
messages. If backend error wording changes, update this mapping and its tests
together; unknown responses remain safely generic.
