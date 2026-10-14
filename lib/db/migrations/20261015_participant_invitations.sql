CREATE TABLE IF NOT EXISTS jusoor_participant_invitations (
  application_id integer PRIMARY KEY REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  invited_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS jusoor_applications_business_unique;

CREATE INDEX IF NOT EXISTS jusoor_applications_business_idx
  ON jusoor_applications (business_id);
