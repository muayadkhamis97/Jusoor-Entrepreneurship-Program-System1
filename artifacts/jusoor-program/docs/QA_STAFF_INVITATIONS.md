# Staff invitation fix — verification notes

## Changes

- Staff creation now treats PostgreSQL's undefined-table code as recoverable even when the driver nests it under `cause`. This lets program-staff invitations continue when the optional specialist-role table has not yet reached production.
- Trainer, mentor, and judge invitations scoped to programs return a clear `503` until the specialist-role schema is available; the route no longer turns that condition into an opaque server error.
- Saving a new staff invitation sends a branded email through the existing project Gmail connection. The email includes the assigned role and program scope, tells the recipient to use the same verified address, and uses the shared platform email sender's sent-message lookup to avoid duplicate delivery on retries.
- Gmail invitation and automated-message sender display names use the current saved brand name, encoded safely for Unicode and header characters.
- If Gmail is unavailable after the access record is saved, the API explains that the record exists and allows the same pending invitation to be retried without duplicating access.
- Outgoing email branding now falls back to a neutral display name if an older saved name is present.

## Evidence

- On 2026-10-17, deployment logs showed `POST /api/staff` returning HTTP 500 while checking whether the specialist-role table existed.
- A read-only production schema query confirmed the staff-program assignment table and program archival column exist, while the specialist-role table does not.
- API typecheck passed; API build completed.
- Web typecheck passed; all 57 web unit tests passed; web production build completed. The build reported an existing sourcemap-location warning and a large-chunk warning.
- Invitation-focused API tests passed, including nested PostgreSQL error handling, invitation content and escaping, branding normalization, and Gmail connector send/retry behavior.
- The mocked Gmail sender test confirms the `From` display name follows the configured brand, including Unicode.
- On 2026-10-18, the focused platform-email and staff-invitation test run passed all 8 tests; API typecheck passed. The API workflow rebuilt and reported “Server listening” on port 8080.
- The full API suite completed with 177 passing and 3 failing tests. The failures are in pre-existing API-key-prefix and meeting-error-copy assertions, not in staff invitations.

## Limits

- No production or development schema was changed. The specialist-role table is already defined in the code schema and the reviewed migration; production still needs the normal Replit Publish schema flow before trainer, mentor, and judge program-role invitations can work.
- No email was sent during testing. Gmail delivery was verified with a mocked connector, not against the live mailbox.
- The staff invitation route was not exercised end-to-end against an isolated database; its schema fallback and email construction/sending paths have focused automated coverage.
- No authenticated browser or production invitation test was performed. These code changes are not live until the workspace is published.
