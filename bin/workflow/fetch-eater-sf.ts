import { task } from '@renderinc/sdk/workflows'
import { fetchEaterSF } from '../cron-refresh/restaurants.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

export const fetchEaterSfTask = task(
  {
    name: 'fetch-eater-sf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchEaterSf(): Promise<NewRestaurant[]> {
    console.info('[workflow] fetching Eater SF...')
    const items = await fetchEaterSF([])
    console.info(`[workflow] Eater SF: ${items.length} candidates`)
    return items
  },
)
