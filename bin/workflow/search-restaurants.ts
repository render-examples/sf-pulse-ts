import { task } from '@renderinc/sdk/workflows'
import { searchRestaurantsRaw } from '../cron-refresh/restaurants.js'
import type { RawArticle } from '../cron-refresh/types.js'

export const searchRestaurantsTask = task(
  {
    name: 'search-restaurants',
    retry: { maxRetries: 2, waitDurationMs: 3000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function searchRestaurants(): Promise<RawArticle[]> {
    console.info('[workflow] searching DuckDuckGo for restaurants...')
    const items = await searchRestaurantsRaw()
    console.info(`[workflow] DDG restaurants: ${items.length} raw articles`)
    return items
  },
)
