ALTER TABLE jusoor_announcement_email_requests
  ADD COLUMN IF NOT EXISTS pause_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE jusoor_announcement_email_deliveries
  ADD COLUMN IF NOT EXISTS failure_operation text,
  ADD COLUMN IF NOT EXISTS provider_status integer,
  ADD COLUMN IF NOT EXISTS provider_reason text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text;
