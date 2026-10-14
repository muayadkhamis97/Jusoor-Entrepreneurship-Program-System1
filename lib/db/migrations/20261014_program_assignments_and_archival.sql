-- Reviewed additive migration for program-scoped staff access and archival.
-- Do not run this as part of application startup; review and apply through the
-- project's approved database change process before deploying the code.
BEGIN;

ALTER TABLE jusoor_programs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS jusoor_staff_program_assignments (
  id serial PRIMARY KEY,
  staff_id integer NOT NULL REFERENCES jusoor_staff_members(id) ON DELETE CASCADE,
  program_id integer NOT NULL REFERENCES jusoor_programs(id) ON DELETE RESTRICT,
  assigned_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_staff_program_assignments_staff_program_uq UNIQUE (staff_id, program_id)
);

CREATE INDEX IF NOT EXISTS jusoor_staff_program_assignments_program_idx
  ON jusoor_staff_program_assignments(program_id);

CREATE TABLE IF NOT EXISTS jusoor_program_lifecycle_events (
  id serial PRIMARY KEY,
  program_id integer NOT NULL REFERENCES jusoor_programs(id) ON DELETE RESTRICT,
  action text NOT NULL CONSTRAINT jusoor_program_lifecycle_events_action_check
    CHECK (action IN ('archived', 'restored')),
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Replace existing program foreign keys with RESTRICT so a direct program
-- delete cannot cascade into applications, businesses, courses, or history.
DO $migration$
DECLARE
  relation_name text;
  foreign_key_name text;
  protected_tables text[] := ARRAY[
    'jusoor_applications',
    'jusoor_businesses',
    'jusoor_course_modules',
    'jusoor_impact_kpis',
    'jusoor_sessions',
    'jusoor_program_announcements',
    'jusoor_training_assignments',
    'jusoor_training_questions',
    'jusoor_course_certificates',
    'jusoor_integration_api_keys'
  ];
BEGIN
  FOREACH relation_name IN ARRAY protected_tables LOOP
    FOR foreign_key_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = to_regclass(relation_name)
        AND confrelid = to_regclass('jusoor_programs')
        AND contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', relation_name, foreign_key_name);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (program_id) REFERENCES jusoor_programs(id) ON DELETE RESTRICT',
      relation_name,
      relation_name || '_program_id_restrict_fk'
    );
  END LOOP;
END
$migration$;

COMMIT;
