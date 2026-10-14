# Security and data-integrity QA

## Scope implemented

1. Participant session interaction routes are now mounted behind the participant access check. The check still requires a verified email, an application linked to the signed-in account, accepted status, and the same program as the session.
2. Non-coordinator accounts receive only active program IDs explicitly assigned by a coordinator. Operational lists, reads, and mutations for programs, businesses, sessions, mentoring support, pitches, dashboards, and course management use that scope. Staff-directory results are limited to members who share an assigned program. Coordinators retain global access.
3. Programs are archived and restored instead of hard-deleted. Archive/restore events record the acting coordinator. Operational views and public applications exclude archived programs; coordinator reporting data remains stored. Program foreign keys are defined as restrictive to block cascading deletion.

## Verification performed

- OpenAPI code generation and library typecheck completed successfully.
- API server and web artifact TypeScript checks completed successfully.
- Isolated API tests passed: 10 tests covering the real application route composition for anonymous, accepted, unaccepted, and cross-program participant requests; program-scope helpers; and cross-program list/read/create/update/delete behavior for operational resources.
- Route tests replace database calls with in-memory fixtures. They do not establish live database behavior.
- No production database, external API, email service, or browser preview was used for verification.

## Migration and rollout blocker

`lib/db/migrations/20261014_program_assignments_and_archival.sql` is a reviewed migration proposal only; it has **not** been applied. The application schema must be migrated before running the changed API against an existing database. Until coordinators assign existing team members to programs in Team access, non-coordinator users have no program access by design.

Apply the migration only through the approved database change process after reviewing its constraints and table names against the target schema. Then verify coordinator access and assign each non-coordinator account to the programs it should serve. Do not treat TypeScript checks or mocked tests as evidence that the database migration succeeded.

## Not verified

- Live database migration behavior, rollback behavior, or production data.
- Browser layout, accessibility, and interactive UI behavior.
- Existing deployment or runtime behavior after schema migration.
