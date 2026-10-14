-- Store specialist roles per program and link accepted participants to shared business teams.
-- Personal application and learning records remain application-scoped.
BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_staff_program_roles (
  id serial PRIMARY KEY,
  staff_id integer NOT NULL REFERENCES jusoor_staff_members(id) ON DELETE CASCADE,
  program_id integer NOT NULL REFERENCES jusoor_programs(id) ON DELETE RESTRICT,
  role text NOT NULL
    CONSTRAINT jusoor_staff_program_roles_role_check CHECK (role IN ('trainer', 'mentor', 'judge')),
  assigned_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_staff_program_roles_staff_program_role_uq UNIQUE (staff_id, program_id, role)
);

CREATE INDEX IF NOT EXISTS jusoor_staff_program_roles_program_role_idx
  ON jusoor_staff_program_roles(program_id, role);
CREATE INDEX IF NOT EXISTS jusoor_staff_program_roles_staff_idx
  ON jusoor_staff_program_roles(staff_id);

-- Preserve current specialist access by transferring each existing role into its assigned program.
INSERT INTO jusoor_staff_program_roles (staff_id, program_id, role, assigned_by_staff_id)
SELECT assignment.staff_id, assignment.program_id, member.role, assignment.assigned_by_staff_id
FROM jusoor_staff_program_assignments AS assignment
JOIN jusoor_staff_members AS member ON member.id = assignment.staff_id
WHERE member.role IN ('trainer', 'mentor', 'judge')
ON CONFLICT (staff_id, program_id, role) DO NOTHING;

CREATE TABLE IF NOT EXISTS jusoor_participant_business_memberships (
  id serial PRIMARY KEY,
  application_id integer NOT NULL REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  business_id integer NOT NULL REFERENCES jusoor_businesses(id) ON DELETE CASCADE,
  assigned_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_participant_business_memberships_application_uq UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS jusoor_participant_business_memberships_business_idx
  ON jusoor_participant_business_memberships(business_id);

COMMIT;
