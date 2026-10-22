BEGIN;
CREATE TABLE program_judging_form_link_history (
  id serial PRIMARY KEY,
  form_id integer NOT NULL REFERENCES program_judging_forms(id) ON DELETE CASCADE,
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  replaced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX program_judging_form_link_history_form_idx ON program_judging_form_link_history(form_id, id);
COMMIT;
