import { task } from '@renderinc/sdk/workflows'
import { fetchSFist } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

export const fetchSfistTask = task(
  {
    name: 'fetch-sfist',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function fetchSfist(): Promise<NewRestaurant[]> {
    console.info('[workflow] fetching SFist...')
    const items = await fetchSFist([])
    console.info(`[workflow] SFist: ${items.length} candidates`)
    return items
  },
)
