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
