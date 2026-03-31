import { storage } from "./storage";

const now = new Date().toISOString();

// Seed restaurants - SF openings from Jan-Mar 2026
const restaurantData = [
  // January 2026
  { name: "RT Bistro", neighborhood: "Hayes Valley", cuisine: "American bistro (wood-fired)", address: "205 Oak St", openedDate: "January 9, 2026", sourceUrl: "https://www.7x7.com/excellent-new-restaurant-rt-bistro-2675268285.html" },
  { name: "The Buddha", neighborhood: "SoMa", cuisine: "Music venue & bar", address: "333 11th St", openedDate: "January 2026", sourceUrl: "https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026" },
  { name: "Burger Stack", neighborhood: "Mission", cuisine: "Burgers", address: "2956 24th St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Bar Jamón", neighborhood: "Civic Center", cuisine: "Spanish tapas", address: "100 Van Ness Ave", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Gada", neighborhood: "Castro", cuisine: "Tunisian (crepes, raclette)", address: "2375 Market St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Kapari Restaurant", neighborhood: "Chinatown", cuisine: "Turkish", address: "668 Sacramento St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Izzy & Wooks", neighborhood: "SoMa (Saluhall)", cuisine: "Filipino sandwiches", address: "865 Market St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Grégoire", neighborhood: "Sunset", cuisine: "Sandwiches & takeout", address: "1300 9th Ave", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Studio Golf Bar & Grill", neighborhood: "SoMa", cuisine: "American bar food", address: "350 Mission St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Hamburguesa Bar", neighborhood: "SoMa", cuisine: "Burgers (late-night)", address: "78 2nd St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Angela's Ice Cream", neighborhood: "Cow Hollow", cuisine: "Ice cream", address: "3108 Fillmore St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Alamo Indian Cuisine", neighborhood: "NoPa", cuisine: "Indian/Nepali", address: "1279 Fulton St", openedDate: "January 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },

  // February 2026
  { name: "Goldenette", neighborhood: "Nob Hill", cuisine: "All-day diner", address: "1601 Polk St", openedDate: "February 16, 2026", sourceUrl: "https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026" },
  { name: "Nan Hot Pot SF", neighborhood: "North Beach", cuisine: "Sichuan hot pot", address: "501 Broadway", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Tadaima", neighborhood: "Sunset", cuisine: "Japanese sandwiches & cafe", address: "1248 9th Ave", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Tokyo Cream", neighborhood: "Sunset", cuisine: "Japanese desserts", address: "1838 Irving St", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Timur", neighborhood: "Sunset", cuisine: "Indian/Nepali", address: "1386 9th Ave", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Frankie's", neighborhood: "Marina", cuisine: "Cocktails & bar food", address: "3213 Pierce St", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Kissakeko", neighborhood: "Nob Hill", cuisine: "Sake bar & baked goods", address: "1327 Mason St", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Bar Orso", neighborhood: "SoMa", cuisine: "Cocktails (speakeasy)", address: "1148 Mission St", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Suavecito Birria & Tacos", neighborhood: "Lower Nob Hill", cuisine: "Mexican (birria, tacos)", address: "882 Sutter St", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Khun Mae Thai Noodles", neighborhood: "Tenderloin", cuisine: "Thai noodles", address: "385 Taylor St", openedDate: "February 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },

  // March 2026
  { name: "Maria Isabel", neighborhood: "Presidio Heights", cuisine: "Seafood-focused Mexican", address: "500 Presidio Ave", openedDate: "March 3, 2026", sourceUrl: "https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php" },
  { name: "Rose Pizzeria", neighborhood: "Inner Richmond", cuisine: "Pizza (thin-crust, natural wines)", address: "1 Clement St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "JouJou", neighborhood: "SoMa", cuisine: "French seafood", address: "65 Division St", openedDate: "March 2026", sourceUrl: "https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php" },
  { name: "The Big Four", neighborhood: "Nob Hill", cuisine: "American (classic, reopened)", address: "1075 California St", openedDate: "March 2026", sourceUrl: "https://www.sfgate.com/food/article/big-four-restaurant-review-22096616.php" },
  { name: "Restaurant Naides", neighborhood: "Union Square", cuisine: "Contemporary Filipino", address: "708 Bush St", openedDate: "December 2025", sourceUrl: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  { name: "Lobalita", neighborhood: "Marina", cuisine: "Mexican cantina", address: "2231 Chestnut St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Ka Kai Northern Thai", neighborhood: "Castro", cuisine: "Northern Thai", address: "4133 18th St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Agrodolce Provisions", neighborhood: "SoMa", cuisine: "Italian (pasta-focused)", address: "1016 Bryant St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Kissaten Hifi", neighborhood: "Richmond", cuisine: "Japanese/Filipino coffee & matcha", address: "189 6th Ave", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Clementina", neighborhood: "Richmond", cuisine: "Gluten-free Italian", address: "343 Clement St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Grand Lake Kitchen", neighborhood: "Noe Valley", cuisine: "American", address: "1199 Church St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Go Chicken", neighborhood: "Lakeside/Ingleside", cuisine: "Chinese comfort & chicken", address: "2608 Ocean Ave", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Polly Ann Ice Cream", neighborhood: "Financial District", cuisine: "Ice cream (new location)", address: "120 Pine St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Bollywood Pizza", neighborhood: "SoMa", cuisine: "Indian pizza", address: "215 Fremont St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Loveski", neighborhood: "Jackson Square", cuisine: "Jewish deli", address: "499 Jackson St", openedDate: "March 2026", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },

  // Michelin additions (opened late 2025, recognized March 2026)
  { name: "Wolfsbane", neighborhood: "Dogpatch", cuisine: "California tasting menu (Nordic/Japanese/French)", address: "Dogpatch", openedDate: "October 2025", sourceUrl: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  { name: "Dingles Public House", neighborhood: "Hayes Valley", cuisine: "British pub fare", address: "Inn at the Opera, Hayes Valley", openedDate: "November 2025", sourceUrl: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  { name: "La Cigale", neighborhood: "Glen Park", cuisine: "French-inspired", address: "Glen Park", openedDate: "August 2025", sourceUrl: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },

  // Upcoming spring openings
  { name: "Maillards", neighborhood: "Outer Sunset", cuisine: "Smashburgers & radlers", address: "3821 Noriega St", openedDate: "Spring 2026 (upcoming)", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Bar Coto", neighborhood: "Jackson Square", cuisine: "All-day Italian cafe & bar", address: "596 Pacific Ave", openedDate: "Spring 2026 (upcoming)", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Sol Bakery", neighborhood: "NoPa", cuisine: "Bakery (guava tarts, focaccia)", address: "1696 Hayes St", openedDate: "Spring 2026 (upcoming)", sourceUrl: "https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php" },
  { name: "Tur", neighborhood: "West Portal", cuisine: "Thai brunch", address: "1 W Portal Ave", openedDate: "Spring 2026 (upcoming)", sourceUrl: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Club Deluxe", neighborhood: "Haight", cuisine: "Bar & music venue", address: "Haight St", openedDate: "Spring 2026 (upcoming)", sourceUrl: "https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026" },
];

// Seed events - Mission District and nearby, upcoming
const eventData = [
  // Today / This week
  { title: "Divinity Film Festival", location: "Roxie Theater, 3117 16th St, Mission", date: "March 31, 2026", time: "6:00 PM", description: "Shorts fest highlighting femme voices in film", sourceUrl: "https://roxie.com/calendar/" },
  { title: "Invasion of the Body Snatchers (4K)", location: "Roxie Theater, 3117 16th St, Mission", date: "March 31, 2026", time: "8:30 PM", description: "Celebrating the Roxie's new 4K projector with a classic", sourceUrl: "https://roxie.com/calendar/" },
  { title: "Skaiwater / Baby Osamaa / Vialice", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "March 31, 2026", time: "8:00 PM", description: "Live music", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Chloe Qisha", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 1, 2026", time: "8:00 PM", description: "Popscene presents", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "St. Stupid's Day Parade", location: "Market St, near Mission", date: "April 1, 2026", time: "12:00 PM", description: "Annual absurdist parade through the Financial District", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Palestine 36 (Film)", location: "Roxie Theater, 3117 16th St, Mission", date: "April 2, 2026", time: "6:05 PM", description: "Film screening", sourceUrl: "https://roxie.com/calendar/" },
  { title: "The Thing / The Macks", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 2, 2026", time: "8:00 PM", description: "Goldenvoice presents", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Six Sex", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 3, 2026", time: "9:00 PM", description: "Goldenvoice presents", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Baby Jane", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 4, 2026", time: "9:00 PM", description: "Live music", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },

  // Easter Weekend
  { title: "Easter in the Park & Hunky Jesus Contest", location: "Mission Dolores Park", date: "April 5, 2026", time: "10:00 AM – 4:00 PM", description: "Sisters of Perpetual Indulgence host egg hunt, drag performances, and the legendary Hunky Jesus & Foxy Mary contests. 47th Anniversary.", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Bring Your Own Big Wheel Race", location: "Vermont & 20th St, Potrero Hill (near Mission)", date: "April 5, 2026", time: "All day", description: "Race big wheel tricycles down the curviest street in SF", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },

  // April
  { title: "César Chávez Day Parade & Festival", location: "Mission District (24th St corridor & Dolores Park)", date: "April 11, 2026", time: "10:00 AM – 5:00 PM", description: "Largest event honoring César Chávez in NorCal. Parade at 11am, festival with live performances, lowrider car show, Latin food, dancing.", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Night of Ideas", location: "SF Main Public Library (near Mission)", date: "April 11, 2026", time: "3:00 PM – 12:00 AM", description: "Free day-to-midnight festival exploring art, innovation, and culture", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Fort Mason Night Market", location: "Fort Mason Center", date: "April 17, 2026", time: "5:00 PM – 10:00 PM", description: "Monthly night market with West Coast Craft vendors, food trucks, and live music", sourceUrl: "https://secretsanfrancisco.com/things-to-do-april-sf/" },
  { title: "Earth Day Festival", location: "Yerba Buena Gardens", date: "April 18, 2026", time: "11:00 AM – 2:00 PM", description: "Green Business Expo, live music, vendors. Free.", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "420 Celebration at Hippie Hill", location: "Robin Williams Meadow, Golden Gate Park", date: "April 20, 2026", time: "All day", description: "SF tradition with tens of thousands gathering to celebrate cannabis", sourceUrl: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "The Cribs / Blueland", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 25, 2026", time: "9:00 PM", description: "Popscene presents", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Strawberry Milk Cut + Cathedral Bells", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 26, 2026", time: "7:30 PM", description: "Live music", sourceUrl: "https://www.brickandmortarmusic.com/calendar/" },

  // May
  { title: "San Francisco Carnaval Festival & Parade", location: "Mission District (Harrison St, 17 blocks)", date: "May 23–24, 2026", time: "All day", description: "Free two-day festival spanning 17 blocks with five stages, 50+ performers, 400 vendors, Grand Parade with 3,000+ artists representing Latin America and the Caribbean.", sourceUrl: "https://sf.funcheap.com/city-guide/san-franciscos-spring-festivals-street-fairs/" },
  { title: "Bay to Breakers", location: "From Howard & Main to Great Highway (crosses Mission)", date: "May 17, 2026", time: "8:00 AM", description: "SF's iconic costumed race since 1912. 20,000+ participants.", sourceUrl: "https://sf.funcheap.com/city-guide/san-franciscos-spring-festivals-street-fairs/" },
];

export function seedDatabase() {
  const existingRestaurants = storage.getRestaurants();
  const existingEvents = storage.getEvents();

  if (existingRestaurants.length === 0) {
    for (const r of restaurantData) {
      storage.addRestaurant({ ...r, addedAt: now });
    }
    console.log(`Seeded ${restaurantData.length} restaurants`);
  }

  if (existingEvents.length === 0) {
    for (const e of eventData) {
      storage.addEvent({ ...e, addedAt: now });
    }
    console.log(`Seeded ${eventData.length} events`);
  }
}
