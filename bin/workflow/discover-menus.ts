import { task } from '@renderinc/sdk/workflows'
import {
  getRestaurantsNeedingMenuCheck,
  updateRestaurantMenu,
} from '../../server/storage.js'
import { discoverMenu } from '../cron-refresh/menu.js'

export const discoverMenusTask = task(
  {
    name: 'discover-menus',
    retry: { maxRetries: 1, waitDurationMs: 5000 },
    timeoutSeconds: 300,
  },
  async function discoverMenus(): Promise<{ checked: number; found: number }> {
    const restaurants = await getRestaurantsNeedingMenuCheck()
    console.info(
      `[workflow] ${restaurants.length} restaurants need menu check`,
    )

    let found = 0
    for (const restaurant of restaurants) {
      try {
        console.info(`[workflow] checking menu for: ${restaurant.name}`)
        const { menuUrl, dietaryFlags } = await discoverMenu(restaurant.name)
        await updateRestaurantMenu(restaurant.id, menuUrl, dietaryFlags)
        if (menuUrl) found++
      } catch (error) {
        console.error(
          `[workflow] menu check failed for ${restaurant.name}:`,
          error,
        )
      }
    }

    console.info(
      `[workflow] menu discovery: checked ${restaurants.length}, found ${found}`,
    )
    return { checked: restaurants.length, found }
  },
)
