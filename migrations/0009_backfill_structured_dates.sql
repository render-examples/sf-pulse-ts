WITH restaurant_source AS (
  SELECT
    id,
    btrim(
      CASE
        WHEN position('·' in opened_date) > 0 THEN substring(opened_date from position('·' in opened_date) + 1)
        ELSE opened_date
      END
    ) AS raw_date,
    lower(opened_date) AS opened_date_lower
  FROM restaurants
),
restaurant_parts AS (
  SELECT
    id,
    raw_date,
    opened_date_lower,
    position(' ' in raw_date) AS first_space,
    position(',' in raw_date) AS comma_pos,
    CASE
      WHEN position('–' in raw_date) > 0 THEN position('–' in raw_date)
      WHEN position('-' in raw_date) > 0 THEN position('-' in raw_date)
      ELSE 0
    END AS dash_pos,
    CASE
      WHEN raw_date LIKE 'January %' THEN 1
      WHEN raw_date LIKE 'February %' THEN 2
      WHEN raw_date LIKE 'March %' THEN 3
      WHEN raw_date LIKE 'April %' THEN 4
      WHEN raw_date LIKE 'May %' THEN 5
      WHEN raw_date LIKE 'June %' THEN 6
      WHEN raw_date LIKE 'July %' THEN 7
      WHEN raw_date LIKE 'August %' THEN 8
      WHEN raw_date LIKE 'September %' THEN 9
      WHEN raw_date LIKE 'October %' THEN 10
      WHEN raw_date LIKE 'November %' THEN 11
      WHEN raw_date LIKE 'December %' THEN 12
      ELSE NULL
    END AS month_num,
    CASE
      WHEN raw_date LIKE 'Spring %' THEN 4
      WHEN raw_date LIKE 'Summer %' THEN 7
      WHEN raw_date LIKE 'Fall %' THEN 10
      WHEN raw_date LIKE 'Autumn %' THEN 10
      WHEN raw_date LIKE 'Winter %' THEN 1
      ELSE NULL
    END AS season_start_month,
    CASE
      WHEN raw_date LIKE 'Spring %' THEN 6
      WHEN raw_date LIKE 'Summer %' THEN 9
      WHEN raw_date LIKE 'Fall %' THEN 12
      WHEN raw_date LIKE 'Autumn %' THEN 12
      WHEN raw_date LIKE 'Winter %' THEN 2
      ELSE NULL
    END AS season_end_month,
    CASE
      WHEN position(',' in raw_date) > 0 THEN CAST(substring(raw_date from position(',' in raw_date) + 2 for 4) AS INTEGER)
      WHEN position(' ' in raw_date) > 0 THEN CAST(substring(raw_date from position(' ' in raw_date) + 1 for 4) AS INTEGER)
      ELSE NULL
    END AS year_num
  FROM restaurant_source
),
restaurant_derived AS (
  SELECT
    id,
    opened_date_lower,
    comma_pos,
    month_num,
    season_start_month,
    season_end_month,
    year_num,
    CASE
      WHEN month_num IS NULL OR year_num IS NULL THEN NULL
      WHEN month_num IN (1, 3, 5, 7, 8, 10, 12) THEN 31
      WHEN month_num IN (4, 6, 9, 11) THEN 30
      WHEN year_num % 400 = 0 OR (year_num % 4 = 0 AND year_num % 100 <> 0) THEN 29
      ELSE 28
    END AS month_last_day,
    CASE
      WHEN season_end_month IN (4, 6, 9, 11) THEN 30
      WHEN season_end_month = 2 AND (year_num % 400 = 0 OR (year_num % 4 = 0 AND year_num % 100 <> 0)) THEN 29
      WHEN season_end_month = 2 THEN 28
      ELSE 31
    END AS season_end_day,
    CASE
      WHEN comma_pos > 0 AND dash_pos = 0 AND month_num IS NOT NULL THEN CAST(substring(raw_date from first_space + 1 for comma_pos - first_space - 1) AS INTEGER)
      ELSE NULL
    END AS exact_day,
    CASE
      WHEN comma_pos > 0 AND dash_pos > 0 AND month_num IS NOT NULL THEN CAST(substring(raw_date from first_space + 1 for dash_pos - first_space - 1) AS INTEGER)
      ELSE NULL
    END AS range_start_day,
    CASE
      WHEN comma_pos > 0 AND dash_pos > 0 AND month_num IS NOT NULL THEN CAST(substring(raw_date from dash_pos + 1 for comma_pos - dash_pos - 1) AS INTEGER)
      ELSE NULL
    END AS range_end_day
  FROM restaurant_parts
),
restaurant_computed AS (
  SELECT
    id,
    CASE
      WHEN exact_day IS NOT NULL THEN make_date(year_num, month_num, exact_day)
      WHEN range_start_day IS NOT NULL THEN make_date(year_num, month_num, range_start_day)
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN make_date(year_num, month_num, 1)
      WHEN season_start_month IS NOT NULL THEN make_date(year_num, season_start_month, 1)
      ELSE NULL
    END AS start_date,
    CASE
      WHEN exact_day IS NOT NULL THEN make_date(year_num, month_num, exact_day)
      WHEN range_end_day IS NOT NULL THEN make_date(year_num, month_num, range_end_day)
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN make_date(year_num, month_num, month_last_day)
      WHEN season_end_month IS NOT NULL THEN make_date(year_num, season_end_month, season_end_day)
      ELSE NULL
    END AS end_date,
    CASE
      WHEN exact_day IS NOT NULL THEN 'day'
      WHEN range_start_day IS NOT NULL THEN 'day_range'
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN 'month'
      WHEN season_start_month IS NOT NULL THEN 'season'
      ELSE NULL
    END AS computed_precision,
    CASE
      WHEN opened_date_lower LIKE '%upcoming%' OR opened_date_lower LIKE '%tbd%' OR opened_date_lower LIKE '%tba%' OR opened_date_lower LIKE '%coming soon%' THEN TRUE
      WHEN exact_day IS NOT NULL THEN make_date(year_num, month_num, exact_day) >= CURRENT_DATE
      WHEN range_end_day IS NOT NULL THEN make_date(year_num, month_num, range_end_day) >= CURRENT_DATE
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN make_date(year_num, month_num, month_last_day) >= CURRENT_DATE
      WHEN season_end_month IS NOT NULL THEN make_date(year_num, season_end_month, season_end_day) >= CURRENT_DATE
      ELSE FALSE
    END AS upcoming
  FROM restaurant_derived
)
UPDATE restaurants AS restaurants
SET
  opened_start_date = COALESCE(restaurants.opened_start_date, restaurant_computed.start_date),
  opened_end_date = COALESCE(restaurants.opened_end_date, restaurant_computed.end_date),
  opened_date_precision =
    CASE
      WHEN restaurants.opened_date_precision = 'unknown' AND restaurant_computed.computed_precision IS NOT NULL
        THEN restaurant_computed.computed_precision
      ELSE restaurants.opened_date_precision
    END,
  is_upcoming =
    CASE
      WHEN restaurant_computed.upcoming THEN TRUE
      ELSE restaurants.is_upcoming
    END
FROM restaurant_computed
WHERE restaurants.id = restaurant_computed.id
  AND (
    (restaurants.opened_start_date IS NULL AND restaurant_computed.start_date IS NOT NULL)
    OR (restaurants.opened_end_date IS NULL AND restaurant_computed.end_date IS NOT NULL)
    OR (restaurants.opened_date_precision = 'unknown' AND restaurant_computed.computed_precision IS NOT NULL)
    OR (restaurants.is_upcoming = FALSE AND restaurant_computed.upcoming = TRUE)
  );

WITH event_source AS (
  SELECT
    id,
    btrim(date) AS raw_date,
    lower(date) AS date_lower
  FROM events
),
event_parts AS (
  SELECT
    id,
    raw_date,
    date_lower,
    position(' ' in raw_date) AS first_space,
    position(',' in raw_date) AS comma_pos,
    CASE
      WHEN position('–' in raw_date) > 0 THEN position('–' in raw_date)
      WHEN position('-' in raw_date) > 0 THEN position('-' in raw_date)
      ELSE 0
    END AS dash_pos,
    CASE
      WHEN raw_date LIKE 'January %' THEN 1
      WHEN raw_date LIKE 'February %' THEN 2
      WHEN raw_date LIKE 'March %' THEN 3
      WHEN raw_date LIKE 'April %' THEN 4
      WHEN raw_date LIKE 'May %' THEN 5
      WHEN raw_date LIKE 'June %' THEN 6
      WHEN raw_date LIKE 'July %' THEN 7
      WHEN raw_date LIKE 'August %' THEN 8
      WHEN raw_date LIKE 'September %' THEN 9
      WHEN raw_date LIKE 'October %' THEN 10
      WHEN raw_date LIKE 'November %' THEN 11
      WHEN raw_date LIKE 'December %' THEN 12
      ELSE NULL
    END AS month_num,
    CASE
      WHEN raw_date LIKE 'Spring %' THEN 4
      WHEN raw_date LIKE 'Summer %' THEN 7
      WHEN raw_date LIKE 'Fall %' THEN 10
      WHEN raw_date LIKE 'Autumn %' THEN 10
      WHEN raw_date LIKE 'Winter %' THEN 1
      ELSE NULL
    END AS season_start_month,
    CASE
      WHEN raw_date LIKE 'Spring %' THEN 6
      WHEN raw_date LIKE 'Summer %' THEN 9
      WHEN raw_date LIKE 'Fall %' THEN 12
      WHEN raw_date LIKE 'Autumn %' THEN 12
      WHEN raw_date LIKE 'Winter %' THEN 2
      ELSE NULL
    END AS season_end_month,
    CASE
      WHEN position(',' in raw_date) > 0 THEN CAST(substring(raw_date from position(',' in raw_date) + 2 for 4) AS INTEGER)
      WHEN position(' ' in raw_date) > 0 THEN CAST(substring(raw_date from position(' ' in raw_date) + 1 for 4) AS INTEGER)
      ELSE NULL
    END AS year_num
  FROM event_source
),
event_derived AS (
  SELECT
    id,
    date_lower,
    comma_pos,
    month_num,
    season_start_month,
    season_end_month,
    year_num,
    CASE
      WHEN month_num IS NULL OR year_num IS NULL THEN NULL
      WHEN month_num IN (1, 3, 5, 7, 8, 10, 12) THEN 31
      WHEN month_num IN (4, 6, 9, 11) THEN 30
      WHEN year_num % 400 = 0 OR (year_num % 4 = 0 AND year_num % 100 <> 0) THEN 29
      ELSE 28
    END AS month_last_day,
    CASE
      WHEN season_end_month IN (4, 6, 9, 11) THEN 30
      WHEN season_end_month = 2 AND (year_num % 400 = 0 OR (year_num % 4 = 0 AND year_num % 100 <> 0)) THEN 29
      WHEN season_end_month = 2 THEN 28
      ELSE 31
    END AS season_end_day,
    CASE
      WHEN comma_pos > 0 AND dash_pos = 0 AND month_num IS NOT NULL THEN CAST(substring(raw_date from first_space + 1 for comma_pos - first_space - 1) AS INTEGER)
      ELSE NULL
    END AS exact_day,
    CASE
      WHEN comma_pos > 0 AND dash_pos > 0 AND month_num IS NOT NULL THEN CAST(substring(raw_date from first_space + 1 for dash_pos - first_space - 1) AS INTEGER)
      ELSE NULL
    END AS range_start_day,
    CASE
      WHEN comma_pos > 0 AND dash_pos > 0 AND month_num IS NOT NULL THEN CAST(substring(raw_date from dash_pos + 1 for comma_pos - dash_pos - 1) AS INTEGER)
      ELSE NULL
    END AS range_end_day
  FROM event_parts
),
event_computed AS (
  SELECT
    id,
    CASE
      WHEN exact_day IS NOT NULL THEN make_date(year_num, month_num, exact_day)
      WHEN range_start_day IS NOT NULL THEN make_date(year_num, month_num, range_start_day)
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN make_date(year_num, month_num, 1)
      WHEN season_start_month IS NOT NULL THEN make_date(year_num, season_start_month, 1)
      ELSE NULL
    END AS start_date,
    CASE
      WHEN exact_day IS NOT NULL THEN make_date(year_num, month_num, exact_day)
      WHEN range_end_day IS NOT NULL THEN make_date(year_num, month_num, range_end_day)
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN make_date(year_num, month_num, month_last_day)
      WHEN season_end_month IS NOT NULL THEN make_date(year_num, season_end_month, season_end_day)
      ELSE NULL
    END AS end_date,
    CASE
      WHEN exact_day IS NOT NULL THEN 'day'
      WHEN range_start_day IS NOT NULL THEN 'day_range'
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN 'month'
      WHEN season_start_month IS NOT NULL THEN 'season'
      ELSE NULL
    END AS computed_precision,
    CASE
      WHEN date_lower LIKE '%upcoming%' OR date_lower LIKE '%tbd%' OR date_lower LIKE '%tba%' OR date_lower LIKE '%coming soon%' THEN TRUE
      WHEN exact_day IS NOT NULL THEN make_date(year_num, month_num, exact_day) >= CURRENT_DATE
      WHEN range_end_day IS NOT NULL THEN make_date(year_num, month_num, range_end_day) >= CURRENT_DATE
      WHEN month_num IS NOT NULL AND comma_pos = 0 THEN make_date(year_num, month_num, month_last_day) >= CURRENT_DATE
      WHEN season_end_month IS NOT NULL THEN make_date(year_num, season_end_month, season_end_day) >= CURRENT_DATE
      ELSE FALSE
    END AS upcoming
  FROM event_derived
)
UPDATE events AS events
SET
  start_date = COALESCE(events.start_date, event_computed.start_date),
  end_date = COALESCE(events.end_date, event_computed.end_date),
  date_precision =
    CASE
      WHEN events.date_precision = 'unknown' AND event_computed.computed_precision IS NOT NULL
        THEN event_computed.computed_precision
      ELSE events.date_precision
    END,
  is_upcoming =
    CASE
      WHEN event_computed.upcoming THEN TRUE
      ELSE events.is_upcoming
    END
FROM event_computed
WHERE events.id = event_computed.id
  AND (
    (events.start_date IS NULL AND event_computed.start_date IS NOT NULL)
    OR (events.end_date IS NULL AND event_computed.end_date IS NOT NULL)
    OR (events.date_precision = 'unknown' AND event_computed.computed_precision IS NOT NULL)
    OR (events.is_upcoming = FALSE AND event_computed.upcoming = TRUE)
  );
