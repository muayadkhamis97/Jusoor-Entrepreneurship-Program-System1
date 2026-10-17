ALTER TABLE jusoor_staff_members
  ADD COLUMN invitation_email_status text;

UPDATE jusoor_staff_members
SET invitation_email_status = 'pending'
WHERE status = 'invited';

ALTER TABLE jusoor_staff_members
  ADD CONSTRAINT jusoor_staff_invitation_email_status_check
    CHECK (invitation_email_status IS NULL OR invitation_email_status IN ('pending', 'delivered', 'failed'));
