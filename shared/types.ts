export interface Restaurant {
  id: number;
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  opened_start_date: string | null;
  opened_end_date: string | null;
  opened_date_precision:
    | "day"
    | "day_range"
    | "month"
    | "season"
    | "year"
    | "unknown";
  is_upcoming: boolean;
  highlight_kind: "opening" | "michelin";
  source_url: string | null;
}

export interface SFEvent {
  id: number;
  title: string;
  location: string;
  date: string;
  start_date: string | null;
  end_date: string | null;
  date_precision:
    | "day"
    | "day_range"
    | "month"
    | "season"
    | "year"
    | "unknown";
  is_upcoming: boolean;
  dedupe_key: string;
  time: string | null;
  description: string | null;
  source_url: string | null;
}

export interface InitialData {
  restaurants: Restaurant[];
  events: SFEvent[];
  lastUpdated: string | null;
}

export interface PushPreferences {
  neighborhoods: string[];
  cuisines: string[];
  event_categories: string[];
}

export interface RealtimeCollectionEvent<T> {
  version: string | null;
  upserted: T[];
  deleted: number[];
  summary?: string;
}
