# Mentor engagement save feedback

## Root cause

The mentor dashboard owned one `useUpdateAssignedMentoring` instance, and every
engagement card read its `isPending` and `isError`. A single request therefore
disabled all Save buttons and showed failures on unrelated founder engagements.

## Changes

- `src/mentor-engagement-card.tsx` gives each keyed engagement its own mutation.
  Pending, error and success messages now belong only to that card.
- `src/role-surfaces.tsx` retains drafts keyed by engagement ID and renders the
  new card composition. Requests still send the selected card's ID and the same
  scheduled date, status and trimmed notes contract.
- Each card blocks duplicate submissions, disables its own inputs while saving,
  retains its draft after failure, and clears stale feedback when edited.
  Other cards stay editable and can save concurrently.
- Save success still invalidates the mentor dashboard query, refreshing saved
  records without resetting unrelated local drafts.
- Success feedback has an Arabic translation in `src/language.tsx`.
- The extracted card uses the shared design-system Button; no custom style
  tokens or new component family were added.

No API, permissions, schema, OAuth, booking-settings or provider configuration
changed. Raw API errors remain hidden behind the existing safe failure message.

## Verification

- **86 frontend unit checks passed**, including card ownership/wiring and Arabic
  feedback coverage in `src/mentor-engagement-card.test.tsx`.
- Frontend TypeScript and `git diff --check`: passed.
- `src/mentor-engagement-card.browser.test.tsx`: **passed**. The browser rendered
  two real card components with the real generated mutation hooks and intercepted
  API responses. It verified:
  - Card 1 pending leaves card 2 editable and ready to save.
  - Concurrent requests complete out of order without sharing feedback.
  - Card 2 success does not clear card 1 pending/error.
  - Card 1 failure does not affect card 2.
  - Drafts survive failure and another card's response.
  - Editing/retrying clears only the affected card's feedback.
  - Each request contains the correct card ID/notes.
  - Immediate duplicate submit events produce only one request.
- Fixture:
  `/src/test-fixtures/mentor-engagement-cards.html`.
- Frontend and API workflows restarted successfully; fresh logs show both
  serving. Phone-sized fixture preview rendered the two cards without runtime
  exceptions. A resource 404 appeared in the fixture console, without affecting
  the verified card interactions.

## Limits

The browser regression used an isolated component fixture with mocked HTTP
responses, not a signed-in mentor or actual database writes. It verifies
frontend ownership and concurrent-request handling, not production persistence.
No live provider calls, emails, production changes or publishing were performed.
