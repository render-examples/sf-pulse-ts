import { task } from '@renderinc/sdk/workflows'
import { fetchFuncheap } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const fetchFuncheapTask = task(
  {
    name: 'fetch-funcheap',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function runFetchFuncheap(): Promise<NewEvent[]> {
    console.info('[workflow] fetching Funcheap...')
    const items = await fetchFuncheap([])
    console.info(`[workflow] Funcheap: ${items.length} candidates`)
    return items
  },
)
