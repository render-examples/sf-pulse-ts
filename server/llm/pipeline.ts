import type { NewRestaurant, NewEvent } from '../../bin/cron-refresh/types.js'
import type { DietaryFlags } from '../storage.js'
import type { LLMClient, RawArticle, RawMenuPage } from './types.js'
import { extractStructured } from './extract.js'
import {
  RestaurantExtractionSchema,
  RESTAURANT_EXTRACTION_PROMPT,
  EventExtractionSchema,
  EVENT_EXTRACTION_PROMPT,
  MenuAnalysisSchema,
  MENU_ANALYSIS_PROMPT,
} from './schemas.js'

const MAX_BATCH_CHARS = 12_000 // ~3K tokens, well under 6K token target

function batchArticles(articles: RawArticle[]): RawArticle[][] {
  const batches: RawArticle[][] = []
  let currentBatch: RawArticle[] = []
  let currentSize = 0

  for (const article of articles) {
    const articleSize = article.bodyText.length + article.title.length + 100
    if (currentBatch.length > 0 && currentSize + articleSize > MAX_BATCH_CHARS) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }
    currentBatch.push(article)
    currentSize += articleSize
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

function formatArticleBatch(articles: RawArticle[]): string {
  if (articles.length === 1) {
    const a = articles[0]
    return `Title: ${a.title}\nURL: ${a.url}\nPublished: ${a.pubDate ?? 'unknown'}\n\n${a.bodyText}`
  }

  return articles
    .map(
      (a) =>
        `<article url="${a.url}">\nTitle: ${a.title}\nPublished: ${a.pubDate ?? 'unknown'}\n\n${a.bodyText}\n</article>`,
    )
    .join('\n\n')
}

export async function extractRestaurantsFromArticles(
  client: LLMClient,
  articles: RawArticle[],
): Promise<NewRestaurant[]> {
  if (articles.length === 0) return []

  const batches = batchArticles(articles)
  const results: NewRestaurant[] = []

  for (const batch of batches) {
    const sourceUrl = batch.length === 1 ? batch[0].url : null
    const extraction = await extractStructured(client, {
      schema: RestaurantExtractionSchema,
      prompt: RESTAURANT_EXTRACTION_PROMPT,
      text: formatArticleBatch(batch),
    })

    if (extraction) {
      for (const r of extraction.restaurants) {
        results.push({
          name: r.name,
          neighborhood: r.neighborhood,
          cuisine: r.cuisine,
          address: r.address,
          opened_date: r.opened_date,
          source_url: sourceUrl,
        })
      }
    }
  }

  return results
}

export async function extractEventsFromArticles(
  client: LLMClient,
  articles: RawArticle[],
): Promise<NewEvent[]> {
  if (articles.length === 0) return []

  const batches = batchArticles(articles)
  const results: NewEvent[] = []

  for (const batch of batches) {
    const sourceUrl = batch.length === 1 ? batch[0].url : null
    const extraction = await extractStructured(client, {
      schema: EventExtractionSchema,
      prompt: EVENT_EXTRACTION_PROMPT,
      text: formatArticleBatch(batch),
    })

    if (extraction) {
      for (const e of extraction.events) {
        results.push({
          title: e.title,
          location: e.location,
          date: e.date,
          time: e.time,
          description: e.description,
          source_url: sourceUrl,
        })
      }
    }
  }

  return results
}

export async function analyzeMenu(
  client: LLMClient,
  page: RawMenuPage,
): Promise<{ dietaryFlags: DietaryFlags; refinedCuisine: string | null } | null> {
  const text = `Restaurant: ${page.restaurantName}\nCurrent cuisine: ${page.currentCuisine}\n\nMenu text:\n${page.text}`

  const extraction = await extractStructured(client, {
    schema: MenuAnalysisSchema,
    prompt: MENU_ANALYSIS_PROMPT,
    text,
  })

  if (!extraction) return null

  return {
    dietaryFlags: extraction.dietary_flags,
    refinedCuisine: extraction.refined_cuisine,
  }
}
