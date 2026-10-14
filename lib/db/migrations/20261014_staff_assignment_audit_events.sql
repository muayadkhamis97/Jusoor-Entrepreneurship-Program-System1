-- Keep an append-only history of program specialist-role and participant business-team changes.
-- This migration creates a new table only; existing rows and tables are not modified.
BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_staff_assignment_audit_events (
  id serial PRIMARY KEY,
  assignment_type text NOT NULL
    CONSTRAINT jusoor_staff_assignment_audit_events_type_check
    CHECK (assignment_type IN ('staff_roles', 'business_team')),
  program_id integer NOT NULL,
  program_name text NOT NULL,
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  affected_staff_id integer,
  affected_account_email text,
  application_id integer,
  affected_application_name text,
  previous_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_staff_assignment_audit_events_subject_check CHECK (
    (assignment_type = 'staff_roles' AND affected_staff_id IS NOT NULL AND application_id IS NULL)
    OR (assignment_type = 'business_team' AND affected_staff_id IS NULL AND application_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS jusoor_staff_assignment_audit_events_created_idx
  ON jusoor_staff_assignment_audit_events(created_at, id);
CREATE INDEX IF NOT EXISTS jusoor_staff_assignment_audit_events_program_idx
  ON jusoor_staff_assignment_audit_events(program_id, created_at);

COMMIT;
