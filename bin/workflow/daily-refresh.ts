import { task } from '@renderinc/sdk/workflows'
import { settled, dedupRestaurants, dedupEvents } from '../cron-refresh/run.js'
import type { NewRestaurant } from '../cron-refresh/types.js'
import { fetchEaterSfTask } from './fetch-eater-sf.js'
import { fetchSfistTask } from './fetch-sfist.js'
import { fetchMichelinTask } from './fetch-michelin.js'
import { searchRestaurantsTask } from './search-restaurants.js'
import { fetchFuncheapTask } from './fetch-funcheap.js'
import { fetchFamsfTask } from './fetch-famsf.js'
import { fetchCalAcademyTask } from './fetch-cal-academy.js'
import { searchEventsTask } from './search-events.js'
import { applyDiscoveredItemsTask } from './apply-discovered-items.js'
import { discoverMenusTask } from './discover-menus.js'

export const dailyRefreshTask = task(
  { name: 'daily-refresh', timeoutSeconds: 600 },
  async function dailyRefresh(): Promise<{
    restaurants: number
    events: number
    menus: { checked: number; found: number }
  }> {
    console.info(
      `[workflow] SF Pulse refresh — ${new Date().toISOString()}`,
    )

    // Phase 1: Restaurant discovery
    console.info('[workflow] fetching restaurant sources...')
    const [eater, sfist, michelin, ddgR] = await Promise.allSettled([
      fetchEaterSfTask(),
      fetchSfistTask(),
      fetchMichelinTask(),
      searchRestaurantsTask(),
    ])

    const restaurants = dedupRestaurants([
      ...settled(eater, 'Eater SF', [] as NewRestaurant[]),
      ...settled(sfist, 'SFist', [] as NewRestaurant[]),
      ...settled(michelin, 'Michelin', [] as NewRestaurant[]),
      ...settled(ddgR, 'DDG restaurants', [] as NewRestaurant[]),
    ])

    // Phase 2: Event discovery
    console.info('[workflow] fetching event sources...')
    const [funcheap, famsf, calAcademy, ddgE] = await Promise.allSettled([
      fetchFuncheapTask(),
      fetchFamsfTask(),
      fetchCalAcademyTask(),
      searchEventsTask(),
    ])

    const events = dedupEvents([
      ...settled(funcheap, 'Funcheap', []),
      ...settled(famsf, 'FAMSF', []),
      ...settled(calAcademy, 'Cal Academy', []),
      ...settled(ddgE, 'DDG events', []),
    ])

    console.info(
      `[workflow] candidates: ${restaurants.length} restaurants, ${events.length} events`,
    )

    // Phase 3: Persist & notify
    if (restaurants.length > 0 || events.length > 0) {
      await applyDiscoveredItemsTask({ restaurants, events })
    } else {
      console.info('[workflow] nothing new')
    }

    // Phase 4: Menu discovery
    console.info('[workflow] starting menu discovery...')
    const menus = await discoverMenusTask()

    return { restaurants: restaurants.length, events: events.length, menus }
  },
)
