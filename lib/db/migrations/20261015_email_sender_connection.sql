CREATE TABLE IF NOT EXISTS email_sender_connections (
  id serial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'gmail',
  account_email text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  connected_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_sender_connections_provider_unique UNIQUE (provider)
);
