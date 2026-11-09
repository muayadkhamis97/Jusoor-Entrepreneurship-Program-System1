ALTER TABLE jusoor_staff_members
  ADD COLUMN google_calendar_sync_last_success_at timestamptz,
  ADD COLUMN google_calendar_sync_last_failure_at timestamptz,
  ADD COLUMN google_calendar_sync_consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN google_calendar_sync_needs_reauthorization boolean NOT NULL DEFAULT false;
