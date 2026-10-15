ALTER TABLE jusoor_staff_members
  ADD COLUMN google_calendar_refresh_token_encrypted text,
  ADD COLUMN google_calendar_access_token_encrypted text,
  ADD COLUMN google_calendar_access_token_expires_at timestamptz,
  ADD COLUMN google_calendar_sync_token text;

CREATE TABLE jusoor_google_calendar_meetings (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES jusoor_businesses(id) ON DELETE CASCADE,
  mentor_staff_id integer NOT NULL REFERENCES jusoor_staff_members(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text,
  status text NOT NULL,
  last_event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX jusoor_google_calendar_meetings_mentor_event_unique
  ON jusoor_google_calendar_meetings(mentor_staff_id, google_event_id);
CREATE INDEX jusoor_google_calendar_meetings_business_mentor_idx
  ON jusoor_google_calendar_meetings(business_id, mentor_staff_id);
