ALTER TABLE jusoor_staff_members
  ADD COLUMN google_calendar_sync_last_skipped_at timestamptz,
  ADD COLUMN google_calendar_sync_skip_count integer NOT NULL DEFAULT 0;
