BEGIN;
CREATE TABLE program_judging_form_status_history (
  id serial PRIMARY KEY,
  form_id integer NOT NULL REFERENCES program_judging_forms(id) ON DELETE CASCADE,
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  CONSTRAINT program_judging_form_status_history_from_check CHECK (from_status IN ('draft','open','closed')),
  CONSTRAINT program_judging_form_status_history_to_check CHECK (to_status IN ('draft','open','closed')),
  CONSTRAINT program_judging_form_status_history_transition_check CHECK (from_status <> to_status),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX program_judging_form_status_history_form_idx ON program_judging_form_status_history(form_id, id);
COMMIT;
