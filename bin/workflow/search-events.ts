import { task } from '@renderinc/sdk/workflows'
import { searchEventsRaw } from '../cron-refresh/events.js'
import type { RawArticle } from '../cron-refresh/types.js'

export const searchEventsTask = task(
  {
    name: 'search-events',
    retry: { maxRetries: 2, waitDurationMs: 3000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function searchEvents(): Promise<RawArticle[]> {
    console.info('[workflow] searching DuckDuckGo for events...')
    const items = await searchEventsRaw()
    console.info(`[workflow] DDG events: ${items.length} raw articles`)
    return items
  },
)
