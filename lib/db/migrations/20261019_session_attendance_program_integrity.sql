-- Enforce that each participant attendance record references a session,
-- participant, and business in the same program.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS jusoor_sessions_id_program_uq
  ON jusoor_sessions(id, program_id);
CREATE UNIQUE INDEX IF NOT EXISTS jusoor_applications_id_program_uq
  ON jusoor_applications(id, program_id);
CREATE UNIQUE INDEX IF NOT EXISTS jusoor_businesses_id_program_uq
  ON jusoor_businesses(id, program_id);

ALTER TABLE jusoor_session_participant_attendance
  ADD COLUMN IF NOT EXISTS program_id integer;

UPDATE jusoor_session_participant_attendance AS attendance
SET program_id = session.program_id
FROM jusoor_sessions AS session,
     jusoor_applications AS participant,
     jusoor_businesses AS business
WHERE attendance.session_id = session.id
  AND attendance.participant_id = participant.id
  AND attendance.business_id = business.id
  AND attendance.program_id IS NULL
  AND session.program_id IS NOT NULL
  AND participant.program_id = session.program_id
  AND business.program_id = session.program_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM jusoor_session_participant_attendance
    WHERE program_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce attendance program integrity: existing attendance rows do not resolve to one shared program';
  END IF;
  END;
$$;

ALTER TABLE jusoor_session_participant_attendance
  ALTER COLUMN program_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_session_participant_attendance_session_program_fk'
      AND conrelid = 'jusoor_session_participant_attendance'::regclass
  ) THEN
    ALTER TABLE jusoor_session_participant_attendance
      ADD CONSTRAINT jusoor_session_participant_attendance_session_program_fk
      FOREIGN KEY (session_id, program_id)
      REFERENCES jusoor_sessions(id, program_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_session_participant_attendance_participant_program_fk'
      AND conrelid = 'jusoor_session_participant_attendance'::regclass
  ) THEN
    ALTER TABLE jusoor_session_participant_attendance
      ADD CONSTRAINT jusoor_session_participant_attendance_participant_program_fk
      FOREIGN KEY (participant_id, program_id)
      REFERENCES jusoor_applications(id, program_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_session_participant_attendance_business_program_fk'
      AND conrelid = 'jusoor_session_participant_attendance'::regclass
  ) THEN
    ALTER TABLE jusoor_session_participant_attendance
      ADD CONSTRAINT jusoor_session_participant_attendance_business_program_fk
      FOREIGN KEY (business_id, program_id)
      REFERENCES jusoor_businesses(id, program_id)
      ON DELETE CASCADE;
  END IF;
  END;
$$;

COMMIT;
