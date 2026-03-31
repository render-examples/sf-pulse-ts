import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const restaurants = sqliteTable("restaurants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  neighborhood: text("neighborhood").notNull(),
  cuisine: text("cuisine").notNull(),
  address: text("address"),
  openedDate: text("opened_date").notNull(), // "January 2026", "March 3, 2026", etc.
  sourceUrl: text("source_url"),
  addedAt: text("added_at").notNull(), // ISO timestamp
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  location: text("location").notNull(),
  date: text("date").notNull(), // "April 11, 2026"
  time: text("time"),
  description: text("description"),
  sourceUrl: text("source_url"),
  addedAt: text("added_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  keys: text("keys").notNull(), // JSON string {p256dh, auth}
  createdAt: text("created_at").notNull(),
});

export const dataUpdates = sqliteTable("data_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // "restaurant" | "event"
  itemName: text("item_name").notNull(),
  action: text("action").notNull(), // "added" | "removed" | "updated"
  timestamp: text("timestamp").notNull(),
});

export const insertRestaurantSchema = createInsertSchema(restaurants).omit({ id: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true });
export const insertDataUpdateSchema = createInsertSchema(dataUpdates).omit({ id: true });

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type DataUpdate = typeof dataUpdates.$inferSelect;
export type InsertDataUpdate = z.infer<typeof insertDataUpdateSchema>;
