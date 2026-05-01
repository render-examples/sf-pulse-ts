import { task } from '@renderinc/sdk/workflows'
import { fetchFuncheapRaw } from '../cron-refresh/events.js'
import type { RawArticle } from '../cron-refresh/types.js'

export const fetchFuncheapTask = task(
  {
    name: 'fetch-funcheap',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function runFetchFuncheap(): Promise<RawArticle[]> {
    console.info('[workflow] fetching Funcheap...')
    const items = await fetchFuncheapRaw()
    console.info(`[workflow] Funcheap: ${items.length} raw articles`)
    return items
  },
)
