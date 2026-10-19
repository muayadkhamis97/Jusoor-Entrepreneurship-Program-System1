# Mentor booking draft protection

## Root cause

The mentor form kept its provider/URL only in component state. Navigation
unmounted that state without a warning, while an effect copied refreshed server
values into the inputs regardless of whether the mentor was editing.

## Fix and affected files

- `src/use-mentor-booking-draft.ts` owns the local draft, saved baseline and latest
  server values. A changed provider or trimmed schedule URL marks the form dirty.
  Refreshes update the available server baseline but cannot overwrite a dirty or
  pending draft. Save success applies the returned settings; failed saves retain
  edits. Explicit discard restores the latest received server values.
- `src/unsaved-navigation.ts` and `src/main.tsx` register a single history guard
  before router rendering. Same-document navigation checks the active editor,
  and indexed history entries allow a cancelled Back/Forward operation to restore
  the current entry without unmounting the editor. Existing object state is
  retained; only a navigation index is added. No draft values are stored there.
- `src/role-surfaces.tsx` uses the draft hook for both mentor setup and Settings.
  Workspace/Profile/other-role links use the history guard. Sign out,
  connect/reconnect and disconnect actions call the same leave check.
- The browser's native confirmation offers stay/discard. Refresh, tab close and
  full-page departure use the native `beforeunload` warning. Exact browser
  warning wording is controlled by the browser.
- The form shows “Unsaved changes” with an explicit Discard changes action.
  Cancelling that confirmation keeps the draft and stays on the form.
- During a save, inputs/provider actions are disabled and internal departures
  show a wait message. This prevents a pending response from replacing newer
  input or being mistaken for a completed save.
- `src/language.tsx` adds Arabic pending-save guidance; existing translated
  discard wording is reused.

No automatic save, browser-storage persistence, new API, database mutation,
provider configuration or authorization change was introduced. Only the normal
user-triggered save persists booking settings.

## Verification

- Frontend unit suite: **84 passed**. Added source regressions in
  `src/mentor-booking-draft.test.tsx`; updated the settings save-wiring check.
- Frontend TypeScript and `git diff --check`: passed.
- One browser testing pass at 390 px used
  `src/test-fixtures/mentor-booking-draft.html`, which renders the production draft
  hook, history guard and Wouter routing with in-memory simulated responses.
  It confirmed:
  - Workspace, Profile, reconnect and sign-out cancellation preserve edits.
  - Server refresh preserves dirty provider/URL.
  - Failed save keeps edits; successful save clears dirty state and allows leaving.
  - Explicit discard can be cancelled, or accepted to restore the latest server
    values without leaving.
  - Confirmed navigation reaches the destination.
  - Pending-save navigation is blocked and failed-save recovery remains editable.
  - Native beforeunload dialogs were observed on browser Back/reload; dismissing
    them left the editor and draft intact. Navigation timeouts after dismissal
    are not evidence of a completed reload.
- `src/mentor-booking-draft.browser.test.tsx` separately primes same-document
  history before editing. It passed cancelled Back restoration, confirmed Back
  navigation, and clean Forward re-entry checks with no external requests.
- Final frontend restart succeeded. A fresh phone-sized preview of the fixture
  rendered without a runtime exception. A resource 404 was logged in the fixture
  (also observed by the tester); the tested draft-protection flow was unaffected.

## Limits

This is production-hook/fixture verification, not a real authenticated mentor
save or a live database persistence test. The fixture resets its in-memory server
data when remounted. Native dialogs can vary by browser; browsers may suppress
beforeunload prompts without prior interaction or when terminating mobile tabs.
Drafts are deliberately not persisted across process termination or an explicit
discard. History created before the guard initialized may not carry an index;
unknown same-document entries use a one-step Back-cancellation fallback.

No production access, live calendar calls, emails, schema changes or publishing
were performed. The tester noted dense fixture-only action labels; that fixture
is not a production settings layout.
