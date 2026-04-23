import { task } from '@renderinc/sdk/workflows'
import { fetchMichelinCaliforniaSelection } from '../cron-refresh/restaurants.js'
import { isCronJobDue } from '../cron-refresh/run.js'
import { getCronRun, markCronRun } from '../../server/storage.js'
import type { NewRestaurant } from '../cron-refresh/types.js'

const MICHELIN_CRON_JOB = 'michelin_california_selection'
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export const fetchMichelinTask = task(
  {
    name: 'fetch-michelin',
    retry: { maxRetries: 2, waitDurationMs: 5000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function fetchMichelin(): Promise<NewRestaurant[]> {
    const run = await getCronRun(MICHELIN_CRON_JOB)
    if (!isCronJobDue(run?.last_ran_at, THREE_DAYS_MS)) {
      console.info('[workflow] michelin check not due, skipping')
      return []
    }
    console.info('[workflow] checking Michelin California selection...')
    const items = await fetchMichelinCaliforniaSelection()
    await markCronRun(MICHELIN_CRON_JOB)
    console.info(`[workflow] Michelin: ${items.length} candidates`)
    return items
  },
)
