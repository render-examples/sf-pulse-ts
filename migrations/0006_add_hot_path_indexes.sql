CREATE INDEX IF NOT EXISTS restaurants_added_at_idx
  ON restaurants (added_at DESC);

CREATE INDEX IF NOT EXISTS restaurants_lower_name_idx
  ON restaurants ((lower(name)));

CREATE INDEX IF NOT EXISTS data_updates_occurred_at_idx
  ON data_updates (occurred_at DESC);

CREATE INDEX IF NOT EXISTS restaurants_menu_checked_at_idx
  ON restaurants (menu_checked_at);
