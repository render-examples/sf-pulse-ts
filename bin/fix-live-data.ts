import { getPool } from '../server/db.js'
import {
  deleteEvent,
  deleteRestaurant,
  getEvents,
  getRestaurants,
  updateEvent,
  updateRestaurant,
  type Event,
  type NewEvent,
  type NewRestaurant,
  type Restaurant,
} from '../server/storage.js'
import { fetchPageHtml } from './cron-refresh/http.js'
import {
  parseEaterArticle,
  parseMichelinGuideRestaurantPage,
} from './cron-refresh/restaurants.js'
import { parseFuncheapEventPage } from './cron-refresh/events.js'
import {
  getDatePrecision,
  normalizeDateText,
  type DatePrecision,
} from '../shared/dates.ts'
import {
  decodeHtmlEntitiesRecursive,
  normalizeEscapedHtmlText,
  normalizeWhitespace,
} from '../shared/html.ts'
import { isBlockedRestaurantName } from '../shared/restaurant-blocklist.ts'

const APPLY = process.argv.includes('--apply')
const ALLOW_DELETE = process.argv.includes('--allow-delete')
const ONLY_BLOCKED_RESTAURANTS = process.argv.includes(
  '--blocked-restaurants-only',
)

const DATE_PRECISION_SCORE: Record<DatePrecision, number> = {
  unknown: 0,
  year: 1,
  season: 2,
  month: 3,
  day_range: 4,
  day: 5,
}

function stripRestaurantDateQualifier(value: string): string {
  const qualifierIndex = value.indexOf('·')
  return qualifierIndex === -1 ? value : value.slice(qualifierIndex + 1).trim()
}

function normalizeRestaurantOpenedDateText(value: string): string {
  const cleaned = value.replace(/\s*\(upcoming\)\s*$/i, '').trim()
  const qualifierIndex = cleaned.indexOf('·')
  if (qualifierIndex === -1) {
    return normalizeDateText(cleaned)
  }

  const qualifier = cleaned.slice(0, qualifierIndex).trim()
  const datePart = cleaned.slice(qualifierIndex + 1).trim()
  return `${qualifier} · ${normalizeDateText(datePart)}`
}

function normalizeRestaurantNameForMatch(value: string): string {
  return normalizeWhitespace(decodeHtmlEntitiesRecursive(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeAddressForMatch(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? '')
    .toLowerCase()
    .replace(/\b(?:san francisco|ca)\b/g, ' ')
    .replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bterrace\b/g, 'ter')
    .replace(/\bsuite\b/g, 'ste')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeEventTitleForMatch(value: string): string {
  return normalizeWhitespace(decodeHtmlEntitiesRecursive(value)).toLowerCase()
}

function normalizeEventLocationForMatch(value: string): string {
  return normalizeWhitespace(decodeHtmlEntitiesRecursive(value)).toLowerCase()
}

function stripFuncheapAttribution(value: string | null): string | null {
  if (!value) {
    return null
  }

  const cleaned = normalizeWhitespace(
    decodeHtmlEntitiesRecursive(value)
      .replace(/\s*The post .*? appeared first on Funcheap\s*\.\s*$/i, '')
      .replace(/^Original Event Description:\s*/i, ''),
  )
  return cleaned ? normalizeEscapedHtmlText(cleaned) : null
}

function restaurantCompletenessScore(
  restaurant: Pick<
    Restaurant,
    'neighborhood' | 'cuisine' | 'address' | 'opened_date'
  >,
): number {
  return [
    restaurant.neighborhood.toLowerCase() !== 'san francisco' ? 3 : 0,
    restaurant.cuisine.toLowerCase() !== 'new opening' ? 3 : 0,
    restaurant.address ? 3 : 0,
    DATE_PRECISION_SCORE[
      getDatePrecision(stripRestaurantDateQualifier(restaurant.opened_date))
    ],
  ].reduce((sum, value) => sum + value, 0)
}

function eventCompletenessScore(
  event: Pick<Event, 'location' | 'date' | 'time' | 'description'>,
): number {
  return [
    event.location.toLowerCase() !== 'san francisco' ? 3 : 0,
    DATE_PRECISION_SCORE[getDatePrecision(event.date)],
    event.time ? 2 : 0,
    event.description ? 2 : 0,
  ].reduce((sum, value) => sum + value, 0)
}

function mergeRestaurant(
  base: Restaurant,
  patch: Partial<NewRestaurant>,
): NewRestaurant {
  const name = patch.name
    ? normalizeWhitespace(decodeHtmlEntitiesRecursive(patch.name))
    : base.name
  const neighborhood = patch.neighborhood
    ? normalizeWhitespace(patch.neighborhood)
    : base.neighborhood
  const cuisine = patch.cuisine
    ? normalizeWhitespace(patch.cuisine)
    : base.cuisine
  const address =
    patch.address === undefined
      ? base.address
      : normalizeWhitespace(patch.address ?? '') || null
  const openedDate = patch.opened_date
    ? normalizeRestaurantOpenedDateText(patch.opened_date)
    : normalizeRestaurantOpenedDateText(base.opened_date)

  return {
    name,
    neighborhood: neighborhood || base.neighborhood,
    cuisine: cuisine || base.cuisine,
    address,
    opened_date: openedDate,
    source_url: patch.source_url ?? base.source_url,
    highlight_kind: patch.highlight_kind ?? base.highlight_kind,
  }
}

function mergeEvent(base: Event, patch: Partial<NewEvent>): NewEvent {
  return {
    title: patch.title
      ? normalizeEscapedHtmlText(patch.title)
      : normalizeEscapedHtmlText(base.title),
    location: patch.location
      ? normalizeWhitespace(decodeHtmlEntitiesRecursive(patch.location))
      : normalizeWhitespace(decodeHtmlEntitiesRecursive(base.location)),
    date: patch.date
      ? normalizeDateText(patch.date)
      : normalizeDateText(base.date),
    time: patch.time ?? base.time,
    description:
      patch.description === undefined
        ? stripFuncheapAttribution(base.description)
        : stripFuncheapAttribution(patch.description),
    source_url: patch.source_url ?? base.source_url,
  }
}

function similarRestaurantIdentity(
  left: Pick<Restaurant, 'name' | 'address'>,
  right: Pick<Restaurant, 'name' | 'address'>,
): boolean {
  const leftAddress = normalizeAddressForMatch(left.address)
  const rightAddress = normalizeAddressForMatch(right.address)
  if (!leftAddress || leftAddress !== rightAddress) {
    return false
  }

  const leftName = normalizeRestaurantNameForMatch(left.name)
  const rightName = normalizeRestaurantNameForMatch(right.name)
  return leftName.includes(rightName) || rightName.includes(leftName)
}

function desiredEventKey(
  event: Pick<Event | NewEvent, 'title' | 'location' | 'date'>,
): string {
  return [
    normalizeEventTitleForMatch(event.title),
    normalizeEventLocationForMatch(event.location),
    normalizeDateText(event.date).toLowerCase(),
  ].join('|')
}

function isDefinitelyNonSanFranciscoEvent(
  event: Pick<Event, 'title' | 'source_url'>,
): boolean {
  const combined = `${event.title} ${event.source_url ?? ''}`.toLowerCase()
  if (/\(sf\)|san francisco/.test(combined)) {
    return false
  }

  if (/\|\s*bay area\b/.test(combined)) {
    return true
  }

  return /\b(?:alameda|berkeley|marin|oakland|petaluma|san jose|walnut creek)\b/.test(
    combined,
  )
}

type RestaurantDecision =
  | { action: 'keep'; next: NewRestaurant }
  | { action: 'delete'; reason: string }

type EventDecision =
  | { action: 'keep'; next: NewEvent }
  | { action: 'delete'; reason: string }

async function enrichRestaurant(
  restaurant: Restaurant,
): Promise<RestaurantDecision> {
  if (isBlockedRestaurantName(restaurant.name)) {
    return {
      action: 'delete',
      reason: 'Blocked non-restaurant label',
    }
  }

  let next = mergeRestaurant(restaurant, {})
  const sourceUrl = restaurant.source_url ?? ''

  if (restaurant.opened_date.includes('(upcoming)')) {
    next = mergeRestaurant(restaurant, {
      ...next,
      opened_date: restaurant.opened_date,
    })
  }

  if (
    sourceUrl.includes(
      'guide.michelin.com/us/en/california/san-francisco/restaurant/',
    )
  ) {
    const html = await fetchPageHtml(sourceUrl)
    const details = html ? parseMichelinGuideRestaurantPage(html) : null
    if (details) {
      next = mergeRestaurant(restaurant, {
        ...next,
        address: next.address ?? details.address,
        cuisine: restaurant.cuisine.toLowerCase().includes('michelin')
          ? details.cuisine
          : next.cuisine,
      })
    }
  }

  if (sourceUrl.includes('sf.eater.com/restaurant-news/')) {
    const html = await fetchPageHtml(sourceUrl)
    const candidates = html
      ? parseEaterArticle(html, [], sourceUrl, next.opened_date)
      : []
    const match = candidates.find((candidate) => {
      const candidateName = normalizeRestaurantNameForMatch(candidate.name)
      const currentName = normalizeRestaurantNameForMatch(restaurant.name)
      return (
        candidateName === currentName ||
        candidateName.includes(currentName) ||
        currentName.includes(candidateName)
      )
    })

    if (match) {
      next = mergeRestaurant(restaurant, { ...next, ...match })
    } else if (
      sourceUrl.includes('san-francisco-bay-area-restaurant-bar-openings') ||
      /napa|menlo-park/.test(sourceUrl)
    ) {
      return {
        action: 'delete',
        reason: 'Out-of-scope or malformed Eater import',
      }
    }
  }

  return { action: 'keep', next }
}

async function enrichEvent(event: Event): Promise<EventDecision> {
  let next = mergeEvent(event, {})
  const sourceUrl = event.source_url ?? ''

  if (
    sourceUrl.startsWith('https://sf.funcheap.com/') &&
    !sourceUrl.includes('/city-guide/')
  ) {
    const html = await fetchPageHtml(sourceUrl)
    const parsed = html ? parseFuncheapEventPage(html, sourceUrl) : null
    if (!parsed && isDefinitelyNonSanFranciscoEvent(event)) {
      return { action: 'delete', reason: 'Out-of-scope Funcheap event' }
    }
    if (parsed) {
      next = mergeEvent(event, parsed)
    }
  }

  return { action: 'keep', next }
}

async function main(): Promise<void> {
  const pool = getPool()
  const restaurants = await getRestaurants(pool)
  const events = await getEvents(pool)

  const restaurantUpdates = new Map<number, NewRestaurant>()
  const restaurantDeletes = new Map<number, string>(
    ONLY_BLOCKED_RESTAURANTS
      ? restaurants
          .filter((restaurant) => isBlockedRestaurantName(restaurant.name))
          .map((restaurant) => [restaurant.id, 'Blocked non-restaurant label'])
      : [],
  )
  const eventUpdates = new Map<number, NewEvent>()
  const eventDeletes = new Map<number, string>()

  if (!ONLY_BLOCKED_RESTAURANTS) {
    for (const restaurant of restaurants) {
      const decision = await enrichRestaurant(restaurant)
      if (decision.action === 'delete') {
        restaurantDeletes.set(restaurant.id, decision.reason)
        continue
      }

      const next = decision.next
      if (
        restaurant.name !== next.name ||
        restaurant.neighborhood !== next.neighborhood ||
        restaurant.cuisine !== next.cuisine ||
        restaurant.address !== (next.address ?? null) ||
        normalizeRestaurantOpenedDateText(restaurant.opened_date) !==
          next.opened_date
      ) {
        restaurantUpdates.set(restaurant.id, next)
      }
    }

    const restaurantRows = restaurants.map((restaurant) => ({
      id: restaurant.id,
      row: restaurantUpdates.get(restaurant.id)
        ? { ...restaurant, ...restaurantUpdates.get(restaurant.id)! }
        : restaurant,
    }))

    for (const left of restaurantRows) {
      if (restaurantDeletes.has(left.id)) continue
      for (const right of restaurantRows) {
        if (left.id >= right.id || restaurantDeletes.has(right.id)) continue
        if (!similarRestaurantIdentity(left.row, right.row)) continue

        const keepLeft =
          restaurantCompletenessScore(left.row) >=
          restaurantCompletenessScore(right.row)
        const keeper = keepLeft ? left : right
        const loser = keepLeft ? right : left
        restaurantDeletes.set(
          loser.id,
          'Duplicate restaurant after normalization',
        )
        restaurantUpdates.set(
          keeper.id,
          mergeRestaurant(keeper.row, {
            name:
              keeper.row.name.length >= loser.row.name.length
                ? keeper.row.name
                : loser.row.name,
            neighborhood:
              keeper.row.neighborhood.toLowerCase() === 'san francisco'
                ? loser.row.neighborhood
                : keeper.row.neighborhood,
            cuisine:
              keeper.row.cuisine.toLowerCase() === 'new opening'
                ? loser.row.cuisine
                : keeper.row.cuisine,
            address: keeper.row.address ?? loser.row.address,
            opened_date:
              DATE_PRECISION_SCORE[
                getDatePrecision(
                  stripRestaurantDateQualifier(keeper.row.opened_date),
                )
              ] >=
              DATE_PRECISION_SCORE[
                getDatePrecision(
                  stripRestaurantDateQualifier(loser.row.opened_date),
                )
              ]
                ? keeper.row.opened_date
                : loser.row.opened_date,
            source_url: keeper.row.source_url ?? loser.row.source_url,
            highlight_kind: keeper.row.highlight_kind,
          }),
        )
      }
    }

    for (const id of restaurantDeletes.keys()) {
      restaurantUpdates.delete(id)
    }

    for (const event of events) {
      const decision = await enrichEvent(event)
      if (decision.action === 'delete') {
        eventDeletes.set(event.id, decision.reason)
        continue
      }

      const next = decision.next
      if (
        event.title !== next.title ||
        event.location !== next.location ||
        normalizeDateText(event.date) !== next.date ||
        event.time !== (next.time ?? null) ||
        (stripFuncheapAttribution(event.description) ?? null) !==
          (next.description ?? null)
      ) {
        eventUpdates.set(event.id, next)
      }
    }

    const candidateEvents = events
      .filter((event) => !eventDeletes.has(event.id))
      .map((event) => ({
        id: event.id,
        row: eventUpdates.get(event.id)
          ? { ...event, ...eventUpdates.get(event.id)! }
          : event,
      }))

    const eventGroups = new Map<string, typeof candidateEvents>()
    for (const event of candidateEvents) {
      const key = desiredEventKey(event.row)
      eventGroups.set(key, [...(eventGroups.get(key) ?? []), event])
    }

    for (const group of eventGroups.values()) {
      if (group.length < 2) continue
      group.sort(
        (left, right) =>
          eventCompletenessScore(right.row) -
            eventCompletenessScore(left.row) || left.id - right.id,
      )
      const keeper = group[0]
      for (const duplicate of group.slice(1)) {
        eventDeletes.set(duplicate.id, 'Duplicate event after normalization')
      }
      eventUpdates.set(
        keeper.id,
        mergeEvent(keeper.row, {
          location:
            keeper.row.location.toLowerCase() === 'san francisco'
              ? group.find(
                  (candidate) =>
                    candidate.row.location.toLowerCase() !== 'san francisco',
                )?.row.location
              : keeper.row.location,
          description:
            group
              .map((candidate) => candidate.row.description)
              .filter((value): value is string => Boolean(value))
              .sort((left, right) => right.length - left.length)[0] ??
            keeper.row.description,
          time:
            keeper.row.time ??
            group.find((candidate) => candidate.row.time)?.row.time ??
            null,
        }),
      )
    }

    for (const id of eventDeletes.keys()) {
      eventUpdates.delete(id)
    }
  }

  const summary = {
    restaurant_updates: restaurantUpdates.size,
    restaurant_deletes: restaurantDeletes.size,
    event_updates: eventUpdates.size,
    event_deletes: eventDeletes.size,
    apply: APPLY,
    allow_delete: ALLOW_DELETE,
    restaurant_update_ids: [...restaurantUpdates.keys()],
    restaurant_delete_candidates: restaurants
      .filter((restaurant) => restaurantDeletes.has(restaurant.id))
      .map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        reason: restaurantDeletes.get(restaurant.id),
      })),
    event_update_ids: [...eventUpdates.keys()],
    event_delete_candidates: events
      .filter((event) => eventDeletes.has(event.id))
      .map((event) => ({
        id: event.id,
        title: event.title,
        reason: eventDeletes.get(event.id),
      })),
  }
  console.info(JSON.stringify(summary, null, 2))

  if (!APPLY) {
    return
  }

  if (!ALLOW_DELETE && (restaurantDeletes.size > 0 || eventDeletes.size > 0)) {
    console.warn(
      'Delete candidates found; rerun with --allow-delete to remove them.',
    )
    return
  }

  for (const id of restaurantDeletes.keys()) {
    await deleteRestaurant(id, pool)
  }
  for (const id of eventDeletes.keys()) {
    await deleteEvent(id, pool)
  }
  for (const [id, next] of restaurantUpdates) {
    await updateRestaurant(id, next, pool)
  }
  for (const [id, next] of eventUpdates) {
    await updateEvent(id, next, pool)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await getPool().end()
    } catch {
      // Ignore shutdown failures.
    }
  })
