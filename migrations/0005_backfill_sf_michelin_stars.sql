WITH michelin_seed (
  name,
  neighborhood,
  cuisine,
  address,
  opened_date,
  source_url,
  highlight_kind
) AS (
  VALUES
    ('Atelier Crenn', 'San Francisco', 'Michelin 3-star recognition', NULL, '3 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/atelier-crenn', 'michelin'),
    ('Benu', 'San Francisco', 'Michelin 3-star recognition', NULL, '3 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/benu', 'michelin'),
    ('Quince', 'San Francisco', 'Michelin 3-star recognition', NULL, '3 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/quince', 'michelin'),
    ('Acquerello', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/acquerello', 'michelin'),
    ('Birdsong', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/birdsong', 'michelin'),
    ('Californios', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/californios', 'michelin'),
    ('Kiln', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/kiln-1210355', 'michelin'),
    ('Lazy Bear', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/lazy-bear', 'michelin'),
    ('Saison', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/saison', 'michelin'),
    ('Sons & Daughters', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/sons-daughters', 'michelin'),
    ('7 Adams', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/7-adams', 'michelin'),
    ('Angler SF', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/angler-sf', 'michelin'),
    ('Hilda and Jesse', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/hilda-and-jesse', 'michelin'),
    ('Kin Khao', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/kin-khao', 'michelin'),
    ('Le Comptoir at Bar Crenn', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/bar-crenn', 'michelin'),
    ('Mister Jiu’s', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/mister-jiu%E2%80%99s', 'michelin'),
    ('Nari', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/nari', 'michelin'),
    ('Niku Steakhouse', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/niku-steakhouse', 'michelin'),
    ('Nisei', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/nisei', 'michelin'),
    ('O'' by Claude Le Tohic', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/o-by-claude-le-tohic', 'michelin'),
    ('San Ho Won', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/san-ho-won', 'michelin'),
    ('Sorrel', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/sorrel', 'michelin'),
    ('Ssal', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/ssal', 'michelin'),
    ('State Bird Provisions', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/state-bird-provisions', 'michelin'),
    ('The Progress', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/the-progress', 'michelin'),
    ('The Shota', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/the-shota', 'michelin')
)
UPDATE restaurants AS restaurants
SET
  neighborhood = seed.neighborhood,
  cuisine = seed.cuisine,
  address = seed.address,
  opened_date = seed.opened_date,
  source_url = seed.source_url,
  highlight_kind = seed.highlight_kind
FROM michelin_seed AS seed
WHERE lower(restaurants.name) = lower(seed.name);

WITH michelin_seed (
  name,
  neighborhood,
  cuisine,
  address,
  opened_date,
  source_url,
  highlight_kind
) AS (
  VALUES
    ('Atelier Crenn', 'San Francisco', 'Michelin 3-star recognition', NULL, '3 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/atelier-crenn', 'michelin'),
    ('Benu', 'San Francisco', 'Michelin 3-star recognition', NULL, '3 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/benu', 'michelin'),
    ('Quince', 'San Francisco', 'Michelin 3-star recognition', NULL, '3 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/quince', 'michelin'),
    ('Acquerello', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/acquerello', 'michelin'),
    ('Birdsong', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/birdsong', 'michelin'),
    ('Californios', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/californios', 'michelin'),
    ('Kiln', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/kiln-1210355', 'michelin'),
    ('Lazy Bear', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/lazy-bear', 'michelin'),
    ('Saison', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/saison', 'michelin'),
    ('Sons & Daughters', 'San Francisco', 'Michelin 2-star recognition', NULL, '2 stars · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/sons-daughters', 'michelin'),
    ('7 Adams', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/7-adams', 'michelin'),
    ('Angler SF', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/angler-sf', 'michelin'),
    ('Hilda and Jesse', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/hilda-and-jesse', 'michelin'),
    ('Kin Khao', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/kin-khao', 'michelin'),
    ('Le Comptoir at Bar Crenn', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/bar-crenn', 'michelin'),
    ('Mister Jiu’s', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/mister-jiu%E2%80%99s', 'michelin'),
    ('Nari', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/nari', 'michelin'),
    ('Niku Steakhouse', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/niku-steakhouse', 'michelin'),
    ('Nisei', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/nisei', 'michelin'),
    ('O'' by Claude Le Tohic', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/o-by-claude-le-tohic', 'michelin'),
    ('San Ho Won', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/san-ho-won', 'michelin'),
    ('Sorrel', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/sorrel', 'michelin'),
    ('Ssal', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/ssal', 'michelin'),
    ('State Bird Provisions', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/state-bird-provisions', 'michelin'),
    ('The Progress', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/the-progress', 'michelin'),
    ('The Shota', 'San Francisco', 'Michelin 1-star recognition', NULL, '1 star · June 27, 2025', 'https://guide.michelin.com/us/en/california/san-francisco/restaurant/the-shota', 'michelin')
)
INSERT INTO restaurants (
  name,
  neighborhood,
  cuisine,
  address,
  opened_date,
  source_url,
  highlight_kind
)
SELECT
  seed.name,
  seed.neighborhood,
  seed.cuisine,
  seed.address,
  seed.opened_date,
  seed.source_url,
  seed.highlight_kind
FROM michelin_seed AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM restaurants AS existing
  WHERE lower(existing.name) = lower(seed.name)
);
