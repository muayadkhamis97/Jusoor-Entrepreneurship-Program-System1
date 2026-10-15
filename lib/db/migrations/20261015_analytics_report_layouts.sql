CREATE TABLE IF NOT EXISTS jusoor_analytics_report_layouts (
  id serial PRIMARY KEY,
  program_id integer NOT NULL
    REFERENCES jusoor_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text NOT NULL,
  sections jsonb NOT NULL,
  created_by_staff_id integer
    REFERENCES jusoor_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jusoor_analytics_report_layouts_program_name_unique
    UNIQUE (program_id, name)
);

CREATE INDEX IF NOT EXISTS jusoor_analytics_report_layouts_program_idx
  ON jusoor_analytics_report_layouts(program_id);
