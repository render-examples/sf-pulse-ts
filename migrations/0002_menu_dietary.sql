-- Add menu URL and dietary flags to restaurants.
-- menu_url: direct link to the restaurant's menu page.
-- menu_checked_at: when the menu was last fetched (null = never checked).
-- dietary_flags: jsonb with shape { gluten_free, vegan, vegetarian } each
--   having { available: boolean, confidence: 'confirmed' | 'inferred' }.
-- Re-check weekly: cron skips restaurants checked within the last 7 days.

ALTER TABLE restaurants ADD COLUMN menu_url TEXT;
ALTER TABLE restaurants ADD COLUMN menu_checked_at TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN dietary_flags JSONB;
