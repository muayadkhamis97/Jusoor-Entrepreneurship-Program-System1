BEGIN;

ALTER TABLE jusoor_announcement_replies
  ADD COLUMN IF NOT EXISTS email_notification_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_notification_failure_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_announcement_replies_email_status_check'
  ) THEN
    ALTER TABLE jusoor_announcement_replies
      ADD CONSTRAINT jusoor_announcement_replies_email_status_check
      CHECK (email_notification_status IN ('not_sent', 'sent', 'failed', 'uncertain'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jusoor_announcement_replies_email_failure_check'
  ) THEN
    ALTER TABLE jusoor_announcement_replies
      ADD CONSTRAINT jusoor_announcement_replies_email_failure_check
      CHECK (
        email_notification_failure_kind IS NULL
        OR email_notification_failure_kind IN ('quota', 'needs_reconnect', 'invalid_recipient', 'transient', 'ambiguous')
      );
  END IF;
END $$;

COMMIT;
