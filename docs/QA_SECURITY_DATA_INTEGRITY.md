# Security and data-integrity QA

## Scope implemented

1. Participant session interaction routes are now mounted behind the participant access check. The check still requires a verified email, an application linked to the signed-in account, accepted status, and the same program as the session.
2. Non-coordinator accounts receive only active program IDs explicitly assigned by a coordinator. Operational lists, reads, and mutations for programs, businesses, sessions, mentoring support, pitches, dashboards, and course management use that scope. Staff-directory results are limited to members who share an assigned program. Coordinators retain global access.
3. Programs are archived and restored instead of hard-deleted. Archive/restore events record the acting coordinator. Operational views and public applications exclude archived programs; coordinator reporting data remains stored. Program foreign keys are defined as restrictive to block cascading deletion.

## Verification performed on 2026-10-14

### Passed

- Inspected `lib/db/migrations/20261014_program_assignments_and_archival.sql`, the relevant schema source at the migration's parent revision, and the isolated program-scope route tests. `git log --follow -- lib/db/migrations/20261014_program_assignments_and_archival.sql` identified migration commit `5608871`; `git grep`/`git show 5608871^` confirmed the pre-migration source already defined `archived_at`, staff-program assignments, and lifecycle events.
- The same source inspection confirmed ten existing direct program foreign keys: eight used `ON DELETE CASCADE` (applications, businesses, course modules, impact KPIs, training assignments, training questions, course certificates, and integration API keys); sessions and program announcements used `ON DELETE SET NULL`. Those ten actions were the starting point for the corrected migration fixture.
- Created a fresh local PostgreSQL 16.10 cluster with `initdb` under a new mode-700 `/tmp/jusoor-archive-exact.*` directory. Started it with `listen_addresses=''`, a mode-700 Unix socket inside that directory, and an explicit task-only port. Connected only with `psql -h "$SOCKET" -p "$PORT" -U runner`; no application `DATABASE_URL` or managed database connection was used.
- Isolation was positively checked from inside the new cluster: `current_database=postgres`, `current_user=runner`, `data_directory=/tmp/jusoor-archive-exact.AEKUPd/pgdata`, empty `listen_addresses`, `unix_socket_directories=/tmp/jusoor-archive-exact.AEKUPd/socket`, and port `55441`. The two test databases were created inside this cluster, not in an existing application database.
- Applied the exact migration with `psql -X -v ON_ERROR_STOP=1 -h "$SOCKET" -p "$PORT" -U "$RUNNER" -d <test-database> -f "$PWD/lib/db/migrations/20261014_program_assignments_and_archival.sql"`; both applications completed without SQL errors:
  - `jusoor_archive_pre`: a minimal fixture of the migration's immediate pre-migration schema, including `archived_at`, the already-existing assignment and lifecycle tables/indexes, and the ten prior foreign keys with their original actions.
  - `jusoor_archive_older`: a clone of that fixture with the archive column and the two new tables removed before applying the migration, exercising its add/create path.
- After applying the migration, catalog queries in both databases returned twelve program foreign keys with PostgreSQL delete-action code `r` (`RESTRICT`): the ten protected records plus assignments and lifecycle events. The new-table constraints showed the expected staff/member actions (`CASCADE` for assignment owner, `SET NULL` for assigning/acting staff) and the lifecycle action check. The archive timestamp was nullable and had no default; `created_at` defaulted to `now()`.
- A separate catalog assertion after migration confirmed the assignment primary-key, unique `(staff_id, program_id)` index, and program lookup index existed with the expected definitions; the duplicate-insert check confirmed uniqueness behavior. The exact pre-migration fixture emitted PostgreSQL's `already exists, skipping` notices for the archive column, assignment table, program lookup index, and lifecycle table.
- Synthetic SQL checks on `jusoor_archive_pre` passed:
  - A duplicate staff/program assignment was rejected; the same staff member could be assigned to a second program, and removing that second assignment succeeded.
  - Archive set `archived_at` and wrote an `archived` event; restore cleared it and wrote a `restored` event. Both lifecycle records remained.
  - After archive/restore, each of the ten protected tables still held its synthetic program-linked row. A linked course material and a synthetic pitch judge score/evaluation also remained. The application row represented synthetic participant/application data; all fixtures used synthetic identifiers and values.
  - A hard-delete attempt against a separate synthetic program without assignment or lifecycle rows was rejected by a foreign-key violation. The program and all ten linked rows remained afterward.
- Cross-program authorization tests passed with the command below: 6 tests, 6 passed, 0 failed. These tests use mocked database methods; the command supplied a deliberately unusable local URL (`127.0.0.1:1`) and did not connect to a database.

```sh
DATABASE_URL='postgres://test:test@127.0.0.1:1/test' \
  pnpm --filter @workspace/api-server exec tsx --test \
  test/programScope.test.ts test/programScopedRoutes.test.ts
```

- Cleanup completed: the test cluster stopped with `pg_ctl -m fast -w stop`, then the task-owned temporary directory was removed. The separate metadata/index test clusters were also stopped and their temporary directories removed.
- Earlier QA records in this document noted successful OpenAPI generation, library/API/web TypeScript checks, and 10 isolated API tests. Those checks were not rerun as part of this migration verification.

### Failed or invalidated

- An initial exploratory fixture used `RESTRICT` for all ten preexisting program foreign keys. Inspection of the migration's parent source showed that this did not represent the actual prior actions (eight `CASCADE`, two `SET NULL`). That fixture was excluded from the final pass results; the migration was then rerun successfully against the corrected pre-migration shape and the older object-missing variant. No application or managed database was involved.
- No SQL operation failed in the final corrected verification.

### Blocked

- No isolated-database check was blocked. Verification against an existing application database was intentionally not attempted under the task's safety boundary.

### Not verified

- The fixtures reproduce the migration-relevant tables, columns, nullability, indexes, and foreign-key actions, but are not a complete copy of the application's schema. Unrelated columns, constraints, triggers, and the actual database's schema drift were not tested.
- Archive/restore behavior was exercised with SQL updates and lifecycle inserts, not through the application HTTP handlers against a real database. Concurrent archive/restore requests, rollback/failure injection, and lock behavior were not tested.
- The program-scope route tests mock database calls; they do not establish authorization behavior with a live database.
- No configured development or production database, production data, external service, email provider, browser preview, deployment, or published runtime was used. Browser accessibility/responsiveness and post-migration runtime behavior remain unverified.

## Migration assumptions and rollout blocker

- The migration expects `jusoor_programs`, `jusoor_staff_members`, and all ten protected tables to exist in the active PostgreSQL `search_path`, with compatible `id` and `program_id` columns. Names in the migration are unqualified.
- For each protected table, the migration drops every foreign key it finds that references `jusoor_programs`, then adds one restrictive foreign key on `program_id`. An unexpected additional program foreign key on one of those tables would also be dropped.
- `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS` avoid duplicate-object errors but do not verify that a preexisting object has the expected shape. A differently shaped column, table, or index could be skipped and remain incompatible.
- The migration has been applied only to the disposable local fixtures described above. It has **not** been applied to an application database. The application schema must be migrated through the approved database change process before running changed code against an existing database. Until coordinators assign existing team members to programs in Team access, non-coordinator users have no program access by design.

Apply the migration only through the approved database change process after reviewing its assumptions and object shapes against the target schema. See [Database migration procedure](DATABASE_MIGRATIONS.md). Then verify coordinator access and assign each non-coordinator account to the programs it should serve. Do not treat these disposable-fixture checks, TypeScript checks, or mocked tests as evidence that an application database migration succeeded.

## Staff access schema recovery — development applied; publishing confirmed

This is separate from the isolated program-assignment verification above.

### Verified diagnosis

- Published runtime logs recorded `GET /api/auth/me` returning 503 after the staff bootstrap insert failed because `calendly_follow_up_updated_by_staff_id` was missing.
- The same logs recorded the Calendar worker failing because `google_calendar_refresh_token_encrypted` was missing.
- Read-only development schema inspection confirmed all six columns and the meetings table from the two relevant SQL migrations were absent. The initial development-to-production Publish diff was empty: both database schemas lagged the source definitions.

### Applied and passed in development

- With user approval, applied `20261015_staff_mentor_follow_up_attribution.sql` and `20261015_google_calendar_booking_sync.sql` together in one development-only transaction, which committed successfully. No schema push or force-push was used.
- Verified the six nullable staff columns, meetings-table types/nullability/defaults, primary key, both meeting foreign keys with `ON DELETE CASCADE`, staff attribution foreign key with `ON DELETE SET NULL`, and both explicitly declared meeting indexes.
- Executed the application's complete Drizzle staff-column projection with `LIMIT 0`; it resolved successfully without reading staff records.
- The subsequent Publish diff contains exactly 12 additive statements corresponding to these migrations, with no structural data loss, removals, truncations, compatibility warnings, or unrelated schema changes.

### Publishing evidence and remaining limitations

- No production DDL was run from the workspace. Publishing logs subsequently recorded the 12 reviewed migration statements and a successful publish on 2026-10-16 at 16:12 UTC. The subsequent schema comparison reports no development-to-production difference.
- The latest publishing record is successful, not failed. API and frontend builds completed. The frontend source-map warning and early startup health-check errors did not prevent promotion.
- Read-only public requests to the published `/` and `/api/healthz` endpoints both returned HTTP 200 after publishing.
- Production signed-in access recovery is still not verified. No signed-in browser session, role assignment changes, or email sends were performed for this recovery.
- Application source did not change, so previously recorded source tests/builds were not rerun or claimed as fresh migration verification.

## Program roles and business teams — disposable verified; development applied

### Isolated verification

- Verified the starting schema requirements from `lib/db/src/schema/staff-program-roles.ts`, `lib/db/src/schema/participant-business-memberships.ts`, and the existing staff, program, application, business, and staff-program-assignment definitions.
- Applied the exact `lib/db/migrations/20261014_program_roles_and_business_teams.sql` file to a new local PostgreSQL 16.10 cluster under `/tmp/jusoor-role-migration-check.1BcZIZ`. The cluster used a task-owned data directory and Unix socket, `listen_addresses=''`, port `55437`, and a synthetic-only `migration_test` account. `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` were unset before starting it. The connection confirmed its database directory and socket were inside the new temporary directory.
- Synthetic fixtures passed: existing trainer, mentor, and judge assignments were copied; non-specialist staff were not copied; multiple roles for one staff member in one program were allowed; duplicate roles and invalid roles were rejected; both tables accepted synthetic linked records.
- Catalog checks passed for all expected columns, `created_at DEFAULT now()`, primary/unique/check constraints, indexes, and foreign-key delete behavior (`CASCADE`, `RESTRICT`, and `SET NULL` as declared).
- The temporary cluster stopped cleanly and only its task-owned directory was removed.

### Development preparation

- Read-only catalog inspection in the development database confirmed the migration's prerequisites: programs, staff members, staff-program assignments, applications, and businesses existed; `archived_at` and program assignments were already present; both target tables were absent. No application records were read.
- With user approval, applied the exact migration file once to the development database through the Replit development-database operation. The transaction committed successfully: both tables and their declared indexes were created. The migration's `INSERT ... SELECT` backfill affected **0 rows** in development.
- Post-apply catalog checks confirmed both tables' columns, defaults, primary and unique constraints, role check, indexes, and foreign-key delete actions.
- No Drizzle push or force-push was used. Production was not queried or changed, and Publish was not run.

### Publish and data limitations

- The schema source and migration are ready for the user to review in Publish. The production-side diff has not been opened or verified; review the proposed changes there before confirming Publish.
- The SQL file contains a data backfill in addition to table/index DDL. The development backfill affected zero rows. A Publish schema diff applies structural schema changes; production data backfill behavior was not tested here, and no production data was changed. If existing production specialist assignments need explicit role rows, that requires a separately reviewed and approved data-migration step.
- The signed-in app preview could not be restarted during this work because the configured web/API ports were already occupied. Runtime behavior after the migration and the signed-in staff-assignment screens are not verified by this record.

## Participant invitations — disposable verified; development applied

### Migration verification

- Reviewed `20261014_program_roles_and_business_teams.sql` as the prerequisite that creates `jusoor_participant_business_memberships`, then reviewed `20261015_participant_invitations.sql` for its application/staff foreign keys, 30-day expiry default and legacy-row backfill, expiry index, and replacement of the old unique business index.
- Applied both exact SQL files in order to a newly created PostgreSQL 16 cluster under a task-owned `/tmp` directory using a private Unix socket and `listen_addresses=''`. Synthetic checks confirmed the membership and invitation tables, expiry default and `NOT NULL` constraint, historical expiry backfill, repeatable migration behavior, expiry and business indexes, and multiple application rows referencing one business. The cluster stopped cleanly and its temporary directory was removed.
- The development database already contained the membership table and its two declared indexes. Read-only preflight confirmed the invitation table was absent and the legacy unique business index existed.
- Applied the exact `20261015_participant_invitations.sql` file to the development database through the Replit development-database operation. It committed; post-apply inspection confirmed the membership table remained present and invitation `application_id`, `created_at`, and non-null `expires_at` columns exist. The migration updated zero invitation rows because the table was newly created.
- The migration removed the development-only unique index on `jusoor_applications.business_id` and created its non-unique lookup index. No application rows were changed.
- A production read-only schema query returned neither required table. No production schema changes were made. Before using participant invitations in production, an authorized release must apply `20261014_program_roles_and_business_teams.sql` followed by `20261015_participant_invitations.sql` through the approved database change process.

### Application verification

- `pnpm run typecheck` passed.
- Focused participant invitation and authentication tests passed (14 tests); these cover verified-email linking, expiration, duplicate reuse, expiration renewal, missing schema, program/business scoping, and Gmail message content. Gmail was mocked; no real email was sent.
- `pnpm --filter @workspace/jusoor-program run test:unit` passed (57 tests).
- The full `pnpm run test` command ran but did not pass: three unrelated existing assertions fail in `test/integrationApiKeys.test.ts` (expects the retired `jusoor_live_` prefix) and `test/zoomWorkflow.test.ts` (expects older wording about reusing a meeting). All participant invitation tests passed.
- The preview's signed-in participant invitation screen and live Gmail delivery were not verified in a signed-in browser session.

## Zoom meeting creation guard column — disposable verified; development applied

### Isolated verification

- Reviewed `lib/db/migrations/20261015_zoom_meeting_creation_guard.sql` and `lib/db/src/schema/sessions.ts`. The migration assumes `public.jusoor_sessions` exists and the target column does not; it adds one nullable `timestamptz` column, with no default, index, or new foreign key.
- Created a fresh PostgreSQL 16.10 cluster under `/tmp/jusoor-zoom-column-check.zxKDvw`, with a task-owned data directory and Unix socket. `DATABASE_URL` and PostgreSQL connection environment variables were unset. The server used `listen_addresses=''`; connection checks confirmed database `postgres`, role `migration_test`, a data directory and socket inside the new temporary directory, and no TCP server address.
- Built only the synthetic starting schema and records. The table had 17 columns, two foreign keys, and no target column before the test. Applied the exact migration file with `psql -X -v ON_ERROR_STOP=1 -f`.
- Assertions passed: the table gained only the expected nullable `timestamp with time zone` column; no default, index, or foreign key was added; the existing synthetic session and foreign keys were preserved; a new row received `NULL`; and a timestamp value round-tripped.
- The temporary server stopped cleanly and only its task-owned directory was removed.

### Development application

- Read-only preflight confirmed `public.jusoor_sessions` existed and the target column was absent.
- Applied the exact `ALTER TABLE` statement once to the development database through the Replit development-database operation. Post-apply catalog inspection confirmed `zoom_meeting_creation_pending_at`, type `timestamp with time zone`, nullable, with no default.
- No application records were queried or changed. No Drizzle push/force-push was used. Production was not changed, and Publish was not run. The earlier read-only diagnosis found this column absent in production; its production schema remains unchanged by this verification.
- The production dashboard/API was not re-tested by this database-only change. Production will continue to need the user-reviewed Publish schema application before its deployed API can select this new column.

## Staff invitation email status — access-check failure

### Finding

- Earlier deployment logs showed Clerk sign-in completing with HTTP 200, followed by `GET /api/auth/me` returning HTTP 503 because the staff table lacked `invitation_email_status`.
- Later deployment logs show `GET /api/auth/me` returning HTTP 500 with a Zod error at `invitationEmailStatus` (`undefined`). Source inspection identified a second cause: `requireStaff` omitted this required nullable property from `res.locals.staff`, and the route validates that object against `GetAuthMeResponse`.
- This is an access-response construction error after successful authentication, not a rejected password. Production schema was not re-read after those later logs, so they do not establish whether the first missing-column issue has been cleared there.
- The existing migration `lib/db/migrations/20261017_staff_invitation_email_status.sql` adds a nullable text column, sets it to `pending` for existing rows whose status is `invited`, and constrains non-null values to `pending`, `delivered`, or `failed`.

### Isolated migration verification

- Used PostgreSQL 16.10 in a fresh cluster under a unique `/tmp` directory. Database and PostgreSQL environment variables were unset before starting or connecting. The server had TCP listening disabled and used only its task-owned Unix socket; connection output confirmed database `postgres`, role `isolated_migration_test`, task-local data/socket paths, and a null TCP server address.
- Tested the exact repository migration against a synthetic table with three synthetic staff rows (two invited, one active), with the target column absent. The corrected isolated run passed: invited rows were backfilled to `pending`, the active row stayed null, the column was nullable text with no default, the check constraint rejected an unsupported value, and all three supported values were accepted.
- An initial disposable-harness pre-check failed before migration application because its synthetic query omitted the table `FROM` clause. That cluster was stopped and removed; a fresh corrected run completed all checks.
- The successful test cluster stopped cleanly; only its task-owned temporary directory was removed.

### Development application and remaining production blocker

- Development preflight confirmed the staff table existed while the target column and check constraint were absent.
- Applied the exact migration to development. PostgreSQL reported `ALTER TABLE`, `UPDATE 0`, `ALTER TABLE`; therefore no existing development staff rows were changed by the backfill.
- Post-apply catalog checks confirmed the nullable text column, no default, and the expected check constraint. Development had zero invited records to backfill.
- Fixed the access response construction to include `invitationEmailStatus`, using the stored value for invited staff and explicit `null` otherwise. Role permissions and the OpenAPI contract were unchanged.
- Added a focused `/api/auth/me` regression test covering both an active staff member (explicit `null`) and an invited staff member (`pending`). Full workspace `pnpm run typecheck` and the API-server typecheck passed; `pnpm --filter @workspace/api-server exec tsx --test test/authenticatedProgramStaffRoles.test.ts` passed (3 tests). The development API workflow restarted successfully and listened on port 8080.
- No production database or application was modified by the agent, and the agent did not run Publish. A signed-in browser session and production recovery were not verified; production needs the user-reviewed Publish flow to receive the development schema and code changes.
