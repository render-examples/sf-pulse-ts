-- Schema

CREATE TABLE restaurants (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  neighborhood TEXT       NOT NULL,
  cuisine     TEXT        NOT NULL,
  address     TEXT,
  opened_date TEXT        NOT NULL,
  source_url  TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  location    TEXT        NOT NULL,
  date        TEXT        NOT NULL,
  time        TEXT,
  description TEXT,
  source_url  TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
  id         SERIAL PRIMARY KEY,
  endpoint   TEXT        NOT NULL UNIQUE,
  keys       JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE data_updates (
  id          SERIAL PRIMARY KEY,
  type        TEXT        NOT NULL,
  item_name   TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data: SF restaurant openings Jan–Mar 2026

INSERT INTO restaurants (name, neighborhood, cuisine, address, opened_date, source_url) VALUES
-- January 2026
('RT Bistro',              'Hayes Valley',    'American bistro (wood-fired)', '205 Oak St',        'January 9, 2026',   'https://www.7x7.com/excellent-new-restaurant-rt-bistro-2675268285.html'),
('The Buddha',             'SoMa',            'Music venue & bar',            '333 11th St',       'January 2026',      'https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026'),
('Burger Stack',           'Mission',         'Burgers',                      '2956 24th St',      'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Bar Jamón',              'Civic Center',    'Spanish tapas',                '100 Van Ness Ave',  'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Gada',                   'Castro',          'Tunisian (crepes, raclette)',   '2375 Market St',    'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Kapari Restaurant',      'Chinatown',       'Turkish',                      '668 Sacramento St', 'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Izzy & Wooks',           'SoMa (Saluhall)', 'Filipino sandwiches',          '865 Market St',     'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Grégoire',               'Sunset',          'Sandwiches & takeout',         '1300 9th Ave',      'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Studio Golf Bar & Grill','SoMa',            'American bar food',            '350 Mission St',    'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Hamburguesa Bar',        'SoMa',            'Burgers (late-night)',          '78 2nd St',         'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Angela''s Ice Cream',    'Cow Hollow',      'Ice cream',                    '3108 Fillmore St',  'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Alamo Indian Cuisine',   'NoPa',            'Indian/Nepali',                '1279 Fulton St',    'January 2026',      'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
-- February 2026
('Goldenette',             'Nob Hill',        'All-day diner',                '1601 Polk St',      'February 16, 2026', 'https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026'),
('Nan Hot Pot SF',         'North Beach',     'Sichuan hot pot',              '501 Broadway',      'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Tadaima',                'Sunset',          'Japanese sandwiches & cafe',   '1248 9th Ave',      'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Tokyo Cream',            'Sunset',          'Japanese desserts',            '1838 Irving St',    'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Timur',                  'Sunset',          'Indian/Nepali',                '1386 9th Ave',      'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Frankie''s',             'Marina',          'Cocktails & bar food',         '3213 Pierce St',    'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Kissakeko',              'Nob Hill',        'Sake bar & baked goods',       '1327 Mason St',     'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Bar Orso',               'SoMa',            'Cocktails (speakeasy)',        '1148 Mission St',   'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Suavecito Birria & Tacos','Lower Nob Hill', 'Mexican (birria, tacos)',      '882 Sutter St',     'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Khun Mae Thai Noodles',  'Tenderloin',      'Thai noodles',                 '385 Taylor St',     'February 2026',     'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
-- March 2026
('Maria Isabel',           'Presidio Heights','Seafood-focused Mexican',      '500 Presidio Ave',  'March 3, 2026',     'https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php'),
('Rose Pizzeria',          'Inner Richmond',  'Pizza (thin-crust, natural wines)','1 Clement St',  'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026'),
('JouJou',                 'SoMa',            'French seafood',               '65 Division St',    'March 2026',        'https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php'),
('The Big Four',           'Nob Hill',        'American (classic, reopened)', '1075 California St','March 2026',        'https://www.sfgate.com/food/article/big-four-restaurant-review-22096616.php'),
('Restaurant Naides',      'Union Square',    'Contemporary Filipino',        '708 Bush St',       'December 2025',     'https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php'),
('Lobalita',               'Marina',          'Mexican cantina',              '2231 Chestnut St',  'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026'),
('Ka Kai Northern Thai',   'Castro',          'Northern Thai',                '4133 18th St',      'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Agrodolce Provisions',   'SoMa',            'Italian (pasta-focused)',      '1016 Bryant St',    'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Kissaten Hifi',          'Richmond',        'Japanese/Filipino coffee & matcha','189 6th Ave',   'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Clementina',             'Richmond',        'Gluten-free Italian',          '343 Clement St',    'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Grand Lake Kitchen',     'Noe Valley',      'American',                     '1199 Church St',    'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Go Chicken',             'Lakeside/Ingleside','Chinese comfort & chicken',  '2608 Ocean Ave',    'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Polly Ann Ice Cream',    'Financial District','Ice cream (new location)',   '120 Pine St',       'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Bollywood Pizza',        'SoMa',            'Indian pizza',                 '215 Fremont St',    'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
('Loveski',                'Jackson Square',  'Jewish deli',                  '499 Jackson St',    'March 2026',        'https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings'),
-- Michelin-recognized (late 2025)
('Wolfsbane',              'Dogpatch',        'California tasting menu (Nordic/Japanese/French)', NULL, 'October 2025', 'https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php'),
('Dingles Public House',   'Hayes Valley',    'British pub fare',             NULL,                'November 2025',     'https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php'),
('La Cigale',              'Glen Park',       'French-inspired',              NULL,                'August 2025',       'https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php'),
-- Spring 2026 upcoming
('Maillards',              'Outer Sunset',    'Smashburgers & radlers',       '3821 Noriega St',   'Spring 2026 (upcoming)', 'https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026'),
('Bar Coto',               'Jackson Square',  'All-day Italian cafe & bar',   '596 Pacific Ave',   'Spring 2026 (upcoming)', 'https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026'),
('Sol Bakery',             'NoPa',            'Bakery (guava tarts, focaccia)','1696 Hayes St',    'Spring 2026 (upcoming)', 'https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php'),
('Tur',                    'West Portal',     'Thai brunch',                  '1 W Portal Ave',    'Spring 2026 (upcoming)', 'https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026'),
('Club Deluxe',            'Haight',          'Bar & music venue',            NULL,                'Spring 2026 (upcoming)', 'https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026');

-- Seed data: Mission District events

INSERT INTO events (title, location, date, time, description, source_url) VALUES
('Divinity Film Festival',
 'Roxie Theater, 3117 16th St, Mission', 'March 31, 2026', '6:00 PM',
 'Shorts fest highlighting femme voices in film',
 'https://roxie.com/calendar/'),

('Invasion of the Body Snatchers (4K)',
 'Roxie Theater, 3117 16th St, Mission', 'March 31, 2026', '8:30 PM',
 'Celebrating the Roxie''s new 4K projector with a classic',
 'https://roxie.com/calendar/'),

('Skaiwater / Baby Osamaa / Vialice',
 'Brick & Mortar Music Hall, 1710 Mission St', 'March 31, 2026', '8:00 PM',
 'Live music',
 'https://www.brickandmortarmusic.com/calendar/'),

('Chloe Qisha',
 'Brick & Mortar Music Hall, 1710 Mission St', 'April 1, 2026', '8:00 PM',
 'Popscene presents',
 'https://www.brickandmortarmusic.com/calendar/'),

('St. Stupid''s Day Parade',
 'Market St, near Mission', 'April 1, 2026', '12:00 PM',
 'Annual absurdist parade through the Financial District',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('Palestine 36 (Film)',
 'Roxie Theater, 3117 16th St, Mission', 'April 2, 2026', '6:05 PM',
 'Film screening',
 'https://roxie.com/calendar/'),

('The Thing / The Macks',
 'Brick & Mortar Music Hall, 1710 Mission St', 'April 2, 2026', '8:00 PM',
 'Goldenvoice presents',
 'https://www.brickandmortarmusic.com/calendar/'),

('Six Sex',
 'Brick & Mortar Music Hall, 1710 Mission St', 'April 3, 2026', '9:00 PM',
 'Goldenvoice presents',
 'https://www.brickandmortarmusic.com/calendar/'),

('Baby Jane',
 'Brick & Mortar Music Hall, 1710 Mission St', 'April 4, 2026', '9:00 PM',
 'Live music',
 'https://www.brickandmortarmusic.com/calendar/'),

('MAPP — Mission Arts Performance Project',
 'Multiple venues near 24th St, Mission', 'April 4, 2026', '6:00 PM – 11:59 PM',
 'Free art, poetry & concert crawl through the Mission',
 'https://sf.funcheap.com/mapp-sfs-free-art-poetry-concert-crawl-in-the-mission-april-2026/'),

('Easter in the Park & Hunky Jesus Contest',
 'Mission Dolores Park', 'April 5, 2026', '10:00 AM – 4:00 PM',
 'Sisters of Perpetual Indulgence: egg hunt, drag performances, Hunky Jesus & Foxy Mary contests. 47th Anniversary.',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('Bring Your Own Big Wheel Race',
 'Vermont & 20th St, Potrero Hill', 'April 5, 2026', 'All day',
 'Race big wheel tricycles down the curviest street in SF',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('César Chávez Day Parade & Festival',
 'Mission District (24th St corridor & Dolores Park)', 'April 11, 2026', '10:00 AM – 5:00 PM',
 'Largest NorCal event honoring César Chávez. Parade at 11am, festival with live performances, lowrider car show, Latin food, dancing.',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('Night of Ideas',
 'SF Main Public Library (near Mission)', 'April 11, 2026', '3:00 PM – 12:00 AM',
 'Free day-to-midnight festival exploring art, innovation, and culture',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('Fort Mason Night Market',
 'Fort Mason Center', 'April 17, 2026', '5:00 PM – 10:00 PM',
 'Monthly night market: West Coast Craft vendors, food trucks, live music',
 'https://secretsanfrancisco.com/things-to-do-april-sf/'),

('Earth Day Festival',
 'Yerba Buena Gardens', 'April 18, 2026', '11:00 AM – 2:00 PM',
 'Green Business Expo, live music, vendors. Free.',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('420 Celebration at Hippie Hill',
 'Robin Williams Meadow, Golden Gate Park', 'April 20, 2026', 'All day',
 'SF tradition with tens of thousands gathering to celebrate cannabis',
 'https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/'),

('The Cribs / Blueland',
 'Brick & Mortar Music Hall, 1710 Mission St', 'April 25, 2026', '9:00 PM',
 'Popscene presents',
 'https://www.brickandmortarmusic.com/calendar/'),

('Strawberry Milk Cut + Cathedral Bells',
 'Brick & Mortar Music Hall, 1710 Mission St', 'April 26, 2026', '7:30 PM',
 'Live music',
 'https://www.brickandmortarmusic.com/calendar/'),

('Bay to Breakers',
 'Howard & Main to Great Highway (crosses Mission)', 'May 17, 2026', '8:00 AM',
 'SF''s iconic costumed race since 1912. 20,000+ participants.',
 'https://sf.funcheap.com/city-guide/san-franciscos-spring-festivals-street-fairs/'),

('San Francisco Carnaval Festival & Parade',
 'Mission District (Harrison St, 17 blocks)', 'May 23–24, 2026', 'All day',
 'Free two-day festival spanning 17 blocks with five stages, 50+ performers, 400 vendors, Grand Parade with 3,000+ artists.',
 'https://sf.funcheap.com/city-guide/san-franciscos-spring-festivals-street-fairs/');
