ALTER TABLE restaurants
  ADD COLUMN highlight_kind TEXT NOT NULL DEFAULT 'opening';

CREATE TABLE cron_runs (
  job_name TEXT PRIMARY KEY,
  last_ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
