CREATE TABLE IF NOT EXISTS jusoor_mentor_follow_up_digest_deliveries (
  id serial PRIMARY KEY,
  coordinator_staff_id integer NOT NULL
    REFERENCES jusoor_staff_members(id) ON DELETE CASCADE,
  calendar_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  CONSTRAINT jusoor_mentor_follow_up_digest_coordinator_date_unique
    UNIQUE (coordinator_staff_id, calendar_date)
);
