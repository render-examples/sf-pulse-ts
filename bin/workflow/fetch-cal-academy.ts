import { task } from '@renderinc/sdk/workflows'
import { fetchCalAcademy } from '../cron-refresh/events.js'
import type { NewEvent } from '../cron-refresh/types.js'

export const fetchCalAcademyTask = task(
  {
    name: 'fetch-cal-academy',
    retry: { maxRetries: 3, waitDurationMs: 2000, backoffScaling: 2 },
    timeoutSeconds: 60,
  },
  async function runFetchCalAcademy(): Promise<NewEvent[]> {
    console.info('[workflow] fetching Cal Academy...')
    const items = await fetchCalAcademy([])
    console.info(`[workflow] Cal Academy: ${items.length} candidates`)
    return items
  },
)
