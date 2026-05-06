ALTER TABLE restaurants DROP COLUMN IF EXISTS menu_url;
ALTER TABLE restaurants DROP COLUMN IF EXISTS menu_checked_at;
ALTER TABLE restaurants DROP COLUMN IF EXISTS dietary_flags;

UPDATE push_subscriptions
  SET preferences = preferences - 'dietary_flags';

ALTER TABLE push_subscriptions
  ALTER COLUMN preferences
  SET DEFAULT '{"neighborhoods":[],"cuisines":[],"event_categories":[]}'::jsonb;
