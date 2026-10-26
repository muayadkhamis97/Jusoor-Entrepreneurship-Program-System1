-- Keep an append-only Admin history of successful integration disconnects.
BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_integration_disconnect_audit_events (
  id serial PRIMARY KEY,
  integration_type text NOT NULL
    CONSTRAINT jusoor_integration_disconnect_audit_events_type_check
    CHECK (integration_type IN ('mentor_google_calendar', 'program_google_sheets', 'shared_zoom')),
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  affected_staff_id integer,
  affected_account_email text,
  program_id integer,
  program_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_integration_disconnect_audit_events_subject_check CHECK (
    (integration_type = 'mentor_google_calendar' AND affected_staff_id IS NOT NULL AND program_id IS NULL)
    OR (integration_type = 'program_google_sheets' AND affected_staff_id IS NULL AND program_id IS NOT NULL AND program_name IS NOT NULL)
    OR (integration_type = 'shared_zoom' AND affected_staff_id IS NULL AND program_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS jusoor_integration_disconnect_audit_events_created_idx
  ON jusoor_integration_disconnect_audit_events(created_at, id);
CREATE INDEX IF NOT EXISTS jusoor_integration_disconnect_audit_events_program_idx
  ON jusoor_integration_disconnect_audit_events(program_id, created_at);

COMMIT;
