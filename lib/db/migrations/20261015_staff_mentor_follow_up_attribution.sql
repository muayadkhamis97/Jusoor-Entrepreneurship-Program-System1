ALTER TABLE jusoor_staff_members
  ADD COLUMN calendly_follow_up_updated_by_staff_id integer
    REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  ADD COLUMN calendly_follow_up_updated_at timestamptz;
