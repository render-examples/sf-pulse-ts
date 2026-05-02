export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export type NewRestaurant = {
  name: string;
  neighborhood: string;
  cuisine: string;
  address: string | null;
  opened_date: string;
  highlight_kind?: "opening" | "michelin";
  source_url: string | null;
};

export type NewEvent = {
  title: string;
  location: string;
  date: string;
  time: string | null;
  description: string | null;
  source_url: string | null;
};

export type { RawArticle, RawMenuPage } from "../../server/llm/types.js";
