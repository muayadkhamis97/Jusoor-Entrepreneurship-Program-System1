-- Add an optional business recipient to in-app announcements.
-- Existing announcements remain cohort/global messages with business_id NULL.
-- Apply through the project's approved database change process before enabling
-- business-targeted messages in a deployed environment.
BEGIN;

ALTER TABLE jusoor_program_announcements
  ADD COLUMN IF NOT EXISTS business_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_program_announcements_business_id_jusoor_businesses_id_fk'
      AND conrelid = 'jusoor_program_announcements'::regclass
  ) THEN
    ALTER TABLE jusoor_program_announcements
      ADD CONSTRAINT jusoor_program_announcements_business_id_jusoor_businesses_id_fk
      FOREIGN KEY (business_id) REFERENCES jusoor_businesses(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_program_announcements_business_requires_program_check'
      AND conrelid = 'jusoor_program_announcements'::regclass
  ) THEN
    ALTER TABLE jusoor_program_announcements
      ADD CONSTRAINT jusoor_program_announcements_business_requires_program_check
      CHECK (business_id IS NULL OR program_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jusoor_program_announcements_business_idx
  ON jusoor_program_announcements (business_id, scheduled_for);

COMMIT;
