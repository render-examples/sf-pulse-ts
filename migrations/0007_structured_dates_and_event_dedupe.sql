ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS opened_start_date DATE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS opened_end_date DATE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS opened_date_precision TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_upcoming BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE events ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS date_precision TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_upcoming BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

UPDATE events
SET dedupe_key =
  lower(title) || '|' ||
  lower(location) || '|' ||
  lower(date)
WHERE dedupe_key IS NULL OR dedupe_key = '';

ALTER TABLE events ALTER COLUMN dedupe_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS events_dedupe_key_idx ON events (dedupe_key);
CREATE INDEX IF NOT EXISTS restaurants_opened_start_date_idx ON restaurants (opened_start_date);
CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date);
