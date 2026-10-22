BEGIN;
CREATE TABLE program_chat_threads (
  id serial PRIMARY KEY,
  program_id integer NOT NULL REFERENCES jusoor_programs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  participant_id integer REFERENCES jusoor_applications(id) ON DELETE CASCADE,
  business_id integer REFERENCES jusoor_businesses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_chat_target_check CHECK (
    (kind = 'private' AND participant_id IS NOT NULL AND business_id IS NULL)
    OR (kind = 'business' AND participant_id IS NULL AND business_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX program_chat_private_uq ON program_chat_threads(program_id, participant_id);
CREATE UNIQUE INDEX program_chat_business_uq ON program_chat_threads(program_id, business_id);
CREATE TABLE program_chat_messages (
  id serial PRIMARY KEY,
  thread_id integer NOT NULL REFERENCES program_chat_threads(id) ON DELETE CASCADE,
  sender_key text NOT NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL,
  body text NOT NULL,
  client_message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_chat_message_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  CONSTRAINT program_chat_message_role_check CHECK (sender_role IN ('staff', 'participant'))
);
CREATE INDEX program_chat_message_thread_idx ON program_chat_messages(thread_id, id);
CREATE UNIQUE INDEX program_chat_message_retry_uq ON program_chat_messages(thread_id, sender_key, client_message_id);
CREATE TABLE program_chat_reads (
  thread_id integer NOT NULL REFERENCES program_chat_threads(id) ON DELETE CASCADE,
  reader_key text NOT NULL,
  last_read_message_id integer NOT NULL DEFAULT 0,
  PRIMARY KEY (thread_id, reader_key)
);
COMMIT;
