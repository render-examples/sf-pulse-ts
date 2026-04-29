import { task } from '@renderinc/sdk/workflows'
import {
  applyDiscoveredItems,
  type ApplyDiscoveredItemsInput,
  type ApplyDiscoveredItemsResult,
} from '../../server/refresh.js'

export const applyDiscoveredItemsTask = task(
  {
    name: 'apply-discovered-items',
    retry: { maxRetries: 1, waitDurationMs: 5000 },
    timeoutSeconds: 120,
  },
  async function applyItems(
    input: ApplyDiscoveredItemsInput,
  ): Promise<ApplyDiscoveredItemsResult> {
    console.info(
      `[workflow] applying ${input.restaurants?.length ?? 0} restaurants, ${input.events?.length ?? 0} events`,
    )
    try {
      const result = await applyDiscoveredItems(input)
      console.info('[workflow] apply result:', result)
      return result
    } catch (error) {
      console.error(
        '[workflow] applyDiscoveredItems failed:',
        error instanceof Error ? `${error.message}\n${error.stack}` : error,
      )
      throw error
    }
  },
)
