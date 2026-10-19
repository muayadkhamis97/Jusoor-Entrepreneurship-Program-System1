-- Convert the attendance program-scope helper indexes into explicit unique
-- constraints, which are the referenced parent keys for the composite FKs.
-- Reusing the indexes avoids rebuilding them or changing table data.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS jusoor_sessions_id_program_uq
  ON jusoor_sessions(id, program_id);
CREATE UNIQUE INDEX IF NOT EXISTS jusoor_applications_id_program_uq
  ON jusoor_applications(id, program_id);
CREATE UNIQUE INDEX IF NOT EXISTS jusoor_businesses_id_program_uq
  ON jusoor_businesses(id, program_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_sessions_id_program_uq'
      AND conrelid = 'jusoor_sessions'::regclass
  ) THEN
    ALTER TABLE jusoor_sessions
      ADD CONSTRAINT jusoor_sessions_id_program_uq
      UNIQUE USING INDEX jusoor_sessions_id_program_uq;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_applications_id_program_uq'
      AND conrelid = 'jusoor_applications'::regclass
  ) THEN
    ALTER TABLE jusoor_applications
      ADD CONSTRAINT jusoor_applications_id_program_uq
      UNIQUE USING INDEX jusoor_applications_id_program_uq;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_businesses_id_program_uq'
      AND conrelid = 'jusoor_businesses'::regclass
  ) THEN
    ALTER TABLE jusoor_businesses
      ADD CONSTRAINT jusoor_businesses_id_program_uq
      UNIQUE USING INDEX jusoor_businesses_id_program_uq;
  END IF;
END;
$$;

COMMIT;
