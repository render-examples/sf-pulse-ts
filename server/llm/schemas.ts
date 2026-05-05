import { z } from 'zod'

// ── Restaurant Extraction ──────────────────────────────────────────

export const RestaurantExtractionSchema = z.object({
  restaurants: z.array(
    z.object({
      name: z.string(),
      neighborhood: z.string(),
      cuisine: z.string(),
      address: z.string().nullable(),
      opened_date: z.string(),
    }),
  ),
})

export type RestaurantExtraction = z.infer<typeof RestaurantExtractionSchema>

export const RESTAURANT_EXTRACTION_PROMPT = `You extract information about restaurants opening or recently opened in San Francisco from article text.

Rules:
- Extract ONLY restaurants that are opening, recently opened, or coming soon in San Francisco.
- Skip restaurants that are closing, relocating outside SF, or not in San Francisco.
- "neighborhood": use San Francisco neighborhood names (Mission, SoMa, Design District, Hayes Valley, Marina, etc.). Use "San Francisco" if the neighborhood is unclear.
- "cuisine": be specific when the text says so ("Northern Thai" not just "Thai", "Neapolitan pizza" not just "Pizza"). Default to "New opening" if cuisine is not mentioned.
- "address": include the full street address if present in the text. Use null if no address is mentioned.
- "opened_date": use the most specific date available. Prefer "April 15, 2026" over "April 2026" over "Spring 2026" over "2026". Use the article's publication date as a fallback.
- If multiple articles are provided (delimited by <article> tags), extract restaurants from all of them.
- Return an empty array if no qualifying restaurants are found.`

// ── Event Extraction ───────────────────────────────────────────────

export const EventExtractionSchema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      location: z.string(),
      date: z.string(),
      time: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
})

export type EventExtraction = z.infer<typeof EventExtractionSchema>

export const EVENT_EXTRACTION_PROMPT = `You extract information about events happening in San Francisco from article text.

Rules:
- Extract events happening in San Francisco or the immediate Bay Area venues (Golden Gate Park, Fort Mason, Yerba Buena, etc.).
- "title": use the specific event name, not generic categories like "Concert" or "Festival".
- "location": use the venue name (e.g. "Golden Gate Park", "de Young Museum"), not the full street address.
- "date": use the most specific format available. For single dates: "April 23, 2026". For ranges: "April 23 – 25, 2026".
- "time": if mentioned, use "7:30 PM – 11:00 PM" format. Use null if no time is specified.
- "description": 1-2 sentence summary of the event. Remove boilerplate, promotional language, and ticket/pricing info. Use null if no meaningful description is available.
- Skip recurring/generic listings that don't have a specific date.
- Skip events that are clearly not in the San Francisco area.
- If multiple articles are provided (delimited by <article> tags), extract events from all of them.
- Return an empty array if no qualifying events are found.`

