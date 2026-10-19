# Mentor booking connection follow-up — 2026-10-19

## Report and cause

A mentor using Google Calendar was shown as needing Calendly follow-up despite a connected Google account. Inspection found Calendly-only conditions in the page counts, follow-up filters/editor, follow-up update API, and overdue reminder-digest selection.

## Corrected rule

Either a Google Calendar connection or a Calendly connection makes connection follow-up unnecessary. This is a connection-status rule, not a test of schedule-link completeness or availability.

- Connected mentors display **Not needed** instead of follow-up inputs.
- They are excluded from pending/unrecorded counts and overdue/upcoming/undated follow-up filters.
- The connected-account metric counts mentors, not provider connections, so a dual-connected mentor counts once.
- Counts and page copy are provider-neutral, including Arabic translations.
- The update API rejects connection-follow-up changes for Google-connected mentors, as it already did for Calendly-connected mentors.
- The overdue digest excludes Google-connected mentors even when old follow-up dates remain.
- Historical notes and dates are retained. Disconnecting both providers makes the existing follow-up rules apply again.

Calendly configuration, Google OAuth/token handling, permissions, schema, and existing design-system styling are unchanged. Internal legacy `calendlyFollowUp*` field names remain unchanged to avoid a schema/API migration.

## Verification

- Frontend: `pnpm --filter @workspace/jusoor-program exec tsx --test src/mentor-booking-status.test.tsx`: **4 passed, 0 failed**.
- API: `pnpm --filter @workspace/api-server exec tsx --test test/mentorBookingFollowUp.test.ts test/mentorFollowUpDigests.test.ts`: **10 passed, 0 failed**.
- Both artifact typechecks: **passed**, exit 0.
- Tests cover Google-only, Calendly-only, dual-connected, disconnected, recorded/undated follow-ups, connected-account update rejection, retained notes, and digest exclusions. Existing permission and date checks remain covered.
- API route tests use an injected authenticated identity and mocked database methods. Digest tests exercise selection only; they do not send email.
- The frontend tests exercise the summary predicate and verify page wiring; they do not drive a signed-in browser.
- Development API build/restart and Vite startup succeeded. A fresh `/mentor-booking` screenshot rendered the signed-out landing page without a runtime exception; this does not verify the signed-in status table.

Actual signed-in rendering and published behavior are **not verified**. No migrations, manual production data changes, or publishing were performed for this fix.
