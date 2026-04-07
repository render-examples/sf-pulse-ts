ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS identity_key TEXT;

DELETE FROM restaurants
WHERE id IN (
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          lower(btrim(name)) || '|' ||
          lower(btrim(coalesce(NULLIF(address, ''), NULLIF(neighborhood, ''), '')))
        ORDER BY
          CASE WHEN highlight_kind = 'michelin' THEN 0 ELSE 1 END,
          added_at DESC,
          id DESC
      ) AS row_num
    FROM restaurants
  )
  SELECT id
  FROM ranked
  WHERE row_num > 1
);

UPDATE restaurants
SET identity_key =
  lower(btrim(name)) || '|' ||
  lower(btrim(coalesce(NULLIF(address, ''), NULLIF(neighborhood, ''), '')))
WHERE identity_key IS NULL OR identity_key = '';

ALTER TABLE restaurants ALTER COLUMN identity_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_identity_key_idx ON restaurants (identity_key);
CREATE INDEX IF NOT EXISTS events_end_date_idx ON events (end_date);
