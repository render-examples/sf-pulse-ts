import { query, execute } from "./db.js";
import * as storage from "./storage.js";

const restaurantData: Omit<storage.Restaurant, "id" | "added_at">[] = [
  // January 2026
  { name: "RT Bistro", neighborhood: "Hayes Valley", cuisine: "American bistro (wood-fired)", address: "205 Oak St", opened_date: "January 9, 2026", source_url: "https://www.7x7.com/excellent-new-restaurant-rt-bistro-2675268285.html" },
  { name: "The Buddha", neighborhood: "SoMa", cuisine: "Music venue & bar", address: "333 11th St", opened_date: "January 2026", source_url: "https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026" },
  { name: "Burger Stack", neighborhood: "Mission", cuisine: "Burgers", address: "2956 24th St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Bar Jamón", neighborhood: "Civic Center", cuisine: "Spanish tapas", address: "100 Van Ness Ave", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Gada", neighborhood: "Castro", cuisine: "Tunisian (crepes, raclette)", address: "2375 Market St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Kapari Restaurant", neighborhood: "Chinatown", cuisine: "Turkish", address: "668 Sacramento St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Izzy & Wooks", neighborhood: "SoMa (Saluhall)", cuisine: "Filipino sandwiches", address: "865 Market St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Grégoire", neighborhood: "Sunset", cuisine: "Sandwiches & takeout", address: "1300 9th Ave", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Studio Golf Bar & Grill", neighborhood: "SoMa", cuisine: "American bar food", address: "350 Mission St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Hamburguesa Bar", neighborhood: "SoMa", cuisine: "Burgers (late-night)", address: "78 2nd St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Angela's Ice Cream", neighborhood: "Cow Hollow", cuisine: "Ice cream", address: "3108 Fillmore St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Alamo Indian Cuisine", neighborhood: "NoPa", cuisine: "Indian/Nepali", address: "1279 Fulton St", opened_date: "January 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  // February 2026
  { name: "Goldenette", neighborhood: "Nob Hill", cuisine: "All-day diner", address: "1601 Polk St", opened_date: "February 16, 2026", source_url: "https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026" },
  { name: "Nan Hot Pot SF", neighborhood: "North Beach", cuisine: "Sichuan hot pot", address: "501 Broadway", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Tadaima", neighborhood: "Sunset", cuisine: "Japanese sandwiches & cafe", address: "1248 9th Ave", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Tokyo Cream", neighborhood: "Sunset", cuisine: "Japanese desserts", address: "1838 Irving St", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Timur", neighborhood: "Sunset", cuisine: "Indian/Nepali", address: "1386 9th Ave", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Frankie's", neighborhood: "Marina", cuisine: "Cocktails & bar food", address: "3213 Pierce St", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Kissakeko", neighborhood: "Nob Hill", cuisine: "Sake bar & baked goods", address: "1327 Mason St", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Bar Orso", neighborhood: "SoMa", cuisine: "Cocktails (speakeasy)", address: "1148 Mission St", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Suavecito Birria & Tacos", neighborhood: "Lower Nob Hill", cuisine: "Mexican (birria, tacos)", address: "882 Sutter St", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Khun Mae Thai Noodles", neighborhood: "Tenderloin", cuisine: "Thai noodles", address: "385 Taylor St", opened_date: "February 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  // March 2026
  { name: "Maria Isabel", neighborhood: "Presidio Heights", cuisine: "Seafood-focused Mexican", address: "500 Presidio Ave", opened_date: "March 3, 2026", source_url: "https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php" },
  { name: "Rose Pizzeria", neighborhood: "Inner Richmond", cuisine: "Pizza (thin-crust, natural wines)", address: "1 Clement St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "JouJou", neighborhood: "SoMa", cuisine: "French seafood", address: "65 Division St", opened_date: "March 2026", source_url: "https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php" },
  { name: "The Big Four", neighborhood: "Nob Hill", cuisine: "American (classic, reopened)", address: "1075 California St", opened_date: "March 2026", source_url: "https://www.sfgate.com/food/article/big-four-restaurant-review-22096616.php" },
  { name: "Restaurant Naides", neighborhood: "Union Square", cuisine: "Contemporary Filipino", address: "708 Bush St", opened_date: "December 2025", source_url: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  { name: "Lobalita", neighborhood: "Marina", cuisine: "Mexican cantina", address: "2231 Chestnut St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Ka Kai Northern Thai", neighborhood: "Castro", cuisine: "Northern Thai", address: "4133 18th St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Agrodolce Provisions", neighborhood: "SoMa", cuisine: "Italian (pasta-focused)", address: "1016 Bryant St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Kissaten Hifi", neighborhood: "Richmond", cuisine: "Japanese/Filipino coffee & matcha", address: "189 6th Ave", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Clementina", neighborhood: "Richmond", cuisine: "Gluten-free Italian", address: "343 Clement St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Grand Lake Kitchen", neighborhood: "Noe Valley", cuisine: "American", address: "1199 Church St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Go Chicken", neighborhood: "Lakeside/Ingleside", cuisine: "Chinese comfort & chicken", address: "2608 Ocean Ave", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Polly Ann Ice Cream", neighborhood: "Financial District", cuisine: "Ice cream (new location)", address: "120 Pine St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Bollywood Pizza", neighborhood: "SoMa", cuisine: "Indian pizza", address: "215 Fremont St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  { name: "Loveski", neighborhood: "Jackson Square", cuisine: "Jewish deli", address: "499 Jackson St", opened_date: "March 2026", source_url: "https://www.theinfatuation.com/san-francisco/guides/new-san-francisco-restaurant-openings" },
  // Michelin-recognized (late 2025)
  { name: "Wolfsbane", neighborhood: "Dogpatch", cuisine: "California tasting menu (Nordic/Japanese/French)", address: null, opened_date: "October 2025", source_url: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  { name: "Dingles Public House", neighborhood: "Hayes Valley", cuisine: "British pub fare", address: null, opened_date: "November 2025", source_url: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  { name: "La Cigale", neighborhood: "Glen Park", cuisine: "French-inspired", address: null, opened_date: "August 2025", source_url: "https://www.sfgate.com/food/article/california-michelin-guide-2026-22096151.php" },
  // Spring 2026 upcoming
  { name: "Maillards", neighborhood: "Outer Sunset", cuisine: "Smashburgers & radlers", address: "3821 Noriega St", opened_date: "Spring 2026 (upcoming)", source_url: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Bar Coto", neighborhood: "Jackson Square", cuisine: "All-day Italian cafe & bar", address: "596 Pacific Ave", opened_date: "Spring 2026 (upcoming)", source_url: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Sol Bakery", neighborhood: "NoPa", cuisine: "Bakery (guava tarts, focaccia)", address: "1696 Hayes St", opened_date: "Spring 2026 (upcoming)", source_url: "https://www.sfchronicle.com/food/restaurants/article/openings-new-bay-area-2026-21266878.php" },
  { name: "Tur", neighborhood: "West Portal", cuisine: "Thai brunch", address: "1 W Portal Ave", opened_date: "Spring 2026 (upcoming)", source_url: "https://www.theinfatuation.com/san-francisco/guides/san-francisco-spring-restaurant-openings-2026" },
  { name: "Club Deluxe", neighborhood: "Haight", cuisine: "Bar & music venue", address: null, opened_date: "Spring 2026 (upcoming)", source_url: "https://www.eddies-list.com/p/san-francisco-bay-area-new-restaurants-2026" },
];

const eventData: Omit<storage.Event, "id" | "added_at">[] = [
  { title: "Divinity Film Festival", location: "Roxie Theater, 3117 16th St, Mission", date: "March 31, 2026", time: "6:00 PM", description: "Shorts fest highlighting femme voices in film", source_url: "https://roxie.com/calendar/" },
  { title: "Invasion of the Body Snatchers (4K)", location: "Roxie Theater, 3117 16th St, Mission", date: "March 31, 2026", time: "8:30 PM", description: "Celebrating the Roxie's new 4K projector with a classic", source_url: "https://roxie.com/calendar/" },
  { title: "Skaiwater / Baby Osamaa / Vialice", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "March 31, 2026", time: "8:00 PM", description: "Live music", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Chloe Qisha", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 1, 2026", time: "8:00 PM", description: "Popscene presents", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "St. Stupid's Day Parade", location: "Market St, near Mission", date: "April 1, 2026", time: "12:00 PM", description: "Annual absurdist parade through the Financial District", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Palestine 36 (Film)", location: "Roxie Theater, 3117 16th St, Mission", date: "April 2, 2026", time: "6:05 PM", description: "Film screening", source_url: "https://roxie.com/calendar/" },
  { title: "The Thing / The Macks", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 2, 2026", time: "8:00 PM", description: "Goldenvoice presents", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Six Sex", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 3, 2026", time: "9:00 PM", description: "Goldenvoice presents", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Baby Jane", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 4, 2026", time: "9:00 PM", description: "Live music", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "MAPP — Mission Arts Performance Project", location: "Multiple venues near 24th St, Mission", date: "April 4, 2026", time: "6:00 PM – 11:59 PM", description: "Free art, poetry & concert crawl through the Mission", source_url: "https://sf.funcheap.com/mapp-sfs-free-art-poetry-concert-crawl-in-the-mission-april-2026/" },
  { title: "Easter in the Park & Hunky Jesus Contest", location: "Mission Dolores Park", date: "April 5, 2026", time: "10:00 AM – 4:00 PM", description: "Sisters of Perpetual Indulgence: egg hunt, drag performances, Hunky Jesus & Foxy Mary contests. 47th Anniversary.", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Bring Your Own Big Wheel Race", location: "Vermont & 20th St, Potrero Hill", date: "April 5, 2026", time: "All day", description: "Race big wheel tricycles down the curviest street in SF", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "César Chávez Day Parade & Festival", location: "Mission District (24th St corridor & Dolores Park)", date: "April 11, 2026", time: "10:00 AM – 5:00 PM", description: "Largest NorCal event honoring César Chávez. Parade at 11am, festival with live performances, lowrider car show, Latin food, dancing.", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Night of Ideas", location: "SF Main Public Library (near Mission)", date: "April 11, 2026", time: "3:00 PM – 12:00 AM", description: "Free day-to-midnight festival exploring art, innovation, and culture", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "Fort Mason Night Market", location: "Fort Mason Center", date: "April 17, 2026", time: "5:00 PM – 10:00 PM", description: "Monthly night market: West Coast Craft vendors, food trucks, live music", source_url: "https://secretsanfrancisco.com/things-to-do-april-sf/" },
  { title: "Earth Day Festival", location: "Yerba Buena Gardens", date: "April 18, 2026", time: "11:00 AM – 2:00 PM", description: "Green Business Expo, live music, vendors. Free.", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "420 Celebration at Hippie Hill", location: "Robin Williams Meadow, Golden Gate Park", date: "April 20, 2026", time: "All day", description: "SF tradition with tens of thousands gathering to celebrate cannabis", source_url: "https://sf.funcheap.com/city-guide/san-francisco-april-festivals-street-fairs/" },
  { title: "The Cribs / Blueland", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 25, 2026", time: "9:00 PM", description: "Popscene presents", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "Strawberry Milk Cut + Cathedral Bells", location: "Brick & Mortar Music Hall, 1710 Mission St", date: "April 26, 2026", time: "7:30 PM", description: "Live music", source_url: "https://www.brickandmortarmusic.com/calendar/" },
  { title: "San Francisco Carnaval Festival & Parade", location: "Mission District (Harrison St, 17 blocks)", date: "May 23–24, 2026", time: "All day", description: "Free two-day festival spanning 17 blocks with five stages, 50+ performers, 400 vendors, Grand Parade with 3,000+ artists.", source_url: "https://sf.funcheap.com/city-guide/san-franciscos-spring-festivals-street-fairs/" },
  { title: "Bay to Breakers", location: "Howard & Main to Great Highway (crosses Mission)", date: "May 17, 2026", time: "8:00 AM", description: "SF's iconic costumed race since 1912. 20,000+ participants.", source_url: "https://sf.funcheap.com/city-guide/san-franciscos-spring-festivals-street-fairs/" },
];

export async function seedDatabase(): Promise<void> {
  const existing = await query<{ count: string }>("SELECT COUNT(*) as count FROM restaurants");
  if (parseInt(existing[0].count, 10) > 0) {
    console.log("[seed] database already seeded, skipping");
    return;
  }

  for (const r of restaurantData) {
    await storage.addRestaurant(r);
  }
  for (const e of eventData) {
    await storage.addEvent(e);
  }
  console.log(`[seed] inserted ${restaurantData.length} restaurants, ${eventData.length} events`);
}
