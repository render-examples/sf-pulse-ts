import { task } from '@renderinc/sdk/workflows'
import { settled, dedupRestaurants, dedupEvents } from '../cron-refresh/run.js'
import type { NewRestaurant } from '../cron-refresh/types.js'
import type { RawArticle } from '../cron-refresh/types.js'
import { createLLMClientFromEnv } from '../../server/llm/index.js'
import {
  extractRestaurantsFromArticles,
  extractEventsFromArticles,
} from '../../server/llm/pipeline.js'
import { fetchEaterSfTask } from './fetch-eater-sf.js'
import { fetchSfistTask } from './fetch-sfist.js'
import { fetchMichelinTask } from './fetch-michelin.js'
import { searchRestaurantsTask } from './search-restaurants.js'
import { fetchFuncheapTask } from './fetch-funcheap.js'
import { fetchFamsfTask } from './fetch-famsf.js'
import { fetchCalAcademyTask } from './fetch-cal-academy.js'
import { searchEventsTask } from './search-events.js'
import { applyDiscoveredItemsTask } from './apply-discovered-items.js'

export const dailyRefreshTask = task(
  { name: 'daily-refresh', timeoutSeconds: 600 },
  async function dailyRefresh(): Promise<{
    restaurants: number
    events: number
  }> {
    console.info(
      `[workflow] SF Pulse refresh — ${new Date().toISOString()}`,
    )

    const llm = createLLMClientFromEnv()
    if (llm) {
      console.info('[workflow] LLM client configured, using LLM extraction')
    } else {
      console.info(
        '[workflow] no LLM_API_KEY set, using regex-only sources (SFist, Michelin)',
      )
    }

    // Phase 1: Fetch raw content (parallel)
    console.info('[workflow] fetching restaurant sources...')
    const [eaterRaw, sfist, michelin, ddgRRaw] = await Promise.allSettled([
      fetchEaterSfTask(),
      fetchSfistTask(),
      fetchMichelinTask(),
      searchRestaurantsTask(),
    ])

    const eaterArticles = settled(eaterRaw, 'Eater SF', [] as RawArticle[])
    const sfistItems = settled(sfist, 'SFist', [] as NewRestaurant[])
    const michelinItems = settled(michelin, 'Michelin', [] as NewRestaurant[])
    const ddgRestaurantArticles = settled(
      ddgRRaw,
      'DDG restaurants',
      [] as RawArticle[],
    )

    console.info('[workflow] fetching event sources...')
    const [funcheapRaw, famsfRaw, calAcademyRaw, ddgERaw] =
      await Promise.allSettled([
        fetchFuncheapTask(),
        fetchFamsfTask(),
        fetchCalAcademyTask(),
        searchEventsTask(),
      ])

    const funcheapArticles = settled(
      funcheapRaw,
      'Funcheap',
      [] as RawArticle[],
    )
    const famsfArticles = settled(famsfRaw, 'FAMSF', [] as RawArticle[])
    const calAcademyArticles = settled(
      calAcademyRaw,
      'Cal Academy',
      [] as RawArticle[],
    )
    const ddgEventArticles = settled(
      ddgERaw,
      'DDG events',
      [] as RawArticle[],
    )

    // Phase 2: LLM extraction (parallel, only if LLM available)
    let llmRestaurants: NewRestaurant[] = []
    let llmEvents: import('../cron-refresh/types.js').NewEvent[] = []

    if (llm) {
      console.info('[workflow] running LLM extraction...')
      const [rResult, eResult] = await Promise.allSettled([
        Promise.allSettled([
          extractRestaurantsFromArticles(llm, eaterArticles),
          extractRestaurantsFromArticles(llm, ddgRestaurantArticles),
        ]),
        Promise.allSettled([
          extractEventsFromArticles(llm, funcheapArticles),
          extractEventsFromArticles(llm, famsfArticles),
          extractEventsFromArticles(llm, calAcademyArticles),
          extractEventsFromArticles(llm, ddgEventArticles),
        ]),
      ])

      if (rResult.status === 'fulfilled') {
        for (const r of rResult.value) {
          llmRestaurants.push(...settled(r, 'LLM restaurants', []))
        }
      }

      if (eResult.status === 'fulfilled') {
        for (const e of eResult.value) {
          llmEvents.push(...settled(e, 'LLM events', []))
        }
      }

      console.info(
        `[workflow] LLM extracted: ${llmRestaurants.length} restaurants, ${llmEvents.length} events`,
      )
    }

    // Phase 3: Merge regex + LLM results, dedup
    const restaurants = dedupRestaurants([
      ...sfistItems,
      ...michelinItems,
      ...llmRestaurants,
    ])

    const events = dedupEvents([...llmEvents])

    console.info(
      `[workflow] candidates: ${restaurants.length} restaurants, ${events.length} events`,
    )

    // Phase 4: Persist & notify
    if (restaurants.length > 0 || events.length > 0) {
      await applyDiscoveredItemsTask({ restaurants, events })
    } else {
      console.info('[workflow] nothing new')
    }

    return { restaurants: restaurants.length, events: events.length }
  },
)
