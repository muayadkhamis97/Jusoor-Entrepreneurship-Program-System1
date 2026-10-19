# Google Calendar booking-settings save — 2026-10-19

## Root cause and evidence

The mentor's OAuth connection and booking-preference save are separate actions. The screenshot shows a connected account with a Google share link on `https://calendar.app.google/…`. The old booking-settings validator accepted only `calendar.google.com` URLs whose path contained `/appointments/schedules/`.

Published application logs show `PATCH /api/mentor/booking-settings` returning **400** at **2026-10-19 15:03:33.830 UTC**, matching the reported failure. Code inspection confirms the short-link hostname was rejected before any update could execute. This is a URL-validation failure, not evidence of a database/schema or OAuth-token failure. Logs do not include the request body; the submitted URL format is identified from the supplied screenshot.

## Request trace

1. `MentorSurface` in `artifacts/jusoor-program/src/role-surfaces.tsx` uses a required HTML URL input when Google Calendar is selected. It trims the URL and sends `bookingProvider` and `googleCalendarBookingUrl`.
2. The generated client sends JSON to `PATCH /api/mentor/booking-settings`. The generated Zod body accepts a URL string or null; it does not reject Google's short-link hostname.
3. The production router is mounted behind `requireStaff` and `requireRole("mentor")`. The handler uses `res.locals.staff`, not a client-supplied mentor ID.
4. The handler validates the schedule link and requires a connected Google identity when Google Calendar is selected. Previously its private hostname/path check rejected the pictured format.
5. The unchanged database update sets only `bookingProvider` and `googleCalendarBookingUrl`, filtered by the authenticated staff ID, mentor role, and active status. It does not update account identity, encrypted tokens, expiry, or sync state.
6. The response exposes booking preferences and a connection boolean, not credentials. On success, the UI shows its existing saved notice and invalidates the mentor dashboard query, whose response supplies the saved provider and URL on later loads. On failure, the UI shows its existing generic save error.

## Change

- Added `artifacts/api-server/src/lib/googleCalendarBookingUrl.ts` for local allowlisted URL validation.
- Updated `artifacts/api-server/src/routes/mentor.ts` to use it.
- Extended `artifacts/api-server/test/mentorGoogleCalendarConnection.test.ts` with save and validation coverage.

Accepted formats include:

- `https://calendar.app.google/<share-token>`
- `https://calendar.google.com/calendar/appointments/schedules/<schedule-id>`
- `https://calendar.google.com/calendar/u/0/appointments/schedules/<schedule-id>`
- `https://calendar.google.com/appointments/schedules/<schedule-id>`

Validation retains HTTPS and exact trusted-host requirements, rejects URL credentials and non-default ports, and checks nonempty schedule/share paths. Lookalike hosts, unrelated pages, and malformed paths are rejected. Links are not fetched or resolved by the server, avoiding arbitrary outbound requests.

OAuth handling, authorization middleware, database schema, booking write logic, and Calendly configuration remain unchanged.

## Verification

Command:

```sh
pnpm --filter @workspace/api-server exec tsx --test \
  test/mentorGoogleCalendarConnection.test.ts \
  test/googleCalendarOAuth.test.ts \
  test/googleCalendarSync.test.ts
```

Result: **19 tests passed; 0 failed, skipped, or cancelled** (4.43 seconds).

Coverage includes:

- Saving both short and long Google links, including query parameters.
- Updating only the authenticated active mentor; request-injected staff IDs or token fields do not become update values.
- SQL-filter parameters use the authenticated mentor ID, role, and status.
- Only the provider and booking URL are written; token fields are untouched.
- Missing connection/link, invalid input/provider, untrusted URLs, missing authentication, wrong/inactive roles, and an update that finds no active mentor.
- Existing Google OAuth state, encrypted-token storage, narrow read-only scope, and sync matching tests.
- Existing disconnect regression tests.

These tests use a local HTTP server and mocked database writes. The authentication fixture supplies an identity and exercises the real role guard; it is not a full Clerk sign-in test. Provider calls are forbidden by the booking-settings fixture.

Additional checks:

- `pnpm --filter @workspace/api-server run typecheck`: **passed**, exit 0.
- `git diff --check`: **passed**, exit 0.
- Managed development API restart: build succeeded and server listened on port 8080.
- Preview screenshot at `/mentor`: public signed-out landing page rendered without a runtime error. The screenshot does **not** verify the signed-in form or a successful browser save.

## Limitations and safety

- Actual signed-in browser save, real database persistence, and post-publish behavior: **not verified**.
- URL validation checks the trusted format, not whether a schedule exists, is public, or belongs to a specific Google account. No supplied link was fetched.
- No manual database access, migrations, schema pushes, production writes, test email, or publishing/deployment was performed. The isolated tests did not access real calendars.
- Publish the code fix to apply it to the live app; the currently published validator is not changed by a development workflow restart.
