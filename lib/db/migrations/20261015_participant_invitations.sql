BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_participant_invitations (
  application_id integer PRIMARY KEY REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  invited_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

ALTER TABLE jusoor_participant_invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE jusoor_participant_invitations
SET expires_at = created_at + interval '30 days'
WHERE expires_at IS NULL;

ALTER TABLE jusoor_participant_invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS jusoor_participant_invitations_expires_idx
  ON jusoor_participant_invitations (expires_at);

DROP INDEX IF EXISTS jusoor_applications_business_unique;

CREATE INDEX IF NOT EXISTS jusoor_applications_business_idx
  ON jusoor_applications (business_id);

COMMIT;
