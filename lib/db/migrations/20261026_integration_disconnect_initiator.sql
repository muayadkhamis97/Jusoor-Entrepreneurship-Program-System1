-- Preserve whether a disconnect was initiated by an Admin or by the account owner.
BEGIN;

ALTER TABLE jusoor_integration_disconnect_audit_events
  ADD COLUMN IF NOT EXISTS initiator_type text NOT NULL DEFAULT 'admin';

ALTER TABLE jusoor_integration_disconnect_audit_events
  DROP CONSTRAINT IF EXISTS jusoor_integration_disconnect_audit_events_initiator_type_check;
ALTER TABLE jusoor_integration_disconnect_audit_events
  ADD CONSTRAINT jusoor_integration_disconnect_audit_events_initiator_type_check
  CHECK (initiator_type IN ('admin', 'self_service'));

COMMIT;
