export interface DietaryFlag {
  available: boolean;
  confidence: "confirmed" | "inferred";
}

export interface DietaryFlags {
  gluten_free: DietaryFlag;
  vegan: DietaryFlag;
  vegetarian: DietaryFlag;
}

export interface Restaurant {
  id: number;
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  highlight_kind: "opening" | "michelin";
  source_url: string | null;
  menu_url: string | null;
  menu_checked_at: string | null;
  dietary_flags: DietaryFlags | null;
}

export interface SFEvent {
  id: number;
  title: string;
  location: string;
  date: string;
  time: string | null;
  description: string | null;
  source_url: string | null;
}

export interface InitialData {
  restaurants: Restaurant[];
  events: SFEvent[];
  lastUpdated: string | null;
}
