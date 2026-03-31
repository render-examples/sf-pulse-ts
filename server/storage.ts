import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  restaurants,
  events,
  pushSubscriptions,
  dataUpdates,
  type Restaurant,
  type InsertRestaurant,
  type Event,
  type InsertEvent,
  type PushSubscription,
  type InsertPushSubscription,
  type DataUpdate,
  type InsertDataUpdate,
} from "@shared/schema";

const sqlite = new Database("sqlite.db");
sqlite.pragma("journal_mode = WAL");

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    address TEXT,
    opened_date TEXT NOT NULL,
    source_url TEXT,
    added_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    description TEXT,
    source_url TEXT,
    added_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    keys TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS data_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    item_name TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite);

export interface IStorage {
  // Restaurants
  getRestaurants(): Restaurant[];
  addRestaurant(data: InsertRestaurant): Restaurant;
  deleteRestaurant(id: number): void;
  clearRestaurants(): void;

  // Events
  getEvents(): Event[];
  addEvent(data: InsertEvent): Event;
  deleteEvent(id: number): void;
  clearEvents(): void;

  // Push Subscriptions
  getSubscriptions(): PushSubscription[];
  addSubscription(data: InsertPushSubscription): PushSubscription;
  removeSubscription(endpoint: string): void;

  // Data Updates
  getRecentUpdates(limit: number): DataUpdate[];
  addDataUpdate(data: InsertDataUpdate): DataUpdate;
}

export class SqliteStorage implements IStorage {
  getRestaurants(): Restaurant[] {
    return db.select().from(restaurants).all();
  }

  addRestaurant(data: InsertRestaurant): Restaurant {
    return db.insert(restaurants).values(data).returning().get();
  }

  deleteRestaurant(id: number): void {
    db.delete(restaurants).where(eq(restaurants.id, id)).run();
  }

  clearRestaurants(): void {
    db.delete(restaurants).run();
  }

  getEvents(): Event[] {
    return db.select().from(events).all();
  }

  addEvent(data: InsertEvent): Event {
    return db.insert(events).values(data).returning().get();
  }

  deleteEvent(id: number): void {
    db.delete(events).where(eq(events.id, id)).run();
  }

  clearEvents(): void {
    db.delete(events).run();
  }

  getSubscriptions(): PushSubscription[] {
    return db.select().from(pushSubscriptions).all();
  }

  addSubscription(data: InsertPushSubscription): PushSubscription {
    return db.insert(pushSubscriptions).values(data).returning().get();
  }

  removeSubscription(endpoint: string): void {
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
  }

  getRecentUpdates(limit: number): DataUpdate[] {
    return db.select().from(dataUpdates).all().slice(-limit).reverse();
  }

  addDataUpdate(data: InsertDataUpdate): DataUpdate {
    return db.insert(dataUpdates).values(data).returning().get();
  }
}

export const storage = new SqliteStorage();
