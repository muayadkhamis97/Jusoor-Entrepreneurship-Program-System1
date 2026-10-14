-- Add opt-in, per-accepted-program peer directory preferences.
-- Apply through the project's approved database change process before deploying.
BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_participant_peer_directory_preferences (
  id serial PRIMARY KEY,
  application_id integer NOT NULL
    REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  is_listed boolean NOT NULL DEFAULT false,
  share_email boolean NOT NULL DEFAULT false,
  share_phone boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_participant_peer_directory_application_unique UNIQUE (application_id),
  CONSTRAINT jusoor_participant_peer_directory_contact_opt_in_check
    CHECK (is_listed OR (NOT share_email AND NOT share_phone))
);

COMMIT;
