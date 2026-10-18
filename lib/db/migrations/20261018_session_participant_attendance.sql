-- Add individual participant attendance while retaining existing business-level history.
BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_session_participant_attendance (
  id serial PRIMARY KEY,
  session_id integer NOT NULL
    REFERENCES jusoor_sessions(id) ON DELETE CASCADE,
  participant_id integer NOT NULL
    REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  business_id integer NOT NULL
    REFERENCES jusoor_businesses(id) ON DELETE CASCADE,
  status text NOT NULL
    CONSTRAINT jusoor_session_participant_attendance_status_check
    CHECK (status IN ('present', 'absent', 'excused')),
  notes text,
  recorded_by_staff_id integer
    REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual'
    CONSTRAINT jusoor_session_participant_attendance_source_check
    CHECK (source IN ('manual', 'zoom')),
  attended_seconds integer CHECK (attended_seconds IS NULL OR attended_seconds >= 0),
  first_joined_at timestamptz,
  last_left_at timestamptz,
  marked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_session_participant_attendance_session_participant_uq
    UNIQUE (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS jusoor_session_participant_attendance_session_idx
  ON jusoor_session_participant_attendance(session_id);
CREATE INDEX IF NOT EXISTS jusoor_session_participant_attendance_business_idx
  ON jusoor_session_participant_attendance(business_id);
CREATE INDEX IF NOT EXISTS jusoor_session_participant_attendance_participant_idx
  ON jusoor_session_participant_attendance(participant_id);

ALTER TABLE jusoor_zoom_attendance_participants
  ADD COLUMN IF NOT EXISTS matched_application_id integer
    REFERENCES jusoor_applications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jusoor_zoom_attendance_participant_application_idx
  ON jusoor_zoom_attendance_participants(matched_application_id);

COMMIT;
