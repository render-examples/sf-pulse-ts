import { task } from '@renderinc/sdk/workflows'
import { searchWeb } from '../cron-refresh/http.js'
import { stripHtml } from '../cron-refresh/html.js'
import { extractRestaurants } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

export const searchRestaurantsTask = task(
  {
    name: 'search-restaurants',
    retry: { maxRetries: 2, waitDurationMs: 3000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function searchRestaurants(): Promise<NewRestaurant[]> {
    const monthYear = new Date().toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    })
    console.info('[workflow] searching DuckDuckGo for restaurants...')
    const html = await searchWeb(
      `new restaurant openings San Francisco ${monthYear}`,
    )
    const items = extractRestaurants(stripHtml(html), [])
    console.info(`[workflow] DDG restaurants: ${items.length} candidates`)
    return items
  },
)
