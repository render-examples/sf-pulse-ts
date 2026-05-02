import { task } from '@renderinc/sdk/workflows'
import { fetchEaterSFRaw } from '../cron-refresh/restaurants.js'
import type { RawArticle } from '../cron-refresh/types.js'

export const fetchEaterSfTask = task(
  {
    name: 'fetch-eater-sf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchEaterSf(): Promise<RawArticle[]> {
    console.info('[workflow] fetching Eater SF...')
    const items = await fetchEaterSFRaw()
    console.info(`[workflow] Eater SF: ${items.length} raw articles`)
    return items
  },
)
