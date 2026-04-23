import { task } from '@renderinc/sdk/workflows'
import { searchWeb } from '../cron-refresh/http.js'
import { stripHtml } from '../cron-refresh/html.js'
import { extractEvents } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const searchEventsTask = task(
  {
    name: 'search-events',
    retry: { maxRetries: 2, waitDurationMs: 3000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function searchEvents(): Promise<NewEvent[]> {
    const monthYear = new Date().toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    })
    console.info('[workflow] searching DuckDuckGo for events...')
    const html = await searchWeb(
      `San Francisco events Golden Gate Park concerts ${monthYear}`,
    )
    const items = extractEvents(stripHtml(html), [])
    console.info(`[workflow] DDG events: ${items.length} candidates`)
    return items
  },
)
