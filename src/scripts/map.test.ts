import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { groupByNeighborhood, deriveEventNeighborhood } from '../../shared/catalog.js'
import type { Restaurant, SFEvent } from '../../shared/types.js'

function makeRestaurant(overrides: Partial<Restaurant>): Restaurant {
  return {
    id: 1,
    name: 'Test',
    neighborhood: 'Mission',
    cuisine: 'Mexican',
    address: null,
    opened_date: 'April 2026',
    opened_start_date: '2026-04-01',
    opened_end_date: '2026-04-30',
    opened_date_precision: 'month',
    is_upcoming: false,
    highlight_kind: 'opening',
    source_url: null,
    menu_url: null,
    menu_checked_at: null,
    dietary_flags: null,
    ...overrides,
  }
}

function makeEvent(overrides: Partial<SFEvent>): SFEvent {
  return {
    id: 100,
    title: 'Test Event',
    location: 'Mission District',
    date: 'May 1, 2026',
    start_date: '2026-05-01',
    end_date: '2026-05-01',
    date_precision: 'day',
    is_upcoming: true,
    dedupe_key: 'test-1',
    time: '7:00 PM',
    description: null,
    source_url: null,
    ...overrides,
  }
}

describe('map: neighborhood counts after delta updates', () => {
  it('reflects added and removed items', () => {
    const restaurants = [
      makeRestaurant({ id: 1, neighborhood: 'Mission' }),
      makeRestaurant({ id: 2, neighborhood: 'SoMa' }),
    ]
    const next = new Map(restaurants.map((r) => [r.id, r]))
    next.set(3, makeRestaurant({ id: 3, neighborhood: 'Mission' }))
    next.delete(2)
    const updated = Array.from(next.values())

    const groups = groupByNeighborhood(updated, [])
    assert.equal(groups.get('Mission')!.restaurants.length, 2)
    assert.equal(groups.get('SoMa')!.restaurants.length, 0)
  })
})

describe('map: event neighborhood derivation', () => {
  it('maps Fort Mason events to Marina', () => {
    assert.equal(deriveEventNeighborhood({ location: 'Fort Mason Center' }), 'Marina')
  })

  it('maps unknown locations to Other SF', () => {
    assert.equal(deriveEventNeighborhood({ location: 'Random Place' }), 'Other SF')
  })
})
