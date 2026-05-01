import { task } from '@renderinc/sdk/workflows'
import { fetchCalAcademyRaw } from '../cron-refresh/events.js'
import type { RawArticle } from '../cron-refresh/types.js'

export const fetchCalAcademyTask = task(
  {
    name: 'fetch-cal-academy',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function runFetchCalAcademy(): Promise<RawArticle[]> {
    console.info('[workflow] fetching Cal Academy...')
    const items = await fetchCalAcademyRaw()
    console.info(`[workflow] Cal Academy: ${items.length} raw articles`)
    return items
  },
)
