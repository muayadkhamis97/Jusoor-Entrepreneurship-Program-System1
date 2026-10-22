-- Additive and intentionally does not opt existing announcements into email.
CREATE TABLE IF NOT EXISTS jusoor_announcement_email_requests (
  announcement_id integer PRIMARY KEY REFERENCES jusoor_program_announcements(id) ON DELETE CASCADE,
  prepared_at timestamptz,
  paused boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jusoor_announcement_email_deliveries (
  id serial PRIMARY KEY,
  announcement_id integer NOT NULL REFERENCES jusoor_announcement_email_requests(announcement_id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempted_at timestamptz,
  sent_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS jusoor_announcement_email_recipient_unique
  ON jusoor_announcement_email_deliveries(announcement_id, email);
CREATE INDEX IF NOT EXISTS jusoor_announcement_email_pending_idx
  ON jusoor_announcement_email_deliveries(status);
