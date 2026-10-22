BEGIN;
CREATE TABLE program_judging_forms (
  id serial PRIMARY KEY,
  program_id integer NOT NULL REFERENCES jusoor_programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  criteria jsonb NOT NULL,
  questions jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  share_token_hash text NOT NULL,
  share_token_enc text NOT NULL,
  published_at timestamptz,
  created_by_staff_id integer REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_judging_form_status_check CHECK (status IN ('draft','open','closed'))
);
CREATE UNIQUE INDEX program_judging_form_token_uq ON program_judging_forms(share_token_hash);
CREATE TABLE program_judging_form_businesses (
  form_id integer NOT NULL REFERENCES program_judging_forms(id) ON DELETE CASCADE,
  business_id integer NOT NULL REFERENCES jusoor_businesses(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  PRIMARY KEY (form_id,business_id)
);
CREATE TABLE program_judging_responses (
  id serial PRIMARY KEY,
  form_id integer NOT NULL REFERENCES program_judging_forms(id) ON DELETE CASCADE,
  business_id integer NOT NULL,
  business_name text NOT NULL,
  judge_name text NOT NULL,
  judge_email text NOT NULL,
  scores jsonb NOT NULL,
  answers jsonb NOT NULL,
  score_total real NOT NULL,
  max_score integer NOT NULL,
  client_submission_id uuid NOT NULL,
  payload_hash text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_judging_response_email_check CHECK (judge_email = lower(btrim(judge_email))),
  CONSTRAINT program_judging_response_score_check CHECK (score_total >= 0 AND score_total <= max_score)
);
CREATE UNIQUE INDEX program_judging_response_judge_uq ON program_judging_responses(form_id,business_id,judge_email);
CREATE UNIQUE INDEX program_judging_response_retry_uq ON program_judging_responses(form_id,client_submission_id);
CREATE INDEX program_judging_response_form_idx ON program_judging_responses(form_id,id);
COMMIT;
