# Staff invitation fix — verification notes

## Changes

- Staff creation now treats PostgreSQL's undefined-table code as recoverable even when the driver nests it under `cause`. This lets program-staff invitations continue when the optional specialist-role table has not yet reached production.
- Trainer, mentor, and judge invitations scoped to programs return a clear `503` until the specialist-role schema is available; the route no longer turns that condition into an opaque server error.
- Saving a new staff invitation sends a branded email through the existing project Gmail connection. The email includes the assigned role and program scope, tells the recipient to use the same verified address, and uses the shared platform email sender's sent-message lookup to avoid duplicate delivery on retries.
- If Gmail is unavailable after the access record is saved, the API explains that the record exists and allows the same pending invitation to be retried without duplicating access.
- Outgoing email branding now falls back to a neutral display name if an older saved name is present.

## Evidence

- On 2026-10-17, deployment logs showed `POST /api/staff` returning HTTP 500 while checking whether the specialist-role table existed.
- A read-only production schema query confirmed the staff-program assignment table and program archival column exist, while the specialist-role table does not.
- Automated tests cover nested PostgreSQL error causes, invitation content and escaping, branded-email normalization, Gmail connector sending and retry deduplication.
- API and web typechecks and the targeted automated tests passed in this workspace.

## Limits

- No production or development schema was changed. The specialist-role table is already defined in the code schema and the reviewed migration; production still needs the normal Replit Publish schema flow before trainer, mentor, and judge program-role invitations can work.
- No email was sent during testing. Gmail delivery was verified with a mocked connector, not against the live mailbox.
- No authenticated production browser test was performed. These code changes are not live until the workspace is published.
