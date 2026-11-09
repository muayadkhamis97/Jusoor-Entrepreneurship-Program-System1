BEGIN;
CREATE TABLE jusoor_rate_limit_counters (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jusoor_rate_limit_counters_updated_idx
  ON jusoor_rate_limit_counters(updated_at);
COMMIT;
