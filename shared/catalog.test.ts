import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  findNearestNeighborhood,
  NEIGHBORHOOD_ALIASES,
  ALL_NEIGHBORHOODS,
  groupByNeighborhood,
} from './catalog.js'
import type { Restaurant, SFEvent } from './types.js'

describe('NEIGHBORHOOD_ALIASES', () => {
  it('all entries have center coordinates within SF bounding box', () => {
    for (const entry of NEIGHBORHOOD_ALIASES) {
      assert.ok(entry.center, `${entry.label} missing center`)
      assert.ok(entry.center.lat >= 37.70 && entry.center.lat <= 37.82, `${entry.label} lat out of range`)
      assert.ok(entry.center.lng >= -122.53 && entry.center.lng <= -122.35, `${entry.label} lng out of range`)
    }
  })
})

describe('ALL_NEIGHBORHOODS', () => {
  it('includes all 12 named neighborhoods plus Other SF', () => {
    assert.equal(ALL_NEIGHBORHOODS.length, 13)
    assert.ok(ALL_NEIGHBORHOODS.some((n) => n.label === 'Other SF'))
  })
})

describe('findNearestNeighborhood()', () => {
  it('returns Mission for a point at 16th & Valencia', () => {
    const result = findNearestNeighborhood(37.7649, -122.4214)
    assert.equal(result.label, 'Mission')
  })

  it('returns Sunset for a point near Ocean Beach', () => {
    const result = findNearestNeighborhood(37.7594, -122.5107)
    assert.equal(result.label, 'Sunset')
  })

  it('returns Marina for a point near Fort Mason', () => {
    const result = findNearestNeighborhood(37.8037, -122.4316)
    assert.equal(result.label, 'Marina')
  })
})

describe('groupByNeighborhood()', () => {
  it('groups restaurants by their neighborhood field', () => {
    const restaurants = [
      { id: 1, neighborhood: 'Mission' },
      { id: 2, neighborhood: 'SoMa' },
      { id: 3, neighborhood: 'Mission' },
    ] as Restaurant[]

    const groups = groupByNeighborhood(restaurants, [])
    assert.equal(groups.get('Mission')!.restaurants.length, 2)
    assert.equal(groups.get('SoMa')!.restaurants.length, 1)
  })

  it('groups events by derived neighborhood', () => {
    const events = [
      { id: 10, location: 'Dolores Park, San Francisco' },
      { id: 11, location: 'Fort Mason Center' },
    ] as SFEvent[]

    const groups = groupByNeighborhood([], events)
    assert.equal(groups.get('Mission')!.events.length, 1)
    assert.equal(groups.get('Marina')!.events.length, 1)
  })

  it('initializes all 13 neighborhoods with empty arrays', () => {
    const groups = groupByNeighborhood([], [])
    assert.equal(groups.size, 13)
    for (const [, group] of groups) {
      assert.equal(group.restaurants.length, 0)
      assert.equal(group.events.length, 0)
    }
  })

  it('puts unknown neighborhoods into Other SF', () => {
    const restaurants = [
      { id: 1, neighborhood: 'Outer Limits' },
    ] as Restaurant[]

    const groups = groupByNeighborhood(restaurants, [])
    assert.equal(groups.get('Other SF')!.restaurants.length, 1)
  })
})
