import { task } from '@renderinc/sdk/workflows'
import { fetchFAMSF } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const fetchFamsfTask = task(
  {
    name: 'fetch-famsf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function fetchFamsf(): Promise<NewEvent[]> {
    console.info('[workflow] fetching FAMSF...')
    const items = await fetchFAMSF([])
    console.info(`[workflow] FAMSF: ${items.length} candidates`)
    return items
  },
)
