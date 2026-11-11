BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_program_google_sheets_destination_history (
  id serial PRIMARY KEY,
  program_id integer NOT NULL,
  program_name text NOT NULL,
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  previous_spreadsheet_id text,
  previous_spreadsheet_title text,
  previous_sheet_mappings jsonb,
  new_spreadsheet_id text NOT NULL,
  new_spreadsheet_title text NOT NULL,
  new_sheet_mappings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jusoor_program_google_sheets_destination_history_program_created_idx
  ON jusoor_program_google_sheets_destination_history(program_id, created_at DESC, id DESC);

COMMIT;
