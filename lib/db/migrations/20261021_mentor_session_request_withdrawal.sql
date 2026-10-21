ALTER TABLE mentor_session_requests
  DROP CONSTRAINT mentor_session_requests_approval_check,
  ADD CONSTRAINT mentor_session_requests_approval_check
    CHECK (
      (decision IS NULL AND approved_additional_sessions IS NULL)
      OR (decision = 'approved' AND approved_additional_sessions BETWEEN 1 AND 1000)
      OR (decision IN ('declined', 'withdrawn') AND approved_additional_sessions IS NULL)
    );
