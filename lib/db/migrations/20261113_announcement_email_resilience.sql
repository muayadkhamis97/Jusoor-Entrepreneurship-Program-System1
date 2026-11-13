ALTER TABLE jusoor_announcement_email_requests
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS resume_at timestamptz;

ALTER TABLE jusoor_announcement_email_deliveries
  ADD COLUMN IF NOT EXISTS failure_kind text;
