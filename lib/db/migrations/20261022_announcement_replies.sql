-- Additive migration; apply through the approved database change process.
CREATE TABLE IF NOT EXISTS jusoor_announcement_replies (
  id serial PRIMARY KEY,
  announcement_id integer NOT NULL REFERENCES jusoor_program_announcements(id) ON DELETE CASCADE,
  application_id integer NOT NULL REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('participant', 'staff')),
  staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS jusoor_announcement_replies_thread_idx
  ON jusoor_announcement_replies (announcement_id, application_id, id);
