ALTER TABLE mentor_session_requests
  ADD COLUMN decision text,
  ADD COLUMN approved_additional_sessions integer,
  ADD COLUMN email_notification_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT mentor_session_requests_approval_check
    CHECK (
      (decision IS NULL AND approved_additional_sessions IS NULL)
      OR (decision = 'approved' AND approved_additional_sessions BETWEEN 1 AND 1000)
      OR (decision = 'declined' AND approved_additional_sessions IS NULL)
    );
