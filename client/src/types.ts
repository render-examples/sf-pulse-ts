export interface Restaurant {
  id: number;
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  source_url: string | null;
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
