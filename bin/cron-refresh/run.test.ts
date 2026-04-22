import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { settled, dedupRestaurants, dedupEvents } from './run.js'
import type { NewRestaurant, NewEvent } from './types.js'

describe('settled', () => {
  it('returns the value for a fulfilled result', () => {
    const result: PromiseSettledResult<string[]> = {
      status: 'fulfilled',
      value: ['a', 'b'],
    }
    assert.deepStrictEqual(settled(result, 'test', []), ['a', 'b'])
  })

  it('returns fallback for a rejected result', () => {
    const result: PromiseSettledResult<string[]> = {
      status: 'rejected',
      reason: new Error('fail'),
    }
    assert.deepStrictEqual(settled(result, 'test', ['fallback']), ['fallback'])
  })
})

describe('dedupRestaurants', () => {
  it('deduplicates by lowercased name', () => {
    const items: NewRestaurant[] = [
      {
        name: 'Benu',
        neighborhood: 'SoMa',
        cuisine: 'New opening',
        address: null,
        opened_date: 'April 2026',
        source_url: null,
      },
      {
        name: 'benu',
        neighborhood: 'South of Market',
        cuisine: 'Californian',
        address: null,
        opened_date: 'April 2026',
        source_url: null,
      },
    ]
    const result = dedupRestaurants(items)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].name, 'Benu')
  })
})

describe('dedupEvents', () => {
  it('deduplicates by identity key', () => {
    const items: NewEvent[] = [
      {
        title: 'Jazz in the Park',
        location: 'Golden Gate Park',
        date: 'April 25, 2026',
        time: '7pm',
        description: null,
        source_url: null,
      },
      {
        title: 'Jazz in the Park',
        location: 'Golden Gate Park',
        date: 'April 25, 2026',
        time: '7:00 PM',
        description: 'Great jazz',
        source_url: null,
      },
    ]
    const result = dedupEvents(items)
    assert.strictEqual(result.length, 1)
  })
})
