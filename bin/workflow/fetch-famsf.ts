import { task } from '@renderinc/sdk/workflows'
import { fetchFAMSFRaw } from '../cron-refresh/events.js'
import type { RawArticle } from '../cron-refresh/types.js'

export const fetchFamsfTask = task(
  {
    name: 'fetch-famsf',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function fetchFamsf(): Promise<RawArticle[]> {
    console.info('[workflow] fetching FAMSF...')
    const items = await fetchFAMSFRaw()
    console.info(`[workflow] FAMSF: ${items.length} raw articles`)
    return items
  },
)
