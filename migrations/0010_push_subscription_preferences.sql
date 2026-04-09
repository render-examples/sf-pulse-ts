ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"neighborhoods":[],"cuisines":[],"dietary_flags":[],"event_categories":[]}'::jsonb;

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE push_subscriptions
SET preferences = '{"neighborhoods":[],"cuisines":[],"dietary_flags":[],"event_categories":[]}'::jsonb
WHERE preferences IS NULL
   OR preferences = '{}'::jsonb;
