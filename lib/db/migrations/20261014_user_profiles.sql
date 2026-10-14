-- Add app-managed profile details without changing Clerk identity, staff roles,
-- program assignments, or submitted application records.
BEGIN;

CREATE TABLE IF NOT EXISTS jusoor_user_profiles (
  user_id text PRIMARY KEY,
  display_name text NOT NULL,
  phone text,
  bio text,
  organization text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
