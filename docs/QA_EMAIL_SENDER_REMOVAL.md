# Gmail sender removal QA

## Change

Removed the Gmail connection panel, Google OAuth endpoints, Gmail delivery path, associated API contract and generated client types, and schema model. Platform course reminders and recording-ready alerts now use only the existing Resend-backed sender path.

## Data cleanup

The migration `20261015_remove_gmail_sender.sql` drops `email_sender_connections`, including any stored encrypted refresh token. It has **not** been applied. No development or production database was accessed or changed. The historical table-creation migration is retained as migration history.

## Verification

- API schema code generation completed, including generated library typechecking.
- Full workspace typecheck passed.
- API tests: 145 passed, 0 failed, including checks that a configured sender and recipient list are required before delivery.
- Web unit tests: 48 passed, 0 failed.
- `git diff --check` passed.
- No Gmail/OAuth implementation references remain in app source or API contracts; the historical create-table migration and new cleanup migration are retained.
- Web and API workflows restarted successfully; Vite became ready, and the API production bundle built and listened on its configured port.
- A local unauthenticated request to the removed sender-status path returned `401` at the shared auth layer, so it did not provide a route-level `404` check. Source and OpenAPI scans show the sender route is no longer mounted or declared.

## Limitations

- The cleanup migration is pending; any existing saved Gmail authorization data remains in the database until that migration is applied through the normal database-change process.
- No Gmail account connection state was queried.
- No external provider, database, email, production environment, or deployment was accessed.
- The existing Resend-backed sender was not contacted; delivery remains dependent on its existing configuration.
- The preview browser rendered the signed-out landing page at the Admin integrations path. The signed-in Admin page was not visually verified.
