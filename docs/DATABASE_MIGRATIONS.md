# Database migration procedure

## Migration source and boundary

Reviewed PostgreSQL migration files belong in `lib/db/migrations/`. The `.replit` post-merge hook runs `scripts/post-merge.sh`; that hook installs locked dependencies only and must not run `drizzle-kit push`, `drizzle-kit push --force`, or another database-mutating command.

The database package still exposes direct schema-push scripts. They are not the approved migration or rollout path and must not be used against shared or production databases. Do not add schema pushes to merge, application-startup, build, or deployment automation.

## Applying a reviewed migration

1. Add a versioned SQL migration under `lib/db/migrations/`. Review its starting-schema assumptions, target tables, constraints, indexes, and data-retention behavior against the current schema.
2. Apply it first to a newly created disposable PostgreSQL database using synthetic data. Record the exact command and results, then stop and remove only that test database.
3. Before changing any shared environment, obtain explicit approval for the specific migration and target environment from the authorized database owner.
4. An authorized operator applies the exact approved SQL file to that explicitly selected environment through the organization's approved database administration process. Set `MIGRATION_FILE` to the reviewed path and use a PostgreSQL client with fail-fast behavior, for example:

   ```sh
   MIGRATION_FILE='lib/db/migrations/<approved-migration>.sql'
   psql -X -v ON_ERROR_STOP=1 --file="$MIGRATION_FILE"
   ```

   The connection must be supplied through the approved secure connection mechanism; do not put credentials in source files, migration files, or shell history.
5. Verify the resulting schema and expected data behavior, record the environment and outcome in the change record, and handle application deployment as a separate explicitly approved action.

Do not use `drizzle-kit push` or `drizzle-kit push --force` as a substitute for a reviewed migration. If a migration fails or needs reversal, stop and use a separately reviewed recovery or corrective migration; do not improvise against a shared database.

## Current tooling limitation

The repository has versioned SQL migration files but does not currently include a migration runner or applied-migration ledger. Until an approved runner is added, the authorized operator and the organization's database-change process are responsible for selecting the target, applying the reviewed SQL, and recording the result.
