CREATE TABLE IF NOT EXISTS jusoor_reminder_email_reconciliation_audit (
  id serial PRIMARY KEY,
  delivery_type text NOT NULL
    CHECK (delivery_type IN ('course_reminder', 'mentor_digest', 'zoom_recording_alert')),
  delivery_id integer NOT NULL,
  actor_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  action text NOT NULL
    CHECK (action IN ('delivery_confirmed', 'retry_authorized')),
  message_id text NOT NULL,
  confirmed_absent boolean NOT NULL
    CHECK (
      (action = 'delivery_confirmed' AND confirmed_absent = false)
      OR (action = 'retry_authorized' AND confirmed_absent = true)
    ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jusoor_reminder_email_reconciliation_delivery_idx
  ON jusoor_reminder_email_reconciliation_audit (delivery_type, delivery_id, created_at);
